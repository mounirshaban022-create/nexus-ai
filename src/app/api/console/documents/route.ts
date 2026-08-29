import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'
import { audit } from '@/lib/console/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* ------------------------------------------------------------------ */
/* DOCUMENT STUDIO — premium template engine with real DOCX output     */
/*                                                                     */
/* The in-app document flow stores AI-drafted files, but the owner     */
/* asked for "premium templates and features" with correct editing +   */
/* attachment + download. This studio provides professional business   */
/* templates rendered with the `docx` library into REAL Word files     */
/* (native headings, tables, currency formatting, page numbers),       */
/* persisted to the standard GeneratedDocument store so they show up   */
/* in the app's document library and download reliably forever.        */
/* ------------------------------------------------------------------ */

export const TEMPLATES: { id: string; name: string; description: string; fields: { key: string; label: string; type: 'text' | 'textarea' | 'number'; placeholder?: string; required?: boolean }[] }[] = [
  {
    id: 'business-proposal', name: 'Business Proposal',
    description: 'Client-ready proposal: executive summary, scope, deliverables, pricing table, terms.',
    fields: [
      { key: 'company', label: 'Your company', type: 'text', required: true },
      { key: 'client', label: 'Client name', type: 'text', required: true },
      { key: 'project', label: 'Project title', type: 'text', required: true },
      { key: 'summary', label: 'Executive summary', type: 'textarea', required: true },
      { key: 'scope', label: 'Scope of work (one item per line)', type: 'textarea', required: true },
      { key: 'deliverables', label: 'Deliverables (one per line)', type: 'textarea' },
      { key: 'timeline', label: 'Timeline', type: 'text', placeholder: 'e.g. 6 weeks from kickoff' },
      { key: 'price', label: 'Total price (USD)', type: 'number', placeholder: '12000' },
      { key: 'terms', label: 'Payment terms', type: 'text', placeholder: '50% upfront, 50% on delivery' },
    ],
  },
  {
    id: 'invoice', name: 'Professional Invoice',
    description: 'Clean invoice with line items, subtotal, tax and total — currency formatted.',
    fields: [
      { key: 'from', label: 'From (your business)', type: 'text', required: true },
      { key: 'billTo', label: 'Bill to', type: 'text', required: true },
      { key: 'invoiceNo', label: 'Invoice #', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'text', placeholder: '2026-08-29' },
      { key: 'items', label: 'Line items (description | qty | unit price — one per line)', type: 'textarea', required: true, placeholder: 'Design system | 1 | 4000' },
      { key: 'taxRate', label: 'Tax rate %', type: 'number', placeholder: '5' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'report', name: 'Executive Report',
    description: 'Structured business report: overview, findings, metrics table, recommendations.',
    fields: [
      { key: 'title', label: 'Report title', type: 'text', required: true },
      { key: 'author', label: 'Author / team', type: 'text', required: true },
      { key: 'period', label: 'Reporting period', type: 'text', placeholder: 'Q3 2026' },
      { key: 'overview', label: 'Overview', type: 'textarea', required: true },
      { key: 'findings', label: 'Key findings (one per line)', type: 'textarea', required: true },
      { key: 'metrics', label: 'Metrics (name | value | target — one per line)', type: 'textarea' },
      { key: 'recommendations', label: 'Recommendations (one per line)', type: 'textarea' },
    ],
  },
  {
    id: 'contract', name: 'Service Agreement',
    description: 'Simple MSA-style agreement with parties, services, IP, confidentiality, termination.',
    fields: [
      { key: 'partyA', label: 'Party A (provider)', type: 'text', required: true },
      { key: 'partyB', label: 'Party B (client)', type: 'text', required: true },
      { key: 'services', label: 'Services (one per line)', type: 'textarea', required: true },
      { key: 'startDate', label: 'Start date', type: 'text' },
      { key: 'fee', label: 'Fee (USD)', type: 'number' },
      { key: 'governingLaw', label: 'Governing law', type: 'text', placeholder: 'Emirate of Dubai, UAE' },
    ],
  },
  {
    id: 'letter', name: 'Business Letter',
    description: 'Formal letterhead letter with date, recipient block, body and signature.',
    fields: [
      { key: 'company', label: 'Your company', type: 'text', required: true },
      { key: 'recipient', label: 'Recipient', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'body', label: 'Letter body', type: 'textarea', required: true },
      { key: 'signer', label: 'Signer name', type: 'text' },
      { key: 'signerTitle', label: 'Signer title', type: 'text' },
    ],
  },
]

function moneyFmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const url = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)
    const docs = await db.generatedDocument.findMany({
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, filename: true, format: true, title: true, summary: true, size: true, mimeType: true, createdAt: true },
    })
    return NextResponse.json({
      templates: TEMPLATES,
      documents: docs.map(d => ({ ...d, fileUrl: `/api/console/generations/file/documents/${d.id}` })),
    })
  } catch (error) {
    console.error('[api/console/documents] GET error:', error)
    return NextResponse.json({ error: 'Failed to load document studio' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({}))
    const templateId = String(body?.template ?? '')
    const fields = (body?.fields ?? {}) as Record<string, string>
    const template = TEMPLATES.find(t => t.id === templateId)
    if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
    for (const f of template.fields) {
      if (f.required && !String(fields[f.key] ?? '').trim()) {
        return NextResponse.json({ error: `Missing required field: ${f.label}` }, { status: 400 })
      }
    }

    const docx = await import('docx')
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
      Table, TableRow, TableCell, WidthType, BorderStyle, PageNumber, Footer,
    } = docx

    const brand = '1F2937' // slate-900
    const accent = '047857' // emerald-700
    const muted = '6B7280'

    const p = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: (opts.size ?? 11) * 2, color: opts.color })],
        spacing: { after: opts.after ?? 120 },
        alignment: opts.align,
      })

    const heading = (text: string) => new Paragraph({
      children: [new TextRun({ text, bold: true, size: 26, color: brand })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 140 },
    })

    const line = (text: string) => new Paragraph({
      children: [new TextRun({ text, size: 22, color: '111827' })],
      spacing: { after: 100 },
      bullet: { level: 0 },
    })

    const cell = (text: string, opts: { bold?: boolean; fill?: string; color?: string } = {}) => new TableCell({
      children: [p(text, { bold: opts.bold, color: opts.color ?? '111827', after: 0 })],
      shading: opts.fill ? { fill: opts.fill } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
    })

    const divider = new Paragraph({
      children: [new TextRun({ text: '', size: 2 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent } },
      spacing: { after: 200 },
    })

    const money = (n: number) => moneyFmt(n)
    const lines = (key: string) => String(fields[key] ?? '').split('\n').map(s => s.trim()).filter(Boolean)

    let doc: InstanceType<typeof Document>
    let filename: string

    if (templateId === 'business-proposal') {
      const price = Number(fields.price ?? 0) || 0
      const scopeRows = lines('scope')
      const delivRows = lines('deliverables')
      doc = new Document({
        sections: [{
          properties: {},
          footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `${fields.company} — confidential`, size: 16, color: muted }), new TextRun({ children: ['    Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: muted })] })] }) },
          children: [
            new Paragraph({ children: [new TextRun({ text: fields.company, bold: true, size: 40, color: accent })], spacing: { after: 40 } }),
            new Paragraph({ children: [new TextRun({ text: `Business Proposal — ${fields.project}`, size: 24, color: brand })], spacing: { after: 120 } }),
            divider,
            p(`Prepared for: ${fields.client}`, { bold: true, size: 12 }),
            p(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { color: muted }),
            heading('Executive Summary'),
            p(fields.summary),
            heading('Scope of Work'),
            ...scopeRows.map(line),
            ...(delivRows.length ? [heading('Deliverables'), ...delivRows.map(line)] : []),
            heading('Timeline & Investment'),
            p(fields.timeline ? `Timeline: ${fields.timeline}` : 'Timeline: to be agreed at kickoff', { after: 60 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [cell('Item', { bold: true, fill: 'ECFDF5' }), cell('Amount', { bold: true, fill: 'ECFDF5' })] }),
                new TableRow({ children: [cell(fields.project), cell(money(price))] }),
                new TableRow({ children: [cell('Total investment', { bold: true }), cell(money(price), { bold: true })] }),
              ],
            }),
            new Paragraph({ children: [new TextRun({ text: '', size: 8 })], spacing: { after: 100 } }),
            p(fields.terms ? `Payment terms: ${fields.terms}` : 'Payment terms: net 30', { italics: true, color: muted }),
          ],
        }],
      })
      filename = `proposal-${fields.project.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`
    } else if (templateId === 'invoice') {
      const items = lines('items').map(l => {
        const [desc, qty, unit] = l.split('|').map(s => s.trim())
        return { desc: desc ?? 'Item', qty: Number(qty || 1), unit: Number(unit || 0) }
      })
      const subtotal = items.reduce((s, i) => s + i.qty * i.unit, 0)
      const taxRate = Number(fields.taxRate ?? 0) || 0
      const tax = subtotal * taxRate / 100
      doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: 'INVOICE', bold: true, size: 44, color: brand })], alignment: AlignmentType.RIGHT, spacing: { after: 60 } }),
            p(fields.invoiceNo, { color: accent, bold: true, size: 13, align: AlignmentType.RIGHT }),
            divider,
            p(`From: ${fields.from}`, { bold: true }),
            p(`Bill to: ${fields.billTo}`, { after: 200 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [cell('Description', { bold: true, fill: 'ECFDF5' }), cell('Qty', { bold: true, fill: 'ECFDF5' }), cell('Unit', { bold: true, fill: 'ECFDF5' }), cell('Amount', { bold: true, fill: 'ECFDF5' })] }),
                ...items.map(i => new TableRow({ children: [cell(i.desc), cell(String(i.qty)), cell(money(i.unit)), cell(money(i.qty * i.unit))] })),
                new TableRow({ children: [cell('Subtotal', { bold: true }), cell(''), cell(''), cell(money(subtotal), { bold: true })] }),
                new TableRow({ children: [cell(`Tax (${taxRate}%)`), cell(''), cell(''), cell(money(tax))] }),
                new TableRow({ children: [cell('TOTAL DUE', { bold: true, fill: 'ECFDF5' }), cell('', { fill: 'ECFDF5' }), cell('', { fill: 'ECFDF5' }), cell(money(subtotal + tax), { bold: true, fill: 'ECFDF5' })] }),
              ],
            }),
            new Paragraph({ children: [new TextRun({ text: '', size: 8 })], spacing: { after: 100 } }),
            ...(fields.date ? [p(`Date: ${fields.date}`, { color: muted })] : []),
            ...(fields.notes ? [p(`Notes: ${fields.notes}`, { italics: true, color: muted })] : []),
          ],
        }],
      })
      filename = `invoice-${fields.invoiceNo.replace(/[^a-z0-9\-]+/gi, '-')}.docx`
    } else if (templateId === 'report') {
      const metrics = lines('metrics').map(l => l.split('|').map(s => s.trim()))
      doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: fields.title, bold: true, size: 36, color: brand })], spacing: { after: 40 } }),
            p(`${fields.author}${fields.period ? ` — ${fields.period}` : ''}`, { color: muted }),
            divider,
            heading('Overview'),
            p(fields.overview),
            heading('Key Findings'),
            ...lines('findings').map(line),
            ...(metrics.length ? [
              heading('Metrics'),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({ children: [cell('Metric', { bold: true, fill: 'ECFDF5' }), cell('Value', { bold: true, fill: 'ECFDF5' }), cell('Target', { bold: true, fill: 'ECFDF5' })] }),
                  ...metrics.map(m => new TableRow({ children: [cell(m[0] ?? ''), cell(m[1] ?? ''), cell(m[2] ?? '—')] })),
                ],
              }),
              new Paragraph({ children: [new TextRun({ text: '', size: 8 })], spacing: { after: 100 } }),
            ] : []),
            ...(lines('recommendations').length ? [heading('Recommendations'), ...lines('recommendations').map(line)] : []),
          ],
        }],
      })
      filename = `report-${fields.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`
    } else if (templateId === 'contract') {
      doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: 'SERVICE AGREEMENT', bold: true, size: 34, color: brand })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
            p(`This Service Agreement ("Agreement") is entered into between ${fields.partyA} ("Provider") and ${fields.partyB} ("Client").`, { after: 200 }),
            heading('1. Services'),
            ...lines('services').map(line),
            heading('2. Term'),
            p(fields.startDate ? `The engagement commences on ${fields.startDate} and continues until terminated as provided herein.` : 'The engagement commences on the Effective Date and continues until terminated as provided herein.'),
            heading('3. Fees'),
            p(fields.fee ? `Client shall pay Provider a fee of ${money(Number(fields.fee))} in accordance with the payment schedule agreed in writing.` : 'Fees shall be as agreed in writing between the parties.'),
            heading('4. Intellectual Property'),
            p('Upon full payment, deliverables created under this Agreement become the property of the Client. Provider retains rights to pre-existing tools and know-how.'),
            heading('5. Confidentiality'),
            p('Each party shall keep confidential information of the other party secret and use it solely for the purposes of this Agreement.'),
            heading('6. Termination'),
            p('Either party may terminate this Agreement with fourteen (14) days written notice. Work completed to the termination date remains payable.'),
            heading('7. Governing Law'),
            p(fields.governingLaw ? `This Agreement is governed by the laws of ${fields.governingLaw}.` : 'This Agreement is governed by the laws agreed in writing between the parties.'),
            new Paragraph({ children: [new TextRun({ text: '', size: 16 })], spacing: { after: 240 } }),
            p(`${fields.partyA}: ______________________          ${fields.partyB}: ______________________`, { color: muted }),
          ],
        }],
      })
      filename = `agreement-${fields.partyB.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`
    } else {
      // letter
      doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: fields.company, bold: true, size: 30, color: accent })], spacing: { after: 200 } }),
            p(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { color: muted }),
            p(`Dear ${fields.recipient},`, { after: 160 }),
            ...String(fields.body).split('\n').map(s => s.trim()).filter(Boolean).map(x => p(x)),
            new Paragraph({ children: [new TextRun({ text: '', size: 12 })], spacing: { after: 240 } }),
            p('Sincerely,', { after: 60 }),
            p(fields.signer ?? fields.company, { bold: true }),
            ...(fields.signerTitle ? [p(fields.signerTitle, { color: muted })] : []),
          ],
        }],
      })
      filename = `letter-${fields.recipient.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`
    }

    const packed = await Packer.toBuffer(doc)
    const buf = Buffer.from(packed)
    const now = new Date()
    const created = await db.generatedDocument.create({
      data: {
        filename,
        format: 'docx',
        title: `${template.name}${fields.project ? ` — ${fields.project}` : fields.title ? ` — ${fields.title}` : fields.subject ? ` — ${fields.subject}` : ''}`,
        summary: `Generated from the ${template.name} premium template via console.`,
        downloadUrl: '',
        size: buf.length,
        data: buf.toString('base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        userId: null,
      },
    })
    // Self-referencing download URL for app-side downloads.
    await db.generatedDocument.update({ where: { id: created.id }, data: { downloadUrl: `/api/console/generations/file/documents/${created.id}` } })
    await audit('documents.generated', { target: filename, detail: `template=${templateId}, size=${buf.length}` })

    return NextResponse.json({ ok: true, document: { id: created.id, filename, size: buf.length, fileUrl: `/api/console/generations/file/documents/${created.id}` } })
  } catch (error) {
    console.error('[api/console/documents] POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed' }, { status: 500 })
  }
}
