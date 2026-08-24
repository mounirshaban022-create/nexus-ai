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
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const sheets = wb.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false })
        return {
          name,
          rows: rows.slice(0, 100).map((r) => (r as unknown[]).map((c) => String(c ?? ''))),
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
    const message = error instanceof Error ? error.message : 'Could not read that file.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
