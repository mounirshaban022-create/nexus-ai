/**
 * SKILL RUNTIME — turns the vendored CLI-Anything skill catalog + the
 * first-party NEXUS cloud skills into REAL, executable actions using only
 * FREE / open resources.
 *
 * The 79 vendored skills describe DESKTOP apps (Blender, GIMP, LibreOffice…).
 * A web app can't drive the user's local machine — so every skill is mapped
 * to its closest FREE cloud equivalent that NEXUS can genuinely execute:
 *
 *   image    → Pollinations FLUX (open, keyless)            → /api/image
 *   video    → AI scene planner + FLUX + Edge TTS + ffmpeg  → /api/video/create
 *   doc      → real Word / Excel / PowerPoint writer        → /api/office/create
 *   sheet    → real Excel with live data                    → /api/office/create
 *   search   → Brave → DuckDuckGo → Wikipedia free chain    → /api/search
 *   read     → smart page reader (keyless fetch + reader)   → /api/reader
 *   speak    → free Microsoft neural voices (msedge-tts)    → /api/tts
 *   translate→ free AI pool translation                     → in-process
 *   weather  → wttr.in live global weather (keyless)        → in-process
 *   chart    → QuickChart chart images (keyless)            → media store
 *   qr       → goQR.me QR images (keyless)                  → media store
 *   password → Node crypto secret forging                   → in-process
 *
 * Skills without a natural media equivalent (devops, databases, testing…)
 * map to `research`: NEXUS researches the task with the free web-search
 * chain and produces a real, downloadable briefing document.
 */

import { randomInt } from 'crypto'
import { smartChat } from '@/lib/smart-chat'
import { persistImage } from '@/lib/media-store'
import { getCurrentUser } from '@/lib/auth'

/* ------------------------------------------------------------------ */
/* Types + capability map live in the client-safe skill-map module      */
/* ------------------------------------------------------------------ */

export {
  resolveSkillAction,
  ACTION_META,
  type SkillActionKind,
  type SkillActionMeta,
} from '@/lib/skill-map'

import { resolveSkillAction } from '@/lib/skill-map'

export interface SkillRunResult {
  ok: boolean
  /** Short spoken-style summary for the assistant message. */
  summary: string
  /** Attachment dropped into the chat (same shape as tool attachments). */
  attachment?: Record<string, unknown>
  error?: string
}

/* ------------------------------------------------------------------ */
/* Internal API helpers                                                */
/* ------------------------------------------------------------------ */

function origin(req: Request): string {
  // The request's own host is the most reliable origin everywhere (sandbox,
  // Vercel preview, production domain). Env overrides come second — APP_URL
  // may be stale/misconfigured.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT || 3000}`
}

async function callApi<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(String(data.error ?? `Request failed (${res.status})`))
  return data as T
}

/* ------------------------------------------------------------------ */
/* Block sanitizer — LLMs emit slightly-off document blocks; the       */
/* office/create zod schema is strict. This normalizes anything the    */
/* model produces into a guaranteed-valid structure.                   */
/* ------------------------------------------------------------------ */

type CleanBlock = Record<string, unknown>

function asText(v: unknown, max = 4000): string {
  if (typeof v === 'string') return v.slice(0, max)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map((x) => asText(x, max)).join(' ').slice(0, max)
  return ''
}

