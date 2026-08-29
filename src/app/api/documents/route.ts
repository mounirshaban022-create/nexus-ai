import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { smartChat } from '@/lib/smart-chat'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'
import { requireVerifiedSession, getCurrentUser } from '@/lib/auth'
import { ensurePerUserColumns, persistParsedDocument, loadParsedDocument } from '@/lib/schema-guard'
import { extractPdfText } from '@/lib/pdf-text'
import type { Paragraph } from 'docx'

export const maxDuration = 120

/**
 * DOCUMENT INTELLIGENCE — Claude-level document handling.
 * Upload any document → parse → analyze → chat → edit → export.
 * 
 * POST /api/documents (upload + parse)
 * GET  /api/documents?id= (get parsed)
 * PUT  /api/documents (edit + re-export)
 */

const IS_VERCEL = Boolean(process.env.VERCEL)
const UPLOAD_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-documents') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-documents')

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
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

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
      // Validate it's actually a PDF before parsing
      if (!buffer.slice(0, 5).toString().startsWith('%PDF-')) {
        throw new Error('This file is not a valid PDF. It may be corrupted or in a different format.')
      }

      // 3-layer fallback (pdftotext → pdf-parse v2 → OCR) lives in
      // src/lib/pdf-text.ts — both document routes share the same pipeline.
      const { text: pdfText, pages } = await extractPdfText(buffer)
      text = pdfText
      if (pages) metadata.pages = pages
    } else if (format === 'docx') {
      const { extractRawText } = await import('mammoth')
      const result = await extractRawText({ buffer })
      text = result.value
    } else if (format === 'xlsx') {
      // CLAUDE-LEVEL EXCEL PARSING: every sheet becomes a proper markdown
      // table with a detected header row — LLMs reason about markdown
      // tables far better than pipe-joined lines. Numbers keep their
      // formatting; sheets get row counts; multi-sheet docs get an index.
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      metadata.sheetNames = wb.SheetNames
      const parts: string[] = []
      if (wb.SheetNames.length > 1) {
        parts.push(`*Workbook with ${wb.SheetNames.length} sheets: ${wb.SheetNames.join(', ')}.*`)
      }
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name]
        const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
        const totalRows = range ? range.e.r - range.s.r + 1 : 0
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: '',
        })
        if (rows.length === 0) continue

        // Markdown table with the first row as header
        const maxCols = Math.min(
          30,
          Math.max(...rows.slice(0, 12).map((r) => r.length), 1)
        )
        const norm = (r: string[]) => {
          const out = [...r.map((c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim())]
          while (out.length < maxCols) out.push('')
          return out.slice(0, maxCols)
        }
        const [header, ...body] = rows.map(norm)
        // Avoid empty all-"_" headers when the sheet has no header row
        const headerCells = header.map((h, i) => h || `Col ${i + 1}`)
        const mdTable: string[] = [
          `## Sheet: ${name}${totalRows ? ` (${totalRows} rows)` : ''}`,
          '',
          `| ${headerCells.join(' | ')} |`,
          `| ${headerCells.map(() => '---').join(' | ')} |`,
        ]
        for (const row of body.slice(0, 200)) {
          mdTable.push(`| ${row.join(' | ')} |`)
        }
        if (body.length > 200) {
          mdTable.push(`*…and ${body.length - 200} more rows*`)
        }
        parts.push(mdTable.join('\n'))
        if (rows.length > 1) {
          tables.push({ caption: name, rows: rows.slice(0, 20).map((r) => r.map(String)) })
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

    // DURABLE PERSISTENCE — the in-memory docStore is per-serverless-instance;
    // on Vercel the follow-up GET (chat attachment context, Studio import,
    // document Q&A) can hit a different instance → "Document not found".
    // Persisting makes every later read work (additive table, best-effort).
    const user = await getCurrentUser(req).catch(() => null)
    void persistParsedDocument({
      id: doc.id,
      userId: user?.id ?? null,
      filename: doc.filename,
      format: doc.format,
      title: doc.title,
      text: doc.text,
      sections: JSON.stringify(doc.sections),
      tables: JSON.stringify(doc.tables),
      metadata: JSON.stringify(doc.metadata),
    })

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
        // FULL parsed text + sections in the upload response itself — the
        // caller (chat attachment context) must not depend on a second GET
        // that can land on a different serverless instance.
        text: doc.text.slice(0, 40_000),
        sections: doc.sections,
        tables: doc.tables,
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
    if (!id) {
      return NextResponse.json({ error: 'Document id required.' }, { status: 400 })
    }

    let doc = docStore.get(id) ?? null
    if (!doc) {
      // Cold instance — rebuild from the durable store (survives instance
      // switches on Vercel; the in-memory map covers the warm path).
      const row = await loadParsedDocument(id)
      if (row) {
        let sections: ParsedDoc['sections'] = []
        let tables: ParsedDoc['tables'] = []
        let metadata: ParsedDoc['metadata'] = { wordCount: 0, charCount: 0, readingTime: 0 }
        try {
          sections = JSON.parse(row.sections) as ParsedDoc['sections']
        } catch { /* keep empty */ }
        try {
          tables = JSON.parse(row.tables) as ParsedDoc['tables']
        } catch { /* keep empty */ }
        try {
          metadata = { ...metadata, ...(JSON.parse(row.metadata) as Partial<ParsedDoc['metadata']>) }
        } catch { /* keep defaults */ }
        doc = {
          id: row.id,
          filename: row.filename,
          format: row.format as ParsedDoc['format'],
          title: row.title,
          text: row.text,
          sections,
          tables,
          metadata,
          uploadedAt: row.createdAt ?? new Date().toISOString(),
        }
        docStore.set(doc.id, doc) // warm the cache for subsequent reads
      }
    }
    if (!doc) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    if (!question) {
      return NextResponse.json({
        document: {
          id: doc.id,
          filename: doc.filename,
          format: doc.format,
          title: doc.title,
          text: doc.text,
          metadata: doc.metadata,
          // Full content (not previews) — the Studio import builds an
          // editable document from these sections.
          sections: doc.sections.map((s) => ({ heading: s.heading, content: s.content })),
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
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

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
    await ensurePerUserColumns()
    try {
      const docRecord = await db.generatedDocument.create({
        data: {
          id,
          filename: doc.filename,
          format: ext,
          title: doc.title,
          summary: edited.slice(0, 200),
          downloadUrl: `/api/documents/file/${id}?format=${ext}`,
          size: buffer.length,
          data: buffer.toString('base64'),
          mimeType: ext === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : ext === 'md' ? 'text/markdown' : 'text/plain',
          userId: user?.id ?? null,
        },
      })
      // Mirror to Supabase — no-op when unconfigured
      if (docRecord.userId) {
        void supabaseUpsert('generated_documents', {
          id: docRecord.id,
          user_id: docRecord.userId,
          filename: docRecord.filename,
          format: docRecord.format,
          title: docRecord.title,
          download_url: docRecord.downloadUrl,
          size: docRecord.size,
        }, { onConflict: 'id' })
      }
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
