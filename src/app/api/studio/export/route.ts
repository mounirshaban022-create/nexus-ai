import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * STUDIO EXPORT — converts the BlockNote editor's Markdown into real
 * files: DOCX (Word), PDF (pdfkit), HTML, Markdown and TXT. One editor,
 * every format — the convert engine for the unified Studio.
 */

export const maxDuration = 60

const requestSchema = z.object({
  format: z.enum(['docx', 'pdf', 'html', 'md', 'txt']),
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
    const dir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'generated-images')
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

    if (format === 'txt') {
      const lines = parseMarkdown(markdown)
      const txt = lines
        .map((l) => {
          if (l.kind === 'h1') return `${l.text.toUpperCase()}\n${'='.repeat(Math.min(60, l.text.length))}`
          if (l.kind === 'h2' || l.kind === 'h3') return `\n${l.text}\n${'-'.repeat(Math.min(50, l.text.length))}`
          if (l.kind === 'bullet') return `  • ${l.text}`
          if (l.kind === 'numbered') return `  ${l.text}`
          if (l.kind === 'quote') return `  | ${l.text}`
          if (l.kind === 'hr') return '─'.repeat(40)
          return l.text
        })
        .join('\n')
      const full = `${title}\n\n${txt}`
      await writeFile(filePath, full, 'utf-8')
      return NextResponse.json({
        file: { url: `/api/office/file/${id}`, format, title, filename, size: Buffer.byteLength(full) },
      })
    }

    if (format === 'html') {
      const lines = parseMarkdown(markdown)
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const inline = (s: string) =>
        esc(s)
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
      const body = lines
        .map((l) => {
          if (l.kind === 'h1') return `<h1>${inline(l.text)}</h1>`
          if (l.kind === 'h2') return `<h2>${inline(l.text)}</h2>`
          if (l.kind === 'h3') return `<h3>${inline(l.text)}</h3>`
          if (l.kind === 'bullet') return `<li>${inline(l.text)}</li>`
          if (l.kind === 'numbered') return `<li>${inline(l.text)}</li>`
          if (l.kind === 'quote') return `<blockquote>${inline(l.text)}</blockquote>`
          if (l.kind === 'hr') return '<hr/>'
          return `<p>${inline(l.text)}</p>`
        })
        .join('\n')
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 760px; margin: 48px auto; padding: 0 24px; line-height: 1.65; color: #1c1917; }
  h1 { font-size: 2rem; border-bottom: 3px solid #D97706; padding-bottom: 8px; }
  h2 { font-size: 1.45rem; margin-top: 2em; color: #92400E; }
  h3 { font-size: 1.15rem; margin-top: 1.6em; }
  blockquote { border-left: 4px solid #D97706; margin: 1em 0; padding: 0.4em 1em; color: #57534E; background: #FFFBEB; }
  code { font-family: Consolas, monospace; background: #F5F5F4; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  hr { border: none; border-top: 1px solid #E7E5E4; margin: 2em 0; }
  li { margin: 0.3em 0; }
</style>
</head>
<body>
${body}
</body>
</html>`
      await writeFile(filePath, html, 'utf-8')
      return NextResponse.json({
        file: { url: `/api/office/file/${id}`, format, title, filename, size: Buffer.byteLength(html) },
      })
    }

    if (format === 'pdf') {
      // Real PDF via pdfkit — headings, lists, quotes with page breaks.
      const PDFDocument = (await import('pdfkit')).default
      const lines = parseMarkdown(markdown)
      const buffers: Buffer[] = []
      const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 64, right: 64 } })
      doc.on('data', (c: Buffer) => buffers.push(c))
      const done = new Promise<void>((resolve) => doc.on('end', () => resolve()))

      const BRAND: [number, number, number] = [0x9a, 0x34, 0x12] // warm amber-900 (no blue)
      let first = true
      for (const line of lines) {
        if (first) {
          doc.fontSize(22).fillColor(BRAND).font('Helvetica-Bold').text(line.kind === 'h1' ? line.text : title, { align: 'left' })
          doc.moveDown(0.4)
          doc.moveTo(64, doc.y).lineTo(531, doc.y).lineWidth(2).strokeColor(BRAND).stroke()
          doc.moveDown(1)
          if (line.kind === 'h1') {
            first = false
            continue
          }
          first = false
        }
        const clean = line.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
        switch (line.kind) {
          case 'h1':
          case 'h2':
            doc.fontSize(15).fillColor(BRAND).font('Helvetica-Bold').text(clean)
            doc.moveDown(0.5)
            break
          case 'h3':
            doc.fontSize(12.5).fillColor(0x44, 0x40, 0x3c).font('Helvetica-Bold').text(clean)
            doc.moveDown(0.4)
            break
          case 'bullet':
            doc.fontSize(10.5).fillColor(0x1c, 0x19, 0x17).font('Helvetica').text(`•  ${clean}`, { indent: 18 })
            break
          case 'numbered':
            doc.fontSize(10.5).fillColor(0x1c, 0x19, 0x17).font('Helvetica').text(`1. ${clean}`, { indent: 18 })
            break
          case 'quote':
            doc.fontSize(10.5).fillColor(0x57, 0x53, 0x4e).font('Helvetica-Oblique').text(clean, { indent: 24 })
            doc.moveDown(0.3)
            break
          case 'hr':
            doc.moveDown(0.4)
            doc.moveTo(64, doc.y).lineTo(531, doc.y).lineWidth(0.75).strokeColor(0xd6, 0xd3, 0xd1).stroke()
            doc.moveDown(0.6)
            break
          default:
            doc.fontSize(10.5).fillColor(0x1c, 0x19, 0x17).font('Helvetica').text(clean, { lineGap: 3 })
            doc.moveDown(0.55)
        }
        // Page-break safety
        if (doc.y > 700) doc.addPage()
      }
      doc.end()
      await done
      const buffer = Buffer.concat(buffers)
      await writeFile(filePath, buffer)
      return NextResponse.json({
        file: { url: `/api/office/file/${id}`, format, title, filename, size: buffer.byteLength },
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
