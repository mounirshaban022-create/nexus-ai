import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * AGENT SPREADSHEET SKILL — builds a real .xlsx from the agent's
 * structured output (headers, typed rows, live formulas).
 */

export const maxDuration = 60

const sheetSchema = z.object({
  name: z.string().max(40).optional(),
  headers: z.array(z.string().max(200)).max(40).default([]),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null(), z.boolean()])).max(40)).max(500).default([]),
  formulas: z
    .array(z.object({ row: z.number().int().min(0).max(1000), col: z.number().int().min(0).max(40), formula: z.string().max(200) }))
    .max(50)
    .default([]),
})

const requestSchema = z.object({
  title: z.string().min(1).max(120),
  sheets: z.array(sheetSchema).min(1).max(10),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`agent-xlsx:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many spreadsheets. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid spreadsheet request: title + sheets[{name, headers, rows, formulas?}].' }, { status: 400 })
    }
    const { title, sheets } = parsed.data

    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const usedNames = new Set<string>()

    for (const sheet of sheets) {
      const data: unknown[][] = [sheet.headers, ...sheet.rows]
      for (const f of sheet.formulas) {
        while (data.length <= f.row) data.push([])
        const rowArr = data[f.row] as unknown[]
        while (rowArr.length <= f.col) rowArr.push('')
        rowArr[f.col] = f.formula.startsWith('=') ? f.formula : `=${f.formula}`
      }
      let name = (sheet.name ?? 'Sheet').slice(0, 28) || 'Sheet'
      let n = 2
      while (usedNames.has(name)) name = `${(sheet.name ?? 'Sheet').slice(0, 25)}_${n++}`
      usedNames.add(name)

      const ws = wb.addWorksheet(name)
      const cols = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1)
      // Column widths sized to content (min 10, cap 40) — same heuristic
      const cellText = (v: unknown) => String(v ?? '')
      for (let i = 0; i < cols; i++) {
        ws.getColumn(i + 1).width = Math.min(
          40,
          Math.max(10, ...data.slice(0, 40).map((row) => cellText((row as unknown[])[i]).length + 2))
        )
      }
      for (const row of data) {
        ws.addRow(
          row.map((v) =>
            // exceljs stores formulas without the leading '='
            typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v
          )
        )
      }
    }

    const dir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'generated-images')
    await mkdir(dir, { recursive: true })
    const id = randomUUID()
    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    await writeFile(path.join(dir, `${id}.xlsx`), buffer)

    return NextResponse.json({
      file: {
        url: `/api/office/file/${id}`,
        format: 'xlsx',
        title,
        filename: `${id}.xlsx`,
        size: buffer.byteLength,
      },
    })
  } catch (error) {
    console.error('[api/agent/spreadsheet] POST error:', error)
    const message = error instanceof Error ? error.message : 'Spreadsheet creation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
