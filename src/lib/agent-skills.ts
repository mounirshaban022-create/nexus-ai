/**
 * AGENT SKILLS — the real-work capabilities of NEXUS Agent.
 *
 * Inspired by the open-source agent frameworks on GitHub (AutoGPT's tool
 * registry, LangChain tools, and the "Hermes"-style function-calling
 * agents): a curated registry of skills the agent can execute to DO real
 * work — produce documents, spreadsheets, images, code, QR codes — not
 * just fetch data.
 *
 * Each skill follows the same ConnectorDefinition shape as the data
 * connectors, so the agent's tool loop (prompt building, validation,
 * execution, TOOL_RESULT) works for both without special-casing.
 */

import type { ConnectorDefinition } from './connectors'

const ORIGIN = 'http://localhost:3000'

export const AGENT_SKILLS: ConnectorDefinition[] = [
  {
    id: 'create_document',
    name: 'Create Document',
    category: 'work',
    description: 'Create a real Word document from structured content.',
    llmDescription:
      'Creates a real downloadable Word (.docx) document from content you provide. Use for reports, letters, memos, plans — any deliverable the user can keep. Returns a download URL.',
    params: [
      { name: 'title', type: 'string', description: 'Document title', required: true },
      { name: 'content', type: 'string', description: 'The document text — use # for main title, ## for sections, - for bullets', required: true },
      { name: 'format', type: 'string', description: 'docx (default), xlsx or pptx', required: false },
    ],
    sampleArgs: { title: 'Project Plan', content: '# Project Plan\n\n## Goals\n- Ship v1', format: 'docx' },
    execute: async (args) => {
      const format = String(args.format ?? 'docx').toLowerCase()
      const title = String(args.title ?? 'Document').slice(0, 200)
      const content = String(args.content ?? '')
      if (!content) throw new Error('content required')
      const res = await fetch(`${ORIGIN}/api/studio/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: ['docx', 'md'].includes(format) ? format : 'docx', title, markdown: content }),
      })
      const data = await res.json()
      if (!res.ok || !data.file) throw new Error(data.error || 'Document creation failed')
      return {
        downloadUrl: `${data.file.url}?download=1&title=${encodeURIComponent(title)}`,
        format: data.file.format,
        note: 'Document created — include the download URL in your final answer.',
      }
    },
  },
  {
    id: 'create_spreadsheet',
    name: 'Create Spreadsheet',
    category: 'work',
    description: 'Create a real Excel spreadsheet with data and formulas.',
    llmDescription:
      'Creates a real Excel (.xlsx) spreadsheet with headers, data rows and LIVE formulas. Use for budgets, trackers, data tables, financial models. Parameters are SIMPLE STRINGS (no nested JSON): headers is comma-separated, rows is one line per row with comma-separated cells (numbers stay numbers automatically), formulas is optional "rowIndex,colIndex,=FORMULA" entries separated by semicolons (row 0 = header row). Returns a download URL.',
    params: [
      { name: 'title', type: 'string', description: 'Spreadsheet title', required: true },
      { name: 'headers', type: 'string', description: 'Column headers, comma-separated: "Quarter, Revenue, Costs, Profit"', required: true },
      { name: 'rows', type: 'string', description: 'Data rows — one row per line, cells comma-separated: "Q1, 10000, 8000, 2000\\nQ2, 12000, 9500, 2500"', required: true },
      { name: 'formulas', type: 'string', description: 'Optional formulas as "row,col,=FORMULA" separated by semicolons, e.g. "5,1,=SUM(B2:B5);5,2,=SUM(C2:C5)" (row 0 is the header row)', required: false },
    ],
    sampleArgs: {
      title: 'Budget',
      headers: 'Item, Cost',
      rows: 'Rent, 1200\nFood, 400',
      formulas: '3,1,=SUM(B2:B3)',
    },
    execute: async (args) => {
      const title = String(args.title ?? 'Spreadsheet').slice(0, 120)
      // Flat string params (reliable for models of every size). Also accept
      // structured arrays when the model passes them anyway.
      const parseCells = (line: string): Array<string | number> =>
        line.split(',').map((c) => {
          const t = c.trim()
          if (t !== '' && !Number.isNaN(Number(t))) return Number(t)
          return t
        })

      let headers: string[]
      let rows: Array<Array<string | number>>
      if (Array.isArray(args.headers)) {
        headers = args.headers.map(String)
      } else {
        headers = String(args.headers ?? '')
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean)
      }
      if (Array.isArray(args.rows)) {
        rows = (args.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map((c) => (typeof c === 'number' ? c : String(c))) : [String(r)]))
      } else {
        rows = String(args.rows ?? '')
          .split(/\n|;/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map(parseCells)
      }
      if (headers.length === 0) throw new Error('headers required: comma-separated column names')
      if (rows.length === 0) throw new Error('rows required: one line per row, cells comma-separated')

      // Formulas: "row,col,=FORMULA; row,col,=FORMULA" (row 0 = header row)
      const formulas: Array<{ row: number; col: number; formula: string }> = []
      const rawFormulas = Array.isArray(args.formulas)
        ? (args.formulas as Array<Record<string, unknown>>).map((f) => `${f.row},${f.col},${f.formula}`)
        : String(args.formulas ?? '').split(';')
      for (const entry of rawFormulas) {
        const t = String(entry).trim()
        if (!t) continue
        const m = /^(\d+)\s*,\s*(\d+)\s*,\s*(=.+)$/.exec(t)
        if (m) formulas.push({ row: Number(m[1]), col: Number(m[2]), formula: m[3].trim() })
      }

      const res = await fetch(`${ORIGIN}/api/agent/spreadsheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sheets: [{ name: title.slice(0, 24) || 'Sheet', headers, rows, formulas }] }),
      })
      const data = await res.json()
      if (!res.ok || !data.file) throw new Error(data.error || 'Spreadsheet creation failed')
      return {
        downloadUrl: `${data.file.url}?download=1&title=${encodeURIComponent(title)}`,
        format: 'xlsx',
        rows: rows.length,
        note: 'Spreadsheet created with real data and formulas — include the download URL in your final answer.',
      }
    },
  },
  {
    id: 'generate_image',
    name: 'Generate Image',
    category: 'work',
    description: 'Generate an AI image from a description.',
    llmDescription:
      'Generates an AI image from a text description and returns a URL to show inline. Use for illustrations, logos, concept art, diagrams-as-art.',
    params: [
      { name: 'prompt', type: 'string', description: 'Detailed visual description', required: true },
    ],
    sampleArgs: { prompt: 'A minimalist logo of a mountain, warm colors' },
    execute: async (args) => {
      const prompt = String(args.prompt ?? '').slice(0, 2000)
      if (!prompt) throw new Error('prompt required')
      const res = await fetch(`${ORIGIN}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size: '1024x1024' }),
      })
      const data = await res.json()
      if (!res.ok || !data.image?.url) throw new Error(data.error || 'Image generation failed')
      return { imageUrl: data.image.url, note: 'Image generated — include the URL in your final answer.' }
    },
  },
  {
    id: 'run_code',
    name: 'Run Code',
    category: 'work',
    description: 'Execute JavaScript or Python code in a sandbox.',
    llmDescription:
      'Executes JavaScript or Python code in an isolated sandbox and returns stdout/stderr. Use for calculations, data processing, verification of numbers, generating computed tables.',
    params: [
      { name: 'language', type: 'string', description: 'javascript | python', required: true },
      { name: 'code', type: 'string', description: 'The code to run', required: true },
    ],
    sampleArgs: { language: 'javascript', code: 'console.log(2+2)' },
    execute: async (args) => {
      const language = String(args.language ?? 'javascript').toLowerCase()
      const code = String(args.code ?? '')
      if (!code) throw new Error('code required')
      const res = await fetch(`${ORIGIN}/api/code/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: ['javascript', 'typescript', 'python'].includes(language) ? language : 'javascript', code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Code execution failed')
      return {
        stdout: data.result?.stdout?.slice(0, 3000),
        stderr: data.result?.stderr?.slice(0, 1500),
        exitCode: data.result?.exitCode,
      }
    },
  },
  {
    id: 'qr_code',
    name: 'QR Code',
    category: 'work',
    description: 'Generate a QR code for any text or URL.',
    llmDescription:
      'Generates a QR code image for a URL or any text (uses the free goqr.me API). Use for links, contact info, WiFi sharing, event details.',
    params: [
      { name: 'data', type: 'string', description: 'The URL or text to encode', required: true },
      { name: 'size', type: 'string', description: 'Size like 300x300 (default)', required: false },
    ],
    sampleArgs: { data: 'https://example.com', size: '300x300' },
    execute: async (args) => {
      const data = String(args.data ?? '').trim()
      if (!data) throw new Error('data required')
      const size = /^\d{2,4}x\d{2,4}$/.test(String(args.size ?? '')) ? String(args.size) : '300x300'
      // goqr.me — free, no key (from the public-apis registry)
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(data.slice(0, 1500))}`
      return { qrUrl: url, note: 'QR code generated — include the URL in your final answer.' }
    },
  },
  {
    id: 'currency_convert',
    name: 'Currency Convert',
    category: 'work',
    description: 'Convert between world currencies at live rates.',
    llmDescription:
      'Converts an amount between currencies using live exchange rates (free Frankfurter API, ECB data). Use for prices, budgets, travel costs.',
    params: [
      { name: 'amount', type: 'number', description: 'Amount to convert', required: true },
      { name: 'from', type: 'string', description: 'Source currency code (e.g. USD)', required: true },
      { name: 'to', type: 'string', description: 'Target currency code (e.g. AED)', required: true },
    ],
    sampleArgs: { amount: 100, from: 'USD', to: 'AED' },
    execute: async (args) => {
      const amount = Number(args.amount)
      const from = String(args.from ?? '').toUpperCase().slice(0, 3)
      const to = String(args.to ?? '').toUpperCase().slice(0, 3)
      if (!Number.isFinite(amount) || !from || !to) throw new Error('amount, from and to are required')
      const res = (await fetch(
        `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`,
        { signal: AbortSignal.timeout(15_000) }
      ).then((r) => r.json())) as { amount?: number; rates?: Record<string, number> }
      const converted = res.rates?.[to]
      if (typeof converted !== 'number') throw new Error(`Cannot convert ${from} → ${to}`)
      return { amount, from, to, converted, rate: converted / amount, source: 'Frankfurter (ECB)' }
    },
  },
  {
    id: 'translate_text',
    name: 'Translate',
    category: 'work',
    description: 'Translate text between languages.',
    llmDescription:
      'Translates text between any languages using the multi-AI pool. Use when the user needs content in another language.',
    params: [
      { name: 'text', type: 'string', description: 'Text to translate', required: true },
      { name: 'to', type: 'string', description: 'Target language (e.g. Arabic, French)', required: true },
    ],
    sampleArgs: { text: 'Good morning', to: 'Arabic' },
    execute: async (args) => {
      const text = String(args.text ?? '').slice(0, 4000)
      const to = String(args.to ?? '').slice(0, 40)
      if (!text || !to) throw new Error('text and to are required')
      const { smartChat } = await import('./smart-chat')
      const translation = await smartChat(
        [
          { role: 'assistant', content: `Translate the user's text into ${to}. Output ONLY the translation, nothing else.` },
          { role: 'user', content: text },
        ],
        { maxTokens: 2000, task: 'documents' }
      )
      return { translation: translation.trim() }
    },
  },
]

/** Map of skill id → definition (mirrors CONNECTOR_MAP's shape). */
export const AGENT_SKILL_MAP = new Map(AGENT_SKILLS.map((s) => [s.id, s]))

/** Skill ids that are always enabled for the agent (real-work layer). */
export const DEFAULT_AGENT_SKILL_IDS = AGENT_SKILLS.map((s) => s.id)
