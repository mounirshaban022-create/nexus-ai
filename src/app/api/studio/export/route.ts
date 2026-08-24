import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * STUDIO EXPORT — turns the BlockNote editor's Markdown into a real
 * formatted .docx (Word) file. Replaces the old office pipeline for
 * documents: one editor, one export path, full formatting fidelity.
 */

export const maxDuration = 60

const requestSchema = z.object({
  format: z.enum(['docx', 'md']),
  title: z.string().min(1).max(200),
  markdown: z.string().min(1).max(120000),
})

interface DocLine {
  kind: 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'quote' | 'para' | 'hr'
  text: string
  level?: number
}

/** Minimal Markdown → structured lines parser (headings, lists, quotes, hr). */
function parseMarkdown(md: string): DocLine[] {
  const lines: DocLine[] = []
  let inCodeFence = false
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) {
      lines.push({ kind: 'para', text: raw })
      continue
    }
    const t = line.trim()
    if (!t) continue
    const h = /^(#{1,4})\s+(.*)$/.exec(t)
    if (h) {
      const lvl = h[1].length
      lines.push({ kind: lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : 'h3', text: h[2], level: lvl })
      continue
    }
    if (/^([-*_])\s*\1\s*\1[-*_\s]*$/.test(t)) {
      lines.push({ kind: 'hr', text: '' })
      continue
    }
    if (/^[-*+]\s+/.test(t)) {
      lines.push({ kind: 'bullet', text: t.replace(/^[-*+]\s+/, '') })
      continue
    }
    if (/^\d+[.)]\s+/.test(t)) {
      lines.push({ kind: 'numbered', text: t.replace(/^\d+[.)]\s+/, '') })
      continue
    }
    if (/^>\s?/.test(t)) {
      lines.push({ kind: 'quote', text: t.replace(/^>\s?/, '') })
      continue
    }
    lines.push({ kind: 'para', text: t })
  }
  return lines
}

/** Splits inline markdown (**bold**, *italic*, `code`) into runs. */
function inlineRuns(text: string): Array<{ text: string; bold?: boolean; italics?: boolean; code?: boolean }> {
  const runs: Array<{ text: string; bold?: boolean; italics?: boolean; code?: boolean }> = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('**')) runs.push({ text: tok.slice(2, -2), bold: true })
    else if (tok.startsWith('`')) runs.push({ text: tok.slice(1, -1), code: true })
    else runs.push({ text: tok.slice(1, -1), italics: true })
    last = m.index + tok.length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length ? runs : [{ text }]
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`studio-export:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many exports. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid export request.' }, { status: 400 })
    }
    const { format, title, markdown } = parsed.data

    // Files are stored in the shared generated-files dir and served through
    // /api/office/file/[id] (same pattern as the office exports).
    const dir = path.join(process.cwd(), 'generated-images')
    await mkdir(dir, { recursive: true })
    const id = randomUUID()
    const filename = `${id}.${format}`
    const filePath = path.join(dir, filename)

    if (format === 'md') {
      await writeFile(filePath, markdown, 'utf-8')
      return NextResponse.json({
        file: { url: `/api/office/file/${id}`, format, title, filename, size: Buffer.byteLength(markdown) },
      })
    }

    // docx — real Word document with headings, lists, quotes
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')

    const lines = parseMarkdown(markdown)
    const children: import('docx').Paragraph[] = []

    const headingFor = (lvl?: number) =>
      [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
        Math.min(3, Math.max(0, (lvl ?? 2) - 1))
      ]

    for (const line of lines) {
      const runs = inlineRuns(line.text).map(
        (r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italics, font: r.code ? 'Consolas' : undefined })
      )
      switch (line.kind) {
        case 'h1':
          children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT, children: runs }))
          break
        case 'h2':
        case 'h3':
          children.push(new Paragraph({ heading: headingFor(line.level), children: runs }))
          break
        case 'bullet':
          children.push(new Paragraph({ bullet: { level: 0 }, children: runs }))
          break
        case 'numbered':
          children.push(new Paragraph({ indent: { left: 360 }, children: runs }))
          break
        case 'quote':
          children.push(
            new Paragraph({
              indent: { left: 480 },
              border: { left: { style: 'single', size: 6, color: 'D97706', space: 12 } },
              children: runs.map((r) => new TextRun({ text: r.text, italics: true, color: '555555' })),
            })
          )
          break
        case 'hr':
          children.push(new Paragraph({ text: '', border: { bottom: { style: 'single', size: 4, color: 'CCCCCC', space: 8 } } }))
          break
        default:
          children.push(new Paragraph({ children: runs, spacing: { after: 120 } }))
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 } },
        },
      },
      sections: [
        {
          properties: {},
          children: children.length
            ? children
            : [new Paragraph({ text: markdown.slice(0, 20000) })],
        },
      ],
    })

    const buffer = Buffer.from(await Packer.toBuffer(doc))
    await writeFile(filePath, buffer)

    return NextResponse.json({
      file: {
        url: `/api/office/file/${id}`,
        format,
        title,
        filename,
        size: buffer.byteLength,
      },
    })
  } catch (error) {
    console.error('[api/studio/export] POST error:', error)
    const message = error instanceof Error ? error.message : 'Export failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