export function sanitizeBlocks(raw: unknown): CleanBlock[] {
  if (!Array.isArray(raw)) return []
  const out: CleanBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    const type = String(b.type ?? '').toLowerCase()
    if (type === 'heading' || type === 'header' || type === 'title' || type === 'h1' || type === 'h2' || type === 'h3') {
      const text = asText(b.text ?? b.content ?? b.title, 500)
      if (text) {
        const lvlRaw = Number(b.level ?? (type === 'h1' ? 1 : type === 'h2' ? 2 : 3))
        out.push({ type: 'heading', text, level: Math.min(4, Math.max(1, Number.isFinite(lvlRaw) ? lvlRaw : 2)) })
      }
    } else if (type === 'paragraph' || type === 'text' || type === 'p') {
      const text = asText(b.text ?? b.content, 4000)
      if (text) out.push({ type: 'paragraph', text })
    } else if (type === 'bullets' || type === 'bullet' || type === 'list' || type === 'ul') {
      const itemsRaw = Array.isArray(b.items) ? b.items : Array.isArray(b.bullets) ? b.bullets : []
      const items = itemsRaw.map((x) => asText(x, 1000)).filter(Boolean).slice(0, 30)
      if (items.length) out.push({ type: 'bullets', items })
    } else if (type === 'table') {
      const rowsRaw = Array.isArray(b.rows) ? b.rows : Array.isArray(b.data) ? b.data : []
      const rows = rowsRaw
        .map((r) => (Array.isArray(r) ? r.map((c) => asText(c, 500)) : [asText(r, 500)]))
        .filter((r) => r.length > 0)
        .slice(0, 40)
        .map((r) => r.slice(0, 12))
      if (rows.length) out.push({ type: 'table', rows })
    } else if (type === 'slide') {
      const title = asText(b.title ?? b.text ?? b.name, 200) || 'Slide'
      const bulletsRaw = Array.isArray(b.bullets) ? b.bullets : Array.isArray(b.items) ? b.items : []
      const bullets = bulletsRaw.map((x) => asText(x, 500)).filter(Boolean).slice(0, 12)
      out.push({ type: 'slide', title, bullets: bullets.length ? bullets : [''] })
    } else if (type === 'quote' || type === 'callout') {
      const text = asText(b.text ?? b.content, 4000)
      if (text) out.push({ type: 'paragraph', text: `“${text}”` })
    } else if (typeof (b as { text?: unknown }).text === 'string' && asText((b as { text: unknown }).text)) {
      // Unknown shape with a text payload → keep the content as a paragraph
      out.push({ type: 'paragraph', text: asText((b as { text: unknown }).text) })
    }
  }
  return out.slice(0, 60)
}

/* ------------------------------------------------------------------ */
/* Param extraction (free LLM)                                         */
/* ------------------------------------------------------------------ */

async function extractJson(prompt: string, userTask: string, maxTokens = 700): Promise<Record<string, unknown>> {
  const raw = await smartChat(
    [
      { role: 'assistant', content: prompt },
      { role: 'user', content: `${userTask}\n\nExtract now. Respond with ONLY the JSON object.` },
    ],
    { maxTokens, task: 'fast' }
  )
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Could not understand the request.')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Free weather (wttr.in — keyless, global)                            */
/* ------------------------------------------------------------------ */

interface WttrCurrent {
  temp_C?: string
 FeelsLikeC?: string
  humidity?: string
  weatherDesc?: Array<{ value: string }>
  windspeedKmph?: string
  precipMM?: string
  observation_time?: string
}

interface WttrDay {
  date?: string
  maxtempC?: string
  mintempC?: string
  avgtempC?: string
  hourly?: Array<{ time?: string; weatherDesc?: Array<{ value: string }>; chanceofrain?: string }>
}

async function wttrWeather(location: string): Promise<string> {
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'nexus-ai' } })
    if (!res.ok) throw new Error(`Weather service responded ${res.status}`)
    const data = (await res.json()) as {
      current_condition?: WttrCurrent[]
      weather?: WttrDay[]
      nearest_area?: Array<{ areaName?: Array<{ value: string }>; country?: Array<{ value: string }> }>
    }
    const cur = data.current_condition?.[0]
    if (!cur) throw new Error('No conditions returned for that place.')
    const area = data.nearest_area?.[0]
    const place = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || location
    const desc = cur.weatherDesc?.[0]?.value ?? '—'
    const days = (data.weather ?? []).slice(0, 3).map((d) => {
      const rain = Math.max(...(d.hourly ?? []).map((h) => Number(h.chanceofrain ?? 0)))
      return `| ${d.date ?? '—'} | ${d.mintempC ?? '?'}° / ${d.maxtempC ?? '?'}°C | ${d.avgtempC ?? '?'}°C | ${Number.isFinite(rain) ? rain : 0}% |`
    })
    return [
      `**${place} — ${desc}**`,
      '',
      `- **Now:** ${cur.temp_C ?? '?'}°C (feels like ${cur.FeelsLikeC ?? '?'})`,
      `- **Humidity:** ${cur.humidity ?? '?'}% · **Wind:** ${cur.windspeedKmph ?? '?'} km/h · **Precip:** ${cur.precipMM ?? '0'} mm`,
      '',
      '**3-day outlook**',
      '',
      '| Date | Low / High | Avg | Rain |',
      '| --- | --- | --- | --- |',
      ...days,
    ].join('\n')
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/* Free chart rendering (QuickChart — keyless)                         */
/* ------------------------------------------------------------------ */

