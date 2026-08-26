/**
 * SKILL RUNTIME — turns the vendored CLI-Anything skill catalog into REAL,
 * executable cloud actions using only FREE / open resources.
 *
 * The 79 vendored skills describe DESKTOP apps (Blender, GIMP, LibreOffice…).
 * A web app can't drive the user's local machine — so every skill is mapped
 * to its closest FREE cloud equivalent that NEXUS can genuinely execute:
 *
 *   image  → Pollinations FLUX (open, keyless)            → /api/image
 *   video  → AI scene planner + FLUX + Edge TTS + ffmpeg  → /api/video/create
 *   doc    → real Word / Excel / PowerPoint writer        → /api/office/create
 *   sheet  → real Excel with live formulas                → /api/office/create
 *   search → Brave → DuckDuckGo → Wikipedia free chain    → /api/search
 *   read   → smart page reader (keyless fetch + reader)   → /api/reader
 *   speak  → free Microsoft neural voices (msedge-tts)    → /api/tts
 *
 * Skills without a natural media equivalent (devops, databases, testing…)
 * map to `research`: NEXUS researches the task with the free web-search
 * chain and produces a real, downloadable briefing document.
 */

import { smartChat } from '@/lib/smart-chat'

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
        const blocks = Array.isArray(plan.blocks) ? plan.blocks.slice(0, 40) : []
        if (blocks.length === 0) throw new Error('The document plan was empty — try rephrasing.')
        const data = await callApi<{ file: { url: string; format: string } }>(base, '/api/office/create', {
          format,
          title: String(plan.title ?? task.slice(0, 60)),
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
        const blocks = Array.isArray(plan.blocks) ? plan.blocks.slice(0, 40) : []
        if (blocks.length > 0) {
          const data = await callApi<{ file: { url: string; format: string } }>(base, '/api/office/create', {
            format: 'docx',
            title: String(plan.title ?? task.slice(0, 60)),
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
