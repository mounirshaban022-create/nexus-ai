import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { extractPdfText } from '@/lib/pdf-text'

export const maxDuration = 60

/**
 * KNOWLEDGE BASE — persistent RAG library (AnythingLLM / Open WebUI pattern).
 *
 * Upload documents (PDF/DOCX/TXT/MD/CSV) → parse to text → chunk with
 * overlap → store in SQLite. Retrieval + cited answers live in
 * /api/kb/chat.
 *
 * GET    /api/kb        → list documents with stats
 * POST   /api/kb        → multipart file upload  OR  { title, text }
 * DELETE /api/kb?id=    → delete one document (chunks cascade)
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_CHUNKS_PER_DOC = 500
const MAX_DOCS = 80
const CHUNK_SIZE = 900 // target characters per chunk
const CHUNK_OVERLAP = 140 // trailing overlap so ideas are not cut mid-thought

/* ------------------------------- chunking ------------------------------- */

/**
 * Sentence-aware chunker: accumulates paragraph/sentence fragments until
 * ~CHUNK_SIZE chars, then closes the chunk. A trailing overlap window is
 * carried into the next chunk so retrieved passages stay readable.
 */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []

  // Split into sentence-ish units (keep it dependency-free).
  const units = clean
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'\u0600-\u06FF])|\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const unit of units) {
    // A single unit larger than the chunk size gets hard-split.
    if (unit.length > CHUNK_SIZE) {
      if (current.trim()) {
        chunks.push(current.trim())
        current = ''
      }
      for (let i = 0; i < unit.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(unit.slice(i, i + CHUNK_SIZE).trim())
        if (i + CHUNK_SIZE >= unit.length) break
      }
      continue
    }
    if (current.length + unit.length + 1 > CHUNK_SIZE) {
      chunks.push(current.trim())
      // carry overlap tail into the next chunk
      const tail = current.slice(-CHUNK_OVERLAP)
      current = `${tail} ${unit}`
    } else {
      current = current ? `${current} ${unit}` : unit
    }
  }
  if (current.trim()) chunks.push(current.trim())

  return chunks.slice(0, MAX_CHUNKS_PER_DOC)
}

/* ------------------------------- parsing -------------------------------- */

async function parseUpload(file: File): Promise<{ text: string; format: string }> {
  const name = file.name.toLowerCase()
  const buf = Buffer.from(await file.arrayBuffer())

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { text } = await extractPdfText(buf)
    return { text, format: 'pdf' }
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer: buf })
    return { text: value, format: 'docx' }
  }
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return { text: buf.toString('utf8'), format: 'md' }
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    return { text: buf.toString('utf8'), format: 'csv' }
  }
  // txt and everything text-like
  return { text: buf.toString('utf8'), format: 'txt' }
}

/* --------------------------------- GET ---------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req)
    const userId = user ? user.id : null

    const docs = await db.knowledgeDoc.findMany({
      where: userId ? { userId } : { userId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        title: true,
        format: true,
        size: true,
        chunkCount: true,
        status: true,
        error: true,
        createdAt: true,
      },
    })

    const totals = {
      docs: docs.length,
      chunks: docs.reduce((n, d) => n + d.chunkCount, 0),
      bytes: docs.reduce((n, d) => n + d.size, 0),
    }

    return NextResponse.json({ docs, totals })
  } catch (error) {
    console.error('[api/kb] GET error:', error)
    return NextResponse.json({ error: 'Failed to load the knowledge base.' }, { status: 500 })
  }
}

/* --------------------------------- POST --------------------------------- */

const textSchema = z.object({
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(500_000),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`kb-upload:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Upload limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    const user = await getCurrentUser(req)
    const userId = user ? user.id : null

    // Cap library size
    const existing = await db.knowledgeDoc.count({ where: userId ? { userId } : { userId: null } })
    if (existing >= MAX_DOCS) {
      return NextResponse.json(
        { error: `Knowledge base is full (max ${MAX_DOCS} documents). Delete one first.` },
        { status: 400 }
      )
    }

    const contentType = req.headers.get('content-type') ?? ''

    let filename: string
    let title: string
    let text: string
    let format: string
    let size: number

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file received.' }, { status: 400 })
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'File is larger than 10MB.' }, { status: 400 })
      }
      filename = file.name
      title = filename.replace(/\.[^.]+$/, '').slice(0, 200) || filename
      try {
        const parsed = await parseUpload(file)
        text = parsed.text
        format = parsed.format
      } catch (err) {
        console.error('[api/kb] parse failed:', err)
        return NextResponse.json(
          { error: 'Could not read this file. Supported: PDF, DOCX, TXT, MD, CSV.' },
          { status: 400 }
        )
      }
      size = file.size
    } else {
      const parsed = textSchema.safeParse(await req.json())
      if (!parsed.success) {
        return NextResponse.json({ error: 'Provide a title and text (max 500k chars).' }, { status: 400 })
      }
      filename = `${parsed.data.title}.txt`
      title = parsed.data.title
      text = parsed.data.text
      format = 'txt'
      size = Buffer.byteLength(text, 'utf8')
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'No readable text found in this file (scanned PDFs without a text layer are not supported).' },
        { status: 400 }
      )
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Document produced no readable content.' }, { status: 400 })
    }

    const doc = await db.knowledgeDoc.create({
      data: {
        userId,
        filename: filename.slice(0, 240),
        title: title.slice(0, 200),
        format,
        size,
        chunkCount: chunks.length,
        status: 'ready',
        chunks: {
          create: chunks.map((content, idx) => ({ idx, content })),
        },
      },
      select: { id: true, filename: true, title: true, format: true, size: true, chunkCount: true, status: true, createdAt: true },
    })

    return NextResponse.json({ doc })
  } catch (error) {
    console.error('[api/kb] POST error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/* -------------------------------- DELETE -------------------------------- */

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    }
    const user = await getCurrentUser(req)
    const userId = user ? user.id : null

    const doc = await db.knowledgeDoc.findUnique({ where: { id }, select: { userId: true } })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }
    // Ownership: signed-in users may only delete their own docs; guests only global ones.
    if (userId ? doc.userId !== userId : doc.userId !== null) {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
    }

    await db.knowledgeDoc.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/kb] DELETE error:', error)
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 })
  }
}