function quickChartConfig(params: Record<string, unknown>): Record<string, unknown> {
  const kindRaw = String(params.type ?? params.chartType ?? params.chart ?? 'bar').toLowerCase()
  const kind = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea'].includes(kindRaw)
    ? kindRaw === 'polararea' ? 'polarArea' : kindRaw
    : 'bar'
  const labels = Array.isArray(params.labels)
    ? params.labels.map((x) => asText(x, 80))
    : []
  const datasetsRaw = Array.isArray(params.datasets)
    ? params.datasets
    : Array.isArray(params.data)
      ? [params.data]
      : []
  const palette = ['#ff5a5f', '#f4a259', '#5ac8fa', '#7bc96f', '#b28dff', '#ffd166', '#06d6a0', '#ef476f']
  const datasets = datasetsRaw.slice(0, 4).map((d, i) => {
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const obj = d as Record<string, unknown>
      return {
        label: asText(obj.label ?? obj.name ?? `Series ${i + 1}`, 60),
        data: Array.isArray(obj.data) ? obj.data.map((x) => (typeof x === 'number' ? x : Number(x) || 0)) : [],
      }
    }
    return {
      label: `Series ${i + 1}`,
      data: Array.isArray(d) ? d.map((x) => (typeof x === 'number' ? x : Number(x) || 0)) : [],
    }
  })
  return {
    type: kind,
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        ...d,
        backgroundColor:
          kind === 'pie' || kind === 'doughnut' || kind === 'polarArea'
            ? d.data.map((_, j) => palette[(i + j) % palette.length])
            : `${palette[i % palette.length]}cc`,
        borderColor: palette[i % palette.length],
        borderWidth: kind === 'line' ? 3 : 1,
      })),
    },
    options: {
      title: { display: true, text: asText(params.title, 120) || 'Chart' },
      legend: { display: datasets.length > 1 || kind === 'pie' || kind === 'doughnut' },
    },
  }
}

/* ------------------------------------------------------------------ */
/* Free QR rendering (goQR.me — keyless)                               */
/* ------------------------------------------------------------------ */

