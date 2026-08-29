import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { requireVerifiedSession, getCurrentUser } from '@/lib/auth'
import { ensurePerUserColumns } from '@/lib/schema-guard'

export const maxDuration = 120

const IS_VERCEL = Boolean(process.env.VERCEL)
const FILES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-images') // shared generated-files dir

/**
 * Office Studio generation endpoint.
 * The client sends a structured document (title + blocks) and the file type;
 * we build a real .docx / .xlsx / .pptx / .md file and return its URL.
 */

type Block =
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'slide'; title: string; bullets: string[] }

const requestSchema = z.object({
  format: z.enum(['docx', 'xlsx', 'pptx', 'md']),
  title: z.string().min(1).max(200),
  theme: z.enum(['nexus', 'executive', 'sunset', 'rosewood']).optional(),
  blocks: z
    .array(
      z.union([
        z.object({
          type: z.literal('heading'),
          text: z.string().max(500),
          level: z.number().int().min(1).max(4).optional(),
        }),
        z.object({ type: z.literal('paragraph'), text: z.string().max(4000) }),
        z.object({ type: z.literal('bullets'), items: z.array(z.string().max(1000)).max(30) }),
        z.object({
          type: z.literal('table'),
          rows: z.array(z.array(z.string().max(500)).max(12)).max(40),
        }),
        z.object({
          type: z.literal('slide'),
          title: z.string().max(200),
          bullets: z.array(z.string().max(500)).max(12),
        }),
      ])
    )
    .min(1)
    .max(60),
})

/* ------------------------------------------------------------------ */
/* Professional template themes                                         */
/* ------------------------------------------------------------------ */

interface DocTheme {
  name: string
  primary: string // hex without #
  primaryDark: string
  accent: string
  text: string
  textMuted: string
  surface: string
  surfaceAlt: string
  border: string
  white: string
}

const THEMES: Record<string, DocTheme> = {
  nexus: {
    name: 'Nexus Violet',
    primary: '7C3AED', primaryDark: '5B21B6', accent: 'C026D3',
    text: '1E1B2E', textMuted: '6B7280', surface: 'F5F3FF', surfaceAlt: 'EDE9FE',
    border: 'DDD6FE', white: 'FFFFFF',
  },
  executive: {
    name: 'Executive Slate',
    primary: '0F766E', primaryDark: '115E59', accent: 'D97706',
    text: '1C1917', textMuted: '78716C', surface: 'F0FDFA', surfaceAlt: 'CCFBF1',
    border: '99F6E4', white: 'FFFFFF',
  },
  sunset: {
    name: 'Sunset Amber',
    primary: 'B45309', primaryDark: '92400E', accent: 'BE185D',
    text: '292524', textMuted: '78716C', surface: 'FFFBEB', surfaceAlt: 'FEF3C7',
    border: 'FDE68A', white: 'FFFFFF',
  },
  rosewood: {
    name: 'Rosewood',
    primary: 'BE123C', primaryDark: '9F1239', accent: '7C3AED',
    text: '1F1215', textMuted: '78716C', surface: 'FFF1F2', surfaceAlt: 'FFE4E6',
    border: 'FECDD3', white: 'FFFFFF',
  },
}

function themeFromTitle(title: string): DocTheme {
  const t = title.toLowerCase()
  if (/budget|finance|invoice|cost|revenue|bank/.test(t)) return THEMES.executive
  if (/pitch|startup|creative|marketing|brand/.test(t)) return THEMES.sunset
  if (/love|story|recipe|travel|food|health/.test(t)) return THEMES.rosewood
  return THEMES.nexus
}

