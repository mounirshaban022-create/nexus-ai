import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { writeFile, readFile, mkdir } from 'fs/promises'
import path from 'path'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { smartChat } from '@/lib/smart-chat'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const maxDuration = 120

/**
 * DOCUMENT INTELLIGENCE — Claude-level document handling.
 * Upload any document → parse → analyze → chat → edit → export.
 * 
 * POST /api/documents (upload + parse)
 * GET  /api/documents?id= (get parsed)
 * PUT  /api/documents (edit + re-export)
 */

const UPLOAD_DIR = path.join(process.cwd(), 'generated-documents')

interface ParsedDoc {
  id: string
  filename: string
  format: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md' | 'csv'
  title: string
  text: string
  sections: Array<{ heading: string; content: string }>
  tables: Array<{ caption: string; rows: string[][] }>
  metadata: {
    pages?: number
    wordCount: number
    charCount: number
    readingTime: number
    sheetNames?: string[]
    slideCount?: number
  }
  uploadedAt: string
}

// In-memory doc store (per-session)
const globalForDocs = globalThis as unknown as { docStore?: Map<string, ParsedDoc> }
const docStore = globalForDocs.docStore ?? (globalForDocs.docStore = new Map<string, ParsedDoc>())

const requestSchema = z.object({
  file: z.string().min(20).max(40_000_000), // base64
  filename: z.string().min(1).max(200),
  format: z.enum(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv']),
})

function extractSections(text: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = []
  const lines = text.split('\n')
  let currentHeading = 'Document Start'
  let currentContent: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Heuristic: short lines without ending punctuation = headings
    const isHeading =
      (trimmed.length > 2 && trimmed.length < 80 && !/[.!?]$/.test(trimmed) && /^[A-Z\u0600-\u06FF]/.test(trimmed)) ||
      /^#{1,4}\s/.test(trimmed)
    if (isHeading) {
      if (currentContent.some((l) => l.trim())) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() })
      }
      currentHeading = trimmed.replace(/^#{1,4}\s/, '')
      currentContent = []
    } else if (trimmed) {
      currentContent.push(line)
    }
  }
  if (currentContent.some((l) => l.trim())) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() })
  }
  return sections.slice(0, 30)
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`doc-upload:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many uploads. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid file. Supported: PDF, Word, Excel, PowerPoint, TXT, MD, CSV (max 12MB).' }, { status: 400 })
    }

    const { file, filename, format } = parsed.data
    const buffer = Buffer.from(
      file.includes(',') && file.startsWith('data:') ? file.split(',')[1] : file,
      'base64'
    )

    let text = ''
    const metadata: ParsedDoc['metadata'] = { wordCount: 0, charCount: 0, readingTime: 0 }
    let tables: Array<{ caption: string; rows: string[][] }> = []

    if (format === 'pdf') {
      // pdftotext (poppler) — battle-tested, zero JS deps
      const { writeFile, unlink } = await import('fs/promises')
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)
      const tmpPath = path.join((await import('os')).tmpdir(), `nexus-doc-${Date.now()}.pdf`)
      await writeFile(tmpPath, buffer)
      try {
        // Validate it's actually a PDF before parsing
        if (!buffer.slice(0, 5).toString().startsWith('%PDF-')) {
          throw new Error('This file is not a valid PDF. It may be corrupted or in a different format.')
        }

        // PRIMARY: pdftotext (poppler) — fast, reliable for text PDFs.
        try {
          const { stdout } = await execFileAsync('pdftotext', ['-layout', tmpPath, '-'], { timeout: 30000 })
          text = stdout
        } catch (pdftotextErr) {
          // pdftotext failed (possibly encrypted/complex). Don't give up yet —
          // try the pdf-parse library as a second engine before declaring failure.
          console.warn('[documents] pdftotext failed, trying pdf-parse:', pdftotextErr instanceof Error ? pdftotextErr.message : pdftotextErr)
        }

        // FALLBACK 1: pdf-parse (pure-JS, handles some PDFs poppler can't)
        if (!text.trim()) {
          try {
            const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string; numpages: number; info?: any }>
            const data = await pdfParse(buffer)
            text = data.text ?? ''
            if (data.numpages) metadata.pages = data.numpages
          } catch (parseErr) {
            console.warn('[documents] pdf-parse also failed:', parseErr instanceof Error ? parseErr.message : parseErr)
          }
        }

        // FALLBACK 2: OCR for scanned/image-only PDFs
        if (!text.trim()) {
          try {
            const imgDir = (await import('os')).tmpdir()
            const baseName = `nexus-ocr-${Date.now()}`
            await execFileAsync('pdftoppm', ['-png', '-r', '200', '-l', '5', tmpPath, `${imgDir}/${baseName}`], { timeout: 60000 })
            const { readdir } = await import('fs/promises')
            const files = (await readdir(imgDir)).filter(f => f.startsWith(baseName)).sort()
            let ocrText = ''
            for (const f of files.slice(0, 5)) {
              try {
                const { stdout: pageText } = await execFileAsync('tesseract', [`${imgDir}/${f}`, '-', '-l', 'eng'], { timeout: 30000 })
                ocrText += pageText + '\n\n'
              } catch { /* page OCR failed, skip */ }
              unlink(`${imgDir}/${f}`).catch(() => {})
            }
            if (ocrText.trim()) {
              text = ocrText
            }
          } catch (ocrErr) {
            console.warn('[documents] OCR fallback failed:', ocrErr instanceof Error ? ocrErr.message : ocrErr)
          }
        }

        if (!text.trim()) {
          throw new Error('No text could be extracted from this PDF. It may be a scanned document, password-protected, or contain no readable text. Try a different file.')
        }

        // Count pages via pdfinfo (best-effort)
        if (!metadata.pages) {
          try {
            const { stdout: info } = await execFileAsync('pdfinfo', [tmpPath])
            const pagesMatch = info.match(/Pages:\s+(\d+)/)
            if (pagesMatch) metadata.pages = parseInt(pagesMatch[1])
          } catch { /* pdfinfo optional */ }
        }
      } catch (pdfError) {
        // Re-throw the specific user-facing messages we crafted above;
        // they carry real detail instead of a generic "could not read".
        throw pdfError
      } finally {
        unlink(tmpPath).catch(() => {})
      }
    } else if (format === 'docx') {
      const { extractRawText } = await import('mammoth')
      const result = await extractRawText({ buffer })
      text = result.value
    } else if (format === 'xlsx') {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      metadata.sheetNames = wb.SheetNames
      const parts: string[] = []
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false })
        if (rows.length > 0) {
          parts.push(`## Sheet: ${name}\n${rows.map((r) => r.join(' | ')).join('\n')}`)
          if (rows.length > 1) {
            tables.push({ caption: name, rows: rows.slice(0, 20).map((r) => r.map(String)) })
          }
        }
      }
      text = parts.join('\n\n')
    } else if (format === 'pptx') {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => parseInt(a.match(/slide(\d+)/)![1]) - parseInt(b.match(/slide(\d+)/)![1]))
      const slides: string[] = []
      let slideNum = 0
      for (const sf of slideFiles.slice(0, 80)) {
        slideNum++
        const xml = await zip.files[sf].async('string')
        const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
          .filter(Boolean)
        if (texts.length) slides.push(`## Slide ${slideNum}: ${texts[0]}\n${texts.slice(1).join('\n')}`)
      }
      metadata.slideCount = slideNum
      text = slides.join('\n\n')
    } else {
      // txt, md, csv
      text = buffer.toString('utf8')
      if (format === 'csv') {
        const lines = text.split('\n').filter(Boolean)
        if (lines.length > 1) {
          const rows = lines.map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '')))
          tables.push({ caption: 'CSV Data', rows: rows.slice(0, 30) })
        }
      }
    }

    text = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 100_000)
    if (!text) {
      return NextResponse.json({ error: 'Could not extract any content.' }, { status: 422 })
    }

    metadata.wordCount = text.split(/\s+/).filter(Boolean).length
    metadata.charCount = text.length
    metadata.readingTime = Math.max(1, Math.round(metadata.wordCount / 220))

    const doc: ParsedDoc = {
      id: randomUUID(),
      filename,
      format,
      title: filename.replace(/\.[^.]+$/, ''),
      text,
      sections: extractSections(text),
      tables: tables.slice(0, 10),
      metadata,
      uploadedAt: new Date().toISOString(),
    }
    docStore.set(doc.id, doc)

    // AI summary for instant context
    let summary = ''
    try {
      summary = await smartChat(
        [
          {
            role: 'assistant',
            content:
              'Summarize this document in 2-3 sentences: what it is, its key points, and its structure. Be specific.',
          },
          { role: 'user', content: text.slice(0, 4000) },
        ],
        { maxTokens: 200, task: 'documents' }
      )
    } catch {
      summary = ''
    }

    return NextResponse.json({
      document: {
        id: doc.id,
        filename: doc.filename,
        format: doc.format,
        title: doc.title,
        metadata: doc.metadata,
        sectionCount: doc.sections.length,
        tableCount: doc.tables.length,
        preview: text.slice(0, 500),
        summary,
      },
    })
  } catch (error) {
    console.error('[api/documents] POST error:', error)
    const msg = error instanceof Error ? error.message : 'Upload failed.'
    // User-friendly errors → 400; technical failures → 500
    const isUserError = /not a valid|No text|Could not read|corrupted|password|scanned/i.test(msg)
    return NextResponse.json(
      { error: msg },
      { status: isUserError ? 400 : 500 }
    )
  }
}