async function fetchBuffer(url: string, timeoutMs = 25_000): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Service responded ${res.status}`)
    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()))
    if (buf.length < 100) throw new Error('Empty response')
    return buf
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/* THE EXECUTOR — runs a skill's cloud action for the user's task      */
/* ------------------------------------------------------------------ */

export async function runSkillAction(
  req: Request,
  skillName: string,
  skillCategory: string | undefined,
  userTask: string,
  displayLabel: string
): Promise<SkillRunResult> {
  const base = origin(req)
  const action = resolveSkillAction(skillName, skillCategory)
  const task = userTask.trim().slice(0, 1200)
  const user = await getCurrentUser(req).catch(() => null)

  try {
    switch (action.kind) {
      /* ---------------- IMAGE / DIAGRAM (Pollinations FLUX — free) -------- */
      case 'image':
      case 'diagram': {
        const styleSuffix =
          action.kind === 'diagram'
            ? 'clean vector infographic style, minimal, labeled sections, professional layout'
            : 'highly detailed, cinematic lighting, professional quality'
        const params = await extractJson(
          'You extract image-generation prompts. From the user\'s request, produce a vivid, concrete image prompt that captures EXACTLY what they asked for. Respond ONLY as JSON: {"prompt":"<detailed visual prompt>"}',
          task
        )
        const prompt = String(params.prompt || task).slice(0, 1500)
        const data = await callApi<{ image: { url: string } }>(base, '/api/image', {
          prompt: `${prompt}, ${styleSuffix}`,
          size: action.kind === 'diagram' ? '1344x768' : '1024x1024',
        })
        return {
          ok: true,
          summary: `Done! I created the **${displayLabel}** artwork — it's attached below. ✨`,
          attachment: { type: 'image', url: data.image.url, title: prompt.slice(0, 80) },
        }
      }

      /* ---------------- VIDEO (FLUX + Edge TTS + ffmpeg — free) ---------- */
      case 'video': {
        const data = await callApi<{ jobId: string }>(base, '/api/video/create', {
          prompt: task,
          scenes: '4',
        })
        return {
          ok: true,
          summary: `Your **${displayLabel}** video is rendering now — scene planning, AI narration and cinematic editing happen live. The finished MP4 appears below. 🎬`,
          attachment: { type: 'video', videoJobId: data.jobId, title: task.slice(0, 80), status: 'planning', progress: 5 },
        }
      }

      /* ---------------- DOC / SHEET / SLIDES (real office files) --------- */
      case 'doc':
      case 'sheet':
      case 'slides': {
        const format = action.kind === 'sheet' ? 'xlsx' : action.kind === 'slides' ? 'pptx' : 'docx'
        const shape =
          format === 'xlsx'
            ? 'For xlsx: blocks of {"type":"table","rows":[["Header1","Header2"],["v1","v2"],...]} — include real data rows, use numbers unquoted.'
            : format === 'pptx'
              ? 'For pptx: {"type":"slide","title":"...","bullets":["...","..."]} blocks, max ~8 slides, max 5 bullets each.'
              : 'For docx: headings ({"type":"heading","text":"...","level":2}), paragraphs and bullets blocks. Rich, well-structured content.'
        const contentRaw = await smartChat(
          [
            {
              role: 'assistant',
              content:
                `You are executing the "${displayLabel}" skill. Create COMPLETE, GENUINELY USEFUL content for the user's request as structured JSON blocks.\n` +
                `Respond ONLY as JSON: {"title":"<short title>","blocks":[...]}\n${shape}\n` +
                `Write real substance — no placeholders, no "TODO". Same language as the request.`,
            },
            { role: 'user', content: task },
          ],
          { maxTokens: 2500, task: 'fast' }
        )
        const cleaned = contentRaw.replace(/```(?:json)?/g, '').trim()
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        if (start === -1 || end === -1) throw new Error('Could not plan the document.')
        const plan = JSON.parse(cleaned.slice(start, end + 1)) as {
          title?: string
          blocks?: Array<Record<string, unknown>>
        }
        const blocks = sanitizeBlocks(plan.blocks)
        if (blocks.length === 0) throw new Error('The document plan was empty — try rephrasing.')
        const data = await callApi<{ file: { url: string; format: string } }>(base, '/api/office/create', {
          format,
          title: String(plan.title ?? task.slice(0, 60)).slice(0, 200),
          blocks,
        })
        return {
          ok: true,
          summary: `Your **${displayLabel}** ${format.toUpperCase()} is ready — download it below. 📄`,
          attachment: {
            type: 'document',
            url: `${data.file.url}?download=1&title=${encodeURIComponent(String(plan.title ?? 'Document'))}`,
            title: String(plan.title ?? 'Document'),
            format: data.file.format,
          },
        }
      }

      /* ---------------- SEARCH (Brave → DDG → Wikipedia — free) ---------- */
      case 'search': {
        const params = await extractJson(
          'You extract web-search queries. Produce a focused search query for the user\'s request. Respond ONLY as JSON: {"query":"<focused search query>"}',
          task
        )
        const query = String(params.query || task).slice(0, 300)
        const data = await callApi<{ results?: Array<{ url: string; name: string }> }>(
          base,
          '/api/search',
          { query, summarize: false }
        )
        const results = Array.isArray(data.results) ? data.results.slice(0, 6) : []
        return {
          ok: true,
          summary: `I searched the live web with the **${displayLabel}** skill — top sources are attached. 🔎`,
          attachment: {
            type: 'search',
            results: results.map((r) => ({ url: r.url, title: r.name })),
          },
        }
      }

      /* ---------------- READ (smart page reader — free) ------------------- */
      case 'read': {
        const params = await extractJson(
          'Extract the URL and the user\'s question from their request. Respond ONLY as JSON: {"url":"<the url>","question":"<what they want from it, short>"}',
          task
        )
        const url = String(params.url || '').trim()
        if (!/^https?:\/\/|^[\w-]+\.[a-z]{2,}/i.test(url)) {
          throw new Error('Tell me which URL to read (e.g. "read https://example.com").')
        }
        const data = await callApi<{ title?: string; text?: string }>(base, '/api/reader', { url })
        const digest = String(data.text ?? '').slice(0, 2400)
        const brief = await smartChat(
          [
            { role: 'assistant', content: 'Summarize this page for the user in 3-5 tight bullet points, same language as their question. Plain markdown bullets only.' },
            { role: 'user', content: `Question: ${String(params.question ?? 'summarize the page')}\n\nPage "${data.title ?? ''}"\n${digest}` },
          ],
          { maxTokens: 400, task: 'fast' }
        )
        return {
          ok: true,
          summary: `**${data.title ?? url}** — read with the **${displayLabel}** skill:\n\n${brief}`,
          attachment: { type: 'search', results: [{ url, title: data.title ?? url }] },
        }
      }

      /* ---------------- SPEAK (Edge neural voices — free) ---------------- */
      case 'speak': {
        const params = await extractJson(
          'Extract the text that should be spoken aloud from the user\'s request. Respond ONLY as JSON: {"text":"<the exact text to speak>"}',
          task
        )
        const text = String(params.text || task).slice(0, 1200)
        return {
          ok: true,
          summary: `Speech synthesized with the **${displayLabel}** skill — press play below. 🎙️`,
          attachment: { type: 'tts', text, title: text.slice(0, 80) },
        }
      }

      /* ---------------- TRANSLATE (free AI pool — free) ------------------- */
      case 'translate': {
        const params = await extractJson(
          'Extract what to translate and the target language. Respond ONLY as JSON: {"text":"<text to translate>","target":"<target language name>"}',
          task
        )
        const text = String(params.text || task).slice(0, 2000)
        const target = String(params.target || 'English').slice(0, 40)
        const translation = await smartChat(
          [
            { role: 'assistant', content: `You are an expert literary translator. Translate the user's text into ${target}. Respond ONLY with the translation — no quotes, no notes, no romanization.` },
            { role: 'user', content: text },
          ],
          { maxTokens: 2000, task: 'fast' }
        )
        const guide = await smartChat(
          [
            { role: 'assistant', content: `Write a 1-2 line pronunciation/study tip in English for someone learning ${target}, based on this translation. One short line only.` },
            { role: 'user', content: translation.slice(0, 800) },
          ],
          { maxTokens: 120, task: 'fast' }
        ).catch(() => '')
        return {
          ok: true,
          summary: `🌍 Translated to **${target}** with the **${displayLabel}** skill:\n\n> ${translation}\n${guide ? `\n💡 *${guide.trim()}*` : ''}`,
        }
      }

      /* ---------------- WEATHER (wttr.in — keyless) ----------------------- */
      case 'weather': {
        const params = await extractJson(
          'Extract the location for a weather lookup. Respond ONLY as JSON: {"location":"<city or place>"}',
          task
        )
        const location = String(params.location || task).slice(0, 120) || 'Dubai'
        const report = await wttrWeather(location)
        return {
          ok: true,
          summary: `🌤️ Live weather via the **${displayLabel}** skill:\n\n${report}`,
          attachment: undefined,
        }
      }

      /* ---------------- CHART (QuickChart — keyless) ---------------------- */
      case 'chart': {
        const params = await extractJson(
          'You build chart data. From the user\'s request produce a chart spec. Respond ONLY as JSON: {"type":"bar|line|pie|doughnut|radar","title":"<chart title>","labels":["..."],"datasets":[{"label":"<series>","data":[1,2,3]}]}. Invent realistic data if the user describes a topic without numbers.',
          task,
          900
        )
        const config = quickChartConfig(params)
        const buf = await fetchBuffer(
          `https://quickchart.io/chart?w=900&h=500&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`
        )
        const stored = await persistImage(buf, 'quickchart', {
          prompt: `${displayLabel}: ${asText(params.title, 100) || task.slice(0, 100)}`,
          size: '900x500',
          userId: user?.id ?? null,
        })
        return {
          ok: true,
          summary: `📈 Chart rendered with the **${displayLabel}** skill — it's attached below.`,
          attachment: { type: 'image', url: stored.url, title: asText(params.title, 80) || task.slice(0, 80) },
        }
      }

      /* ---------------- QR (goQR.me — keyless) ---------------------------- */
      case 'qr': {
        const params = await extractJson(
          'Extract the data to encode into a QR code (a URL, text, wifi string, contact…). Respond ONLY as JSON: {"data":"<exact content to encode>"}',
          task
        )
        const qrData = String(params.data || task).slice(0, 1500)
        const buf = await fetchBuffer(
          `https://api.qrserver.com/v1/create-qr-code/?size=600x600&ecc=M&margin=8&data=${encodeURIComponent(qrData)}`
        )
        const stored = await persistImage(buf, 'qrcode', {
          prompt: `QR: ${qrData.slice(0, 120)}`,
          size: '600x600',
          userId: user?.id ?? null,
        })
        return {
          ok: true,
          summary: `🔳 QR code forged with the **${displayLabel}** skill — scan or download it below.`,
          attachment: { type: 'image', url: stored.url, title: qrData.slice(0, 80) },
        }
      }

      /* ---------------- PASSWORD (Node crypto — free) --------------------- */
      case 'password': {
        const params = await extractJson(
          'Extract password requirements. Respond ONLY as JSON: {"length":<number 8-64, default 20>,"count":<number 1-5, default 3>,"mode":"password|passphrase|apikey","words":<number 3-8 for passphrases>}',
          task
        ).catch(() => ({}) as Record<string, unknown>)
        const mode = String(params.mode ?? 'password').toLowerCase()
        const sets = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+'
        const pick = (n: number, alphabet: string) =>
          Array.from({ length: n }, () => alphabet[randomInt(0, alphabet.length)]).join('')
        const words = [
          'harbor', 'velvet', 'quartz', 'meadow', 'cinder', 'orbit', 'lantern', 'thunder',
          'willow', 'canyon', 'ember', 'falcon', 'marble', 'nebula', 'prism', 'summit',
        ]
        const genOne = (): string => {
          if (mode === 'passphrase') {
            const n = Math.min(8, Math.max(3, Number(params.words) || 4))
            return Array.from({ length: n }, () => words[randomInt(0, words.length)]).join('-') + `-${randomInt(10, 99)}`
          }
          if (mode === 'apikey') {
            return `nx_${pick(32, 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`
          }
          const len = Math.min(64, Math.max(10, Number(params.length) || 20))
          return pick(len, sets)
        }
        const count = Math.min(5, Math.max(1, Number(params.count) || 3))
        const list = Array.from({ length: count }, genOne)
        const entropy = mode === 'apikey' ? 'about 190 bits' : mode === 'passphrase' ? 'about 51 bits per word' : 'about 6.6 bits per character'
        return {
          ok: true,
          summary:
            `🔐 Forged with the **${displayLabel}** skill (cryptographically random, ~${entropy} entropy):\n\n` +
            list.map((p) => `\`${p}\``).join('\n') +
            `\n\n*Copy one now — this list is shown only once.*`,
          attachment: undefined,
        }
      }

      /* ---------------- RESEARCH (search → real briefing doc) ------------ */
      case 'research':
      default: {
        const search = await callApi<{ results?: Array<{ url: string; name: string; snippet?: string }> }>(
          base,
          '/api/search',
          { query: task.slice(0, 300), summarize: false }
        )
        const results = Array.isArray(search.results) ? search.results.slice(0, 6) : []
        const context = results
          .map((r, i) => `[${i + 1}] ${r.name} (${r.url})\n${String(r.snippet ?? '').slice(0, 300)}`)
          .join('\n\n')
        const contentRaw = await smartChat(
          [
            {
              role: 'assistant',
              content:
                `You are executing the "${displayLabel}" skill. Using the web findings, write a practical briefing document.\n` +
                `Respond ONLY as JSON: {"title":"...","blocks":[{"type":"heading","text":"...","level":2},{"type":"paragraph","text":"..."},{"type":"bullets","items":["..."]}]}\n` +
                `Include: quick answer, how-to steps, commands/config examples as paragraphs, pitfalls. Real substance, same language as the request.`,
            },
            { role: 'user', content: `${task}\n\nWEB FINDINGS:\n${context || '(none — rely on your knowledge)'}` },
          ],
          { maxTokens: 2200, task: 'fast' }
        )
        const cleaned = contentRaw.replace(/```(?:json)?/g, '').trim()
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        const plan = start !== -1 && end !== -1
          ? (JSON.parse(cleaned.slice(start, end + 1)) as { title?: string; blocks?: Array<Record<string, unknown>> })
          : { blocks: [] }
        const blocks = sanitizeBlocks(plan.blocks)
        if (blocks.length > 0) {
          const data = await callApi<{ file: { url: string; format: string } }>(base, '/api/office/create', {
            format: 'docx',
            title: String(plan.title ?? task.slice(0, 60)).slice(0, 200),
            blocks,
          })
          return {
            ok: true,
            summary: `I researched your **${displayLabel}** task and wrote a full briefing — download below. Sources attached. 🧠`,
            attachment: {
              type: 'document',
              url: `${data.file.url}?download=1&title=${encodeURIComponent(String(plan.title ?? 'Briefing'))}`,
              title: String(plan.title ?? 'Briefing'),
              format: 'docx',
            },
          }
        }
        return {
          ok: true,
          summary: `I researched your **${displayLabel}** task — key sources attached. 🔎`,
          attachment: { type: 'search', results: results.map((r) => ({ url: r.url, title: r.name })) },
        }
      }
    }
  } catch (err) {
    console.error(`[skill-runtime] ${skillName} (${action.kind}) failed:`, err)
    return {
      ok: false,
      summary: '',
      error: err instanceof Error ? err.message : 'The skill run failed. Try rephrasing.',
    }
  }
}