const MIME_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown; charset=utf-8',
}

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  try {
    const limit = rateLimit(`office-create:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many generations. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    // MEDIA FIX: persist the generated file bytes to the DB so the download
    // link NEVER 404s on Vercel (the next request hits a different lambda
    // whose /tmp is empty). Guests get userId=null; signed-in users own it.
    const user = await getCurrentUser(req).catch(() => null)

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid document structure.' }, { status: 400 })
    }
    const { format, title, blocks } = parsed.data
    // Theme: explicit choice, or auto-picked from the title content
    const themeKey = parsed.data.theme ?? (() => {
      const t = title.toLowerCase()
      if (/budget|finance|invoice|cost|revenue|bank/.test(t)) return 'executive'
      if (/pitch|startup|creative|marketing|brand/.test(t)) return 'sunset'
      if (/love|story|recipe|travel|food|health/.test(t)) return 'rosewood'
      return 'nexus'
    })()

    await mkdir(FILES_DIR, { recursive: true })
    const id = randomUUID()
    let filename: string
    let buffer: Buffer

    if (format === 'docx') {
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        Table,
        TableRow,
        TableCell,
        WidthType,
        AlignmentType,
        BorderStyle,
        ShadingType,
        Footer,
        PageNumber,
      } = await import('docx')
      const theme = THEMES[themeKey] ?? THEMES.nexus

      const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = []

      /* ---- Cover header block ---- */
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'NEXUS AI DOCUMENT', bold: true, size: 18, color: theme.accent }),
          ],
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 56, color: theme.primaryDark })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              size: 22, color: theme.textMuted, italics: true,
            }),
          ],
          spacing: { after: 300 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: theme.primary, space: 8 } },
        })
      )

      /* ---- Content ---- */
      for (const block of blocks) {
        if (block.type === 'heading') {
          const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4]
          children.push(
            new Paragraph({
              text: block.text,
              heading: levels[(block.level ?? 2) - 1] ?? HeadingLevel.HEADING_2,
              spacing: { before: 280, after: 140 },
            })
          )
        } else if (block.type === 'paragraph') {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.text, size: 24, color: theme.text })],
              spacing: { after: 160, line: 340 },
            })
          )
        } else if (block.type === 'bullets') {
          for (const item of block.items) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: item, size: 24, color: theme.text })],
                bullet: { level: 0 },
                spacing: { after: 100 },
              })
            )
          }
        } else if (block.type === 'table' && block.rows.length > 0) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: block.rows.map(
                (row, rIdx) =>
                  new TableRow({
                    tableHeader: rIdx === 0,
                    children: row.map(
                      (cell) =>
                        new TableCell({
                          shading: rIdx === 0
                            ? { type: ShadingType.CLEAR, fill: theme.primary, color: 'auto' }
                            : rIdx % 2 === 1
                              ? { type: ShadingType.CLEAR, fill: theme.surface, color: 'auto' }
                              : undefined,
                          margins: { top: 100, bottom: 100, left: 140, right: 140 },
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: cell,
                                  bold: rIdx === 0,
                                  size: 22,
                                  color: rIdx === 0 ? theme.white : theme.text,
                                }),
                              ],
                            }),
                          ],
                        })
                    ),
                  })
              ),
            })
          )
          children.push(new Paragraph({ text: '', spacing: { after: 160 } }))
        }
      }

      /* ---- Footer line ---- */
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: '— Generated by NEXUS AI · ', size: 18, color: theme.textMuted }),
            new TextRun({ text: theme.name, size: 18, color: theme.textMuted, italics: true }),
            new TextRun({ text: ' theme —', size: 18, color: theme.textMuted }),
          ],
          spacing: { before: 400 },
          alignment: AlignmentType.CENTER,
        })
      )

      const doc = new Document({
        styles: {
          default: {
            heading1: { run: { color: theme.primaryDark, bold: true, size: 36 } },
            heading2: { run: { color: theme.primary, bold: true, size: 30 } },
            heading3: { run: { color: theme.primary, bold: true, size: 26 } },
          },
        },
        sections: [{
          children,
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'Page ', size: 18, color: theme.textMuted }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: theme.textMuted }),
                  ],
                }),
              ],
            }),
          },
        }],
      })
      buffer = Buffer.from(await Packer.toBuffer(doc))
      filename = `${id}.docx`
    } else if (format === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default
      const theme = THEMES[themeKey] ?? THEMES.nexus
      const wb = new ExcelJS.Workbook()
      wb.creator = 'NEXUS AI'
      wb.created = new Date()

      const tables = blocks.filter((b): b is Extract<Block, { type: 'table' }> => b.type === 'table')

      /* ---- Overview sheet ---- */
      const overview = wb.addWorksheet('Overview', {
        properties: { defaultRowHeight: 20 },
      })
      // Title banner (merged)
      overview.mergeCells(1, 1, 1, 2)
      const titleCell = overview.getCell(1, 1)
      titleCell.value = title
      titleCell.font = { bold: true, size: 16, color: { argb: 'FF' + theme.white } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.primary } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      overview.getRow(1).height = 32

      // Subtitle
      overview.mergeCells(2, 1, 2, 2)
      const subCell = overview.getCell(2, 1)
      subCell.value = 'Generated by NEXUS AI · ' + theme.name + ' theme · ' + new Date().toLocaleDateString()
      subCell.font = { size: 10, color: { argb: 'FF' + theme.textMuted }, italic: true }

      // Header row
      const headerRow = overview.getRow(4)
      headerRow.values = ['Section', 'Content']
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF' + theme.white }, size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.primary } }
        cell.alignment = { vertical: 'middle', indent: 1 }
      })
      overview.getRow(4).height = 22

      let r = 5
      for (const block of blocks) {
        if (block.type === 'heading') {
          overview.mergeCells(r, 1, r, 2)
          const c = overview.getCell(r, 1)
          c.value = block.text.toUpperCase()
          c.font = { bold: true, size: 11, color: { argb: 'FF' + theme.primaryDark } }
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.surfaceAlt } }
          r++
        } else if (block.type === 'paragraph') {
          overview.getCell(r, 1).value = 'Text'
          overview.getCell(r, 2).value = block.text
          r++
        } else if (block.type === 'bullets') {
          for (const item of block.items) {
            overview.getCell(r, 1).value = '•'
            overview.getCell(r, 2).value = item
            r++
          }
        } else if (block.type === 'slide') {
          overview.getCell(r, 1).value = 'Slide: ' + block.title
          overview.getCell(r, 2).value = block.bullets.join(' · ')
          r++
        }
      }

      // Zebra striping + borders on data rows
      for (let row = 5; row < r; row++) {
        const excelRow = overview.getRow(row)
        if (row % 2 === 0) {
          excelRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.surface } }
          })
        }
        excelRow.eachCell((cell) => {
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FF' + theme.border } },
          }
          if (cell.font && cell.font.bold) return
          cell.font = { size: 11, color: { argb: 'FF' + theme.text } }
        })
      }
      overview.getColumn(1).width = 28
      overview.getColumn(2).width = 90
      overview.views = [{ state: 'frozen', ySplit: 4 }]

      /* ---- Data sheets ---- */
      tables.forEach((t, i) => {
        const sheet = wb.addWorksheet(`Data ${i + 1}`)
        const header = sheet.getRow(1)
        header.values = t.rows[0]
        header.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FF' + theme.white }, size: 11 }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.primary } }
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        })
        sheet.getRow(1).height = 24

        for (let ri = 1; ri < t.rows.length; ri++) {
          const row = sheet.getRow(ri + 1)
          row.values = t.rows[ri]
          if (ri % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + theme.surface } }
            })
          }
          row.eachCell((cell) => {
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + theme.border } } }
            cell.font = { size: 11, color: { argb: 'FF' + theme.text } }
          })
        }

        // Auto-width
        const colCount = t.rows[0]?.length ?? 0
        for (let c = 1; c <= colCount; c++) {
          let maxLen = 10
          for (const row of t.rows) {
            const v = row[c - 1] ?? ''
            maxLen = Math.max(maxLen, String(v).length + 2)
          }
          sheet.getColumn(c).width = Math.min(maxLen, 42)
        }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]
      })

      buffer = Buffer.from(await wb.xlsx.writeBuffer())
      filename = `${id}.xlsx`
    } else if (format === 'pptx') {
      const PptxGenJS = (await import('pptxgenjs')).default
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_16x9'
      pptx.title = title
      const theme = THEMES[themeKey] ?? THEMES.nexus
      const hex = (c: string) => c

      /* ---- Master slides ---- */
      pptx.defineSlideMaster({
        title: 'NEXUS_TITLE',
        background: { color: theme.primaryDark },
        objects: [
          // Top accent bar
          { rect: { x: 0, y: 0, w: 10, h: 0.09, fill: { color: theme.accent } } },
          // Decorative circle cluster (right)
          { rect: { x: 8.85, y: 0.62, w: 1.4, h: 1.4, fill: { color: theme.primary }, line: { color: theme.accent, width: 0.75 } } },
          { rect: { x: 9.35, y: 1.25, w: 0.85, h: 0.85, fill: { color: theme.accent } } },
          // Bottom brand footer
          { rect: { x: 0, y: 5.16, w: 10, h: 0.24, fill: { color: theme.primary } } },
          { text: { text: 'NEXUS AI  ·  ' + title.slice(0, 60), options: { x: 0.5, y: 5.13, w: 7, h: 0.3, fontSize: 9, color: theme.surfaceAlt, align: 'left' } } },
        ],
      })

      pptx.defineSlideMaster({
        title: 'NEXUS_CONTENT',
        background: { color: theme.white },
        objects: [
          // Left accent rail with gradient feel (two-tone)
          { rect: { x: 0, y: 0, w: 0.14, h: 2.9, fill: { color: theme.primary } } },
          { rect: { x: 0, y: 2.9, w: 0.14, h: 2.73, fill: { color: theme.accent } } },
          // Corner decorative circles (subtle)
          { rect: { x: 8.85, y: 4.35, w: 1.9, h: 1.9, fill: { color: theme.surface }, line: { color: theme.border, width: 0.5 } } },
          { rect: { x: 9.5, y: 4.95, w: 0.75, h: 0.75, fill: { color: theme.surfaceAlt } } },
          // Bottom-right brand chip
          { rect: { x: 8.35, y: 0.32, w: 1.1, h: 0.34, fill: { color: theme.surface }, line: { color: theme.border, width: 0.5 } } },
          { text: { text: 'NEXUS', options: { x: 8.35, y: 0.32, w: 1.1, h: 0.34, fontSize: 10, bold: true, color: theme.primary, align: 'center', fontFace: 'Segoe UI' } } },
          // Footer
          { text: { text: 'NEXUS AI  ·  ' + title.slice(0, 50), options: { x: 0.55, y: 5.3, w: 6, h: 0.25, fontSize: 8, color: theme.textMuted, align: 'left' } } },
        ],
        slideNumber: { x: 9.3, y: 5.3, w: 0.45, h: 0.25, fontSize: 9, color: theme.primary, bold: true },
      })

      pptx.defineSlideMaster({
        title: 'NEXUS_SECTION',
        background: { color: theme.primary },
        objects: [
          { rect: { x: 0, y: 0, w: 10, h: 0.09, fill: { color: theme.accent } } },
          { rect: { x: -1.2, y: 3.4, w: 4.4, h: 0.5, fill: { color: theme.primaryDark } } },
          { rect: { x: 8.2, y: -1.6, w: 3.6, h: 0.5, fill: { color: theme.accent, transparency: 55 } } },
        ],
      })

      /* ---- Title slide ---- */
      const titleSlide = pptx.addSlide({ masterName: 'NEXUS_TITLE' })
      titleSlide.addText(title, {
        x: 0.55, y: 1.85, w: 8.9, h: 1.35,
        fontSize: 38, bold: true, color: theme.white, fontFace: 'Segoe UI',
      })
      titleSlide.addText('— ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' —', {
        x: 0.55, y: 3.25, w: 8.9, h: 0.4,
        fontSize: 14, color: theme.surfaceAlt, italic: true,
      })

      /* ---- Content slides ---- */
      const slides = blocks.filter((b): b is Extract<Block, { type: 'slide' }> => b.type === 'slide')
      const otherBlocks = blocks.filter((b) => b.type !== 'slide')

      const addSlideBlock = (slideTitle: string, bulletItems: string[]) => {
        const slide = pptx.addSlide({ masterName: 'NEXUS_CONTENT' })

        // Kicker + Title
        slide.addText(title.slice(0, 30).toUpperCase(), {
          x: 0.58, y: 0.38, w: 8.8, h: 0.28,
          fontSize: 10, bold: true, color: theme.accent, charSpacing: 2, fontFace: 'Segoe UI',
        })
        slide.addText(slideTitle, {
          x: 0.55, y: 0.62, w: 6.2, h: 0.9,
          fontSize: 24, bold: true, color: theme.primaryDark, fontFace: 'Segoe UI',
        })
        slide.addShape('rect', { x: 0.58, y: 1.52, w: 0.85, h: 0.05, fill: { color: theme.accent } })

        // Detect a headline stat from bullets (e.g. "$2.4M" / "40%")
        const statMatch = bulletItems
          .map((b) => b.match(/([$€£]\d[\d.,]*\s?[MBKmbk]?|\d+(?:\.\d+)?%)/))
          .find(Boolean)
        const statValue = statMatch?.[1] ?? null

        const hasStat = Boolean(statValue)

        // Bullets (left column; narrower when stat panel present)
        const textW = hasStat ? 5.4 : 8.3
        slide.addText(
          bulletItems.slice(0, 5).map((b, i) => ({
            text: b.replace(/([$€£]\d[\d.,]*\s?[MBKmbk]?|\d+(?:\.\d+)?%)/, '$1'),
            options: {
              bullet: false,
              color: theme.text,
              breakLine: true,
              paraSpaceAfter: 10,
            },
          })),
          {
            x: 0.9, y: 1.85, w: textW, h: 3.1,
            fontSize: 14.5, lineSpacingMultiple: 1.25, fontFace: 'Segoe UI',
          }
        )
        // Custom square markers for each bullet line
        bulletItems.slice(0, 5).forEach((_, i) => {
          slide.addShape('rect', {
            x: 0.58, y: 2.02 + i * 0.52, w: 0.09, h: 0.09,
            fill: { color: i % 2 === 0 ? theme.primary : theme.accent },
          })
        })

        // Right panel: big stat card or decorative block
        if (hasStat) {
          slide.addShape('roundRect', {
            x: 6.55, y: 1.85, w: 2.9, h: 2.9, rectRadius: 0.12,
            fill: { color: theme.surface }, line: { color: theme.border, width: 0.75 },
          })
          slide.addText(statValue!, {
            x: 6.55, y: 2.5, w: 2.9, h: 1.0,
            fontSize: 44, bold: true, color: theme.primary, align: 'center', fontFace: 'Segoe UI',
          })
          slide.addText('KEY METRIC', {
            x: 6.55, y: 3.65, w: 2.9, h: 0.3,
            fontSize: 10, bold: true, color: theme.textMuted, align: 'center', charSpacing: 3,
          })
        } else {
          slide.addShape('ellipse', {
            x: 7.75, y: 2.35, w: 1.55, h: 1.55,
            fill: { color: theme.surface }, line: { color: theme.border, width: 0.75 },
          })
          slide.addShape('ellipse', {
            x: 8.3, y: 2.9, w: 0.55, h: 0.55,
            fill: { color: theme.accent },
          })
        }
      }

      const addSectionDivider = (text: string) => {
        const slide = pptx.addSlide({ masterName: 'NEXUS_SECTION' })
        slide.addText(text, {
          x: 0.9, y: 2.15, w: 8.2, h: 1.0,
          fontSize: 30, bold: true, color: theme.white, fontFace: 'Segoe UI',
        })
        slide.addShape('rect', { x: 0.95, y: 3.2, w: 1.6, h: 0.06, fill: { color: theme.accent } })
      }

      const addTableSlide = (heading: string, rows: string[][]) => {
        const slide = pptx.addSlide({ masterName: 'NEXUS_CONTENT' })
        slide.addText(heading, {
          x: 0.55, y: 0.45, w: 8.9, h: 0.8,
          fontSize: 24, bold: true, color: theme.primaryDark, fontFace: 'Segoe UI',
        })
        slide.addShape('rect', { x: 0.58, y: 1.25, w: 1.15, h: 0.055, fill: { color: theme.accent } })
        const tableRows = rows.map((row, i) => ({
          options: {
            bold: i === 0,
            color: i === 0 ? theme.white : theme.text,
            fill: { color: i === 0 ? theme.primary : i % 2 === 1 ? theme.surface : theme.white },
            fontSize: 13,
            valign: 'middle' as const,
          },
          text: row.map((c) => c.replace(/\|/g, '/')),
        }))
        slide.addTable(tableRows as unknown as Parameters<typeof slide.addTable>[0], {
          x: 0.55, y: 1.6, w: 8.9, fontSize: 13,
          border: { pt: 0.5, color: theme.border },
          rowH: 0.42, margin: 0.08,
        })
      }

      if (slides.length > 0) {
        for (const sl of slides) {
          if (sl.title.startsWith('~') || sl.bullets.length === 0) {
            addSectionDivider(sl.title.replace(/^~\s*/, ''))
          } else {
            addSlideBlock(sl.title, sl.bullets)
          }
        }
      }

      // Auto-convert other blocks
      let currentBullets: string[] = []
      let currentTitle = ''
      const flush = () => {
        if (currentBullets.length === 0) return
        addSlideBlock(currentTitle || title, currentBullets.slice(0, 6))
        currentBullets = []
      }
      for (const block of otherBlocks) {
        if (block.type === 'heading') {
          flush()
          currentTitle = block.text
        } else if (block.type === 'bullets') {
          currentBullets.push(...block.items)
        } else if (block.type === 'paragraph') {
          const sentences = block.text.match(/[^.!?]+[.!?]+/g) ?? [block.text]
          currentBullets.push(...sentences.slice(0, 5).map((x) => x.trim()))
        } else if (block.type === 'table' && block.rows.length > 0) {
          flush()
          addTableSlide(currentTitle || 'Data', block.rows)
        }
        if (currentBullets.length >= 6) flush()
      }
      flush()

      /* ---- Closing slide ---- */
      const closing = pptx.addSlide({ masterName: 'NEXUS_TITLE' })
      closing.addText('Thank You', {
        x: 0.55, y: 2.1, w: 8.9, h: 1.0,
        fontSize: 40, bold: true, color: theme.white, align: 'center',
      })
      closing.addText('Generated by NEXUS AI · ' + theme.name + ' theme', {
        x: 0.55, y: 3.2, w: 8.9, h: 0.4,
        fontSize: 13, color: theme.surfaceAlt, align: 'center', italic: true,
      })

      buffer = Buffer.from((await pptx.write({ outputType: 'nodebuffer' })) as ArrayBuffer)
      filename = `${id}.pptx`
    } else {
      // Markdown
      const lines: string[] = [`# ${title}`, '']
      for (const block of blocks) {
        if (block.type === 'heading') {
          lines.push(`${'#'.repeat(Math.min(block.level ?? 2, 4) + 1)} ${block.text}`, '')
        } else if (block.type === 'paragraph') {
          lines.push(block.text, '')
        } else if (block.type === 'bullets') {
          block.items.forEach((i) => lines.push(`- ${i}`))
          lines.push('')
        } else if (block.type === 'table') {
          if (block.rows.length > 0) {
            lines.push(`| ${block.rows[0].join(' | ')} |`)
            lines.push(`| ${block.rows[0].map(() => '---').join(' | ')} |`)
            block.rows.slice(1).forEach((r) => lines.push(`| ${r.join(' | ')} |`))
            lines.push('')
          }
        } else if (block.type === 'slide') {
          lines.push(`## ${block.title}`)
          block.bullets.forEach((b) => lines.push(`- ${b}`))
          lines.push('')
        }
      }
      buffer = Buffer.from(lines.join('\n'), 'utf8')
      filename = `${id}.md`
    }

    await writeFile(path.join(FILES_DIR, filename), buffer)

    // MEDIA FIX: persist the file bytes to the DB so the download URL is
    // durable across Vercel's ephemeral /tmp. The record's id IS the file
    // id, so /api/office/file/[id] can fall back to this row directly.
    await ensurePerUserColumns()
    try {
      await db.generatedDocument.create({
        data: {
          id,
          filename: `${title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'document'}.${format}`,
          format,
          title,
          summary: '',
          downloadUrl: `/api/office/file/${id}`,
          size: buffer.length,
          data: buffer.toString('base64'),
          mimeType: MIME_TYPES[format],
          userId: user?.id ?? null,
        },
      })
    } catch (dbErr) {
      // Schema drift (missing data/mimeType column) → retry metadata-only,
      // then give up silently (the warm /tmp copy still serves this lambda).
      const msg = dbErr instanceof Error ? dbErr.message : ''
      if (/data|mimeType|column/i.test(msg)) {
        try {
          await db.generatedDocument.create({
            data: {
              id,
              filename: `${title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'document'}.${format}`,
              format,
              title,
              summary: '',
              downloadUrl: `/api/office/file/${id}`,
              size: buffer.length,
              userId: user?.id ?? null,
            },
          })
        } catch {
          /* best-effort */
        }
      } else {
        console.error('[api/office/create] DB persist failed:', dbErr)
      }
    }

    return NextResponse.json({
      file: {
        url: `/api/office/file/${id}`,
        format,
        title,
        filename: `${title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'document'}.${format}`,
        size: buffer.length,
        mimeType: MIME_TYPES[format],
      },
    })
  } catch (error) {
    console.error('[api/office/create] POST error:', error)
    const message = error instanceof Error ? error.message : 'Document generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