// GET: ask questions about a document
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    const question = req.nextUrl.searchParams.get('q')
    if (!id || !docStore.has(id)) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    const doc = docStore.get(id)!

    if (!question) {
      return NextResponse.json({
        document: {
          id: doc.id,
          title: doc.title,
          metadata: doc.metadata,
          sections: doc.sections.map((s) => ({ heading: s.heading, preview: s.content.slice(0, 150) })),
          tables: doc.tables,
        },
      })
    }

    // Q&A over the document (Claude-style document chat)
    const answer = await smartChat(
      [
        {
          role: 'assistant',
          content:
            'You are analyzing a document. Answer questions about it accurately, citing specific parts when possible. ' +
            'If the answer is not in the document, say so clearly. Format in clean Markdown.',
        },
        {
          role: 'user',
          content: `DOCUMENT "${doc.filename}":\n\n${doc.text.slice(0, 12000)}\n\nQUESTION: ${question}`,
        },
      ],
      { maxTokens: 2000, task: 'documents' }
    )

    return NextResponse.json({ answer })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed.' },
      { status: 500 }
    )
  }
}

// PUT: edit the document and export a new version
export async function PUT(req: NextRequest) {
  try {
    const limit = rateLimit(`doc-edit:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many edits. Wait a moment.' }, { status: 429 })
    }

    const user = await getCurrentUser(req)

    const bodySchema = z.object({
      id: z.string().min(1),
      instruction: z.string().min(3).max(2000),
      outputFormat: z.enum(['docx', 'txt', 'md']).default('docx'),
    })
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success || !docStore.has(parsed.data.id)) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    const doc = docStore.get(parsed.data.id)!
    const { instruction, outputFormat } = parsed.data

    // AI edits the document content
    const edited = await smartChat(
      [
        {
          role: 'assistant',
          content:
            'You are a document editor. Rewrite the document according to the instruction. ' +
            'Preserve the original structure and content except for the requested changes. ' +
            'Use Markdown formatting (## for section headings, - for bullets). Output ONLY the edited document.',
        },
        {
          role: 'user',
          content: `DOCUMENT:\n${doc.text.slice(0, 20000)}\n\nEDIT INSTRUCTION: ${instruction}`,
        },
      ],
      { maxTokens: 6000, task: 'documents' }
    )

    // Export as requested format
    const id = randomUUID()
    await mkdir(UPLOAD_DIR, { recursive: true })
    let buffer: Buffer
    let ext: string
    let mime: string

    if (outputFormat === 'docx') {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
      const children: Paragraph[] = []
      for (const line of edited.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('## ')) {
          children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }))
        } else if (trimmed.startsWith('# ')) {
          children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }))
        } else if (trimmed.startsWith('- ')) {
          children.push(new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } }))
        } else if (trimmed) {
          children.push(new Paragraph({ children: [new TextRun({ text: trimmed, size: 24 })] }))
        }
      }
      const document = new Document({ sections: [{ children }] })
      buffer = Buffer.from(await Packer.toBuffer(document))
      ext = 'docx'
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else {
      buffer = Buffer.from(edited, 'utf8')
      ext = outputFormat
      mime = outputFormat === 'md' ? 'text/markdown' : 'text/plain'
    }

    const filePath = path.join(UPLOAD_DIR, `${id}.${ext}`)
    await writeFile(filePath, buffer)

    // Persist the exported document to the library DB.
    try {
      await db.generatedDocument.create({
        data: {
          filename: doc.filename,
          format: ext,
          title: doc.title,
          summary: edited.slice(0, 200),
          downloadUrl: `/api/documents/file/${id}?format=${ext}`,
          size: buffer.length,
          userId: user?.id ?? null,
        },
      })
    } catch (e) {
      console.error('[documents] db save failed:', e)
    }

    return NextResponse.json({
      edited: {
        content: edited.slice(0, 3000),
        downloadUrl: `/api/documents/file/${id}?format=${ext}`,
        format: ext,
        size: buffer.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed.' },
      { status: 500 }
    )
  }
}
