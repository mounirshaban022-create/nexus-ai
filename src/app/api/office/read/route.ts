import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { extractPdfText } from '@/lib/pdf-text'

/**
 * Office Studio reader: extract text/data from uploaded
 * PDF / DOCX / XLSX / PPTX / TXT / MD files.
 */

const requestSchema = z.object({
  file: z.string().min(100).max(15_000_000), // base64
  format: z.enum(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md']),
  filename: z.string().max(200).optional(),
})

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64.includes(',') && b64.startsWith('data:') ? b64.split(',')[1] : b64, 'base64')
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`office-read:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many requests. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A base64 file and format are required.' }, { status: 400 })
    }
    const { file, format } = parsed.data
    const buffer = base64ToBuffer(file)

    let extracted: {
      format: string
      text?: string
      sheets?: Array<{ name: string; rows: string[][] }>
      slides?: Array<{ title?: string; texts: string[] }>
      meta?: Record<string, unknown>
    } = { format }

    if (format === 'pdf') {
      // 3-layer fallback (pdftotext → pdf-parse v2 → OCR) lives in
      // src/lib/pdf-text.ts — same pipeline as /api/documents.
      const { text: pdfText, pages } = await extractPdfText(buffer)
      extracted = {
        format,
        text: pdfText?.slice(0, 60000),
        meta: pages ? { pages } : undefined,
      }
    } else if (format === 'docx') {
      const { extractRawText } = await import('mammoth')
      const result = await extractRawText({ buffer })
      extracted = { format, text: result.value?.slice(0, 60000) }
    } else if (format === 'xlsx') {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
      // Flatten exceljs cell values (string | number | Date | rich text |
      // formula objects) to display strings.
      const cellToString = (v: unknown): string => {
        if (v == null) return ''
        if (typeof v === 'string') return v
        if (typeof v === 'number' || typeof v === 'boolean') return String(v)
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        if (typeof v === 'object') {
          const o = v as Record<string, unknown>
          const rich = o.richText
          if (Array.isArray(rich)) {
            return rich
              .map((t) => (t && typeof t === 'object' && 'text' in t ? String((t as { text?: unknown }).text ?? '') : ''))
              .join('')
          }
          if ('result' in o && o.result != null) return cellToString(o.result)
          if ('formula' in o) {
            // exceljs may or may not keep the leading '=' — normalize to one.
            const f = String(o.formula ?? '')
            return f.startsWith('=') ? f : `=${f}`
          }
          if ('text' in o) return cellToString(o.text)
          if ('hyperlink' in o && typeof o.hyperlink === 'string') return o.hyperlink
        }
        return String(v)
      }
      const sheets = wb.worksheets.map((ws) => {
        const rows: string[][] = []
        ws.eachRow({ includeEmpty: false }, (row) => {
          const values = (row.values as unknown[]) ?? []
          rows.push(values.slice(1).map(cellToString))
        })
        return {
          name: ws.name,
          rows: rows.slice(0, 100),
        }
      })
      extracted = {
        format,
        sheets,
        text: sheets
          .map((s) => `## Sheet: ${s.name}\n${s.rows.map((r) => r.join(' | ')).join('\n')}`)
          .join('\n\n')
          .slice(0, 60000),
        meta: { sheetCount: sheets.length },
      }
    } else if (format === 'pptx') {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/slide(\d+)/)![1])
          const nb = parseInt(b.match(/slide(\d+)/)![1])
          return na - nb
        })
      const slides: Array<{ title?: string; texts: string[] }> = []
      for (const sf of slideFiles.slice(0, 60)) {
        const xml = await zip.files[sf].async('string')
        // Extract <a:t> text runs
        const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
          .filter(Boolean)
        slides.push({ title: texts[0], texts: texts.slice(0, 40) })
      }
      extracted = {
        format,
        slides,
        text: slides
          .map((s, i) => `## Slide ${i + 1}: ${s.title ?? ''}\n${s.texts.slice(1).join('\n')}`)
          .join('\n\n')
          .slice(0, 60000),
        meta: { slideCount: slides.length },
      }
    } else {
      // txt / md
      extracted = { format, text: buffer.toString('utf8').slice(0, 60000) }
    }

    if (!extracted.text && !extracted.sheets && !extracted.slides) {
      return NextResponse.json(
        { error: 'Could not extract any content from that file.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ document: extracted })
  } catch (error) {
    console.error('[api/office/read] POST error:', error)
    return NextResponse.json({ error: 'Could not read that file. Make sure it is a valid Word, Excel, or PowerPoint document.' }, { status: 500 })
  }
}
