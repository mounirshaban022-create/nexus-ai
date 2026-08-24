import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * NEXUS Answer — Perplexity-style "Pro Search" engine.
 *
 * 6-stage pipeline streamed as NDJSON:
 *   PLAN → SEARCH → READ → SYNTHESIZE → SOURCES → FOLLOW-UPS → DONE
 *
 * Optionally integrates the connected email inbox (via @/lib/email) so
 * the synthesizer can cite matched emails as [E1], [E2], ... alongside
 * web sources cited as [1], [2], ...
 */

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface RawSearchItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date?: string
  favicon?: string
}

interface PlanStep {
  id: number
  query: string
  reason: string
}

interface SourceEntry {
  n: number
  title: string
  url: string
  host: string
  snippet: string
  favicon?: string
  date?: string
}

interface EmailMatch {
  subject: string
  from: string
  date: string | null
  snippet: string
}

interface PageData {
  title: string
  text: string
  wordCount: number
}

interface ReaderResponse {
  page?: {
    title?: string
    url?: string
    text?: string
    wordCount?: number
  }
  error?: string
}

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const READER_URL = 'http://localhost:3000/api/reader'
const MAX_PAGE_CHARS = 3000
const MAX_SYNTHESIS_CHARS = 12000
const READ_TIMEOUT_MS = 20_000

const requestSchema = z.object({
  query: z.string().min(1).max(2000),
  mode: z.enum(['quick', 'pro']).optional().default('pro'),
  includeEmail: z.boolean().optional().default(false),
})

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

/** Find the first balanced JSON array substring in `text`. */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

type ZaiInstance = Awaited<ReturnType<typeof getZAI>>

/* ------------------------------------------------------------------ */
/* STAGE 1 — PLAN                                                     */
/* ------------------------------------------------------------------ */

async function planSubQuestions(
  zai: ZaiInstance,
  query: string,
  mode: 'quick' | 'pro'
): Promise<PlanStep[]> {
  const target = mode === 'quick' ? '2' : '3 to 4'
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          'You are a research planner. Break this question into ' +
          target +
          ' sub-questions, each requiring a separate web search. ' +
          'Respond ONLY with a JSON array: [{"query": "search string", "reason": "one line"}]. ' +
          'No prose, no markdown fences.',
      },
      { role: 'user', content: query.slice(0, 2000) },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content ?? ''
  const cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .trim()
  const arr = extractJsonArray(cleaned)
  if (!arr) return []
  const maxSteps = mode === 'quick' ? 2 : 4
  return arr
    .filter(
      (x): x is { query: string; reason: string } =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as { query?: unknown }).query === 'string' &&
        typeof (x as { reason?: unknown }).reason === 'string'
    )
    .slice(0, maxSteps)
    .map((x, i) => ({
      id: i + 1,
      query: x.query.slice(0, 200),
      reason: x.reason.slice(0, 200),
    }))
}

/* ------------------------------------------------------------------ */
/* STAGE 4 — SYNTHESIZE                                               */
/* ------------------------------------------------------------------ */

async function synthesizeAnswer(
  zai: ZaiInstance,
  query: string,
  sources: SourceEntry[],
  pageTexts: Map<string, PageData>,
  emails: EmailMatch[]
): Promise<string> {
  const lines: string[] = []
  lines.push(`Question: ${query}`)
  lines.push('')
  lines.push('Sources:')
  for (const s of sources) {
    lines.push(`[${s.n}] ${s.title} — ${s.host}`)
    lines.push(`URL: ${s.url}`)
    lines.push(`Snippet: ${s.snippet}`)
    const page = pageTexts.get(s.url)
    if (page) {
      lines.push(`Page title: ${page.title}`)
      lines.push(`Page text (truncated): ${truncate(page.text, MAX_PAGE_CHARS)}`)
    }
    lines.push('')
  }
  if (emails.length > 0) {
    lines.push('Email sources (cite as [E1], [E2], etc.):')
    emails.forEach((e, i) => {
      lines.push(`[E${i + 1}] ${e.subject} — from ${e.from} — ${e.date ?? 'unknown date'}`)
      lines.push(`Snippet: ${e.snippet}`)
      lines.push('')
    })
  }
  const joined = lines.join('\n')
  const context =
    joined.length > MAX_SYNTHESIS_CHARS
      ? joined.slice(0, MAX_SYNTHESIS_CHARS) +
        '\n[additional sources truncated due to length]'
      : joined

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          'You are NEXUS Answer. Using ONLY the retrieved sources below, write a comprehensive answer in Markdown. ' +
          'Cite every factual claim with inline [N] markers mapping to the source numbers. ' +
          'If email sources are present, cite them as [E1], [E2], etc. ' +
          'If sources conflict, note it. If you cannot answer from sources, say so. ' +
          'End with a one-line takeaway prefixed with "Takeaway:".',
      },
      { role: 'user', content: context },
    ],
    thinking: { type: 'disabled' },
  })
  return (completion.choices[0]?.message?.content ?? '').trim()
}

/* ------------------------------------------------------------------ */
/* STAGE 6 — FOLLOW-UPS                                               */
/* ------------------------------------------------------------------ */

async function generateFollowups(
  zai: ZaiInstance,
  query: string,
  answer: string
): Promise<string[]> {
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          "You suggest follow-up questions. Given the user's original question and the answer below, " +
          'propose 3 SHORT, user-askable related questions that would deepen the research. ' +
          'Respond ONLY with a JSON array of strings, e.g. ["q1","q2","q3"]. No prose, no markdown fences.',
      },
      {
        role: 'user',
        content: `Question: ${query}\n\nAnswer:\n${answer.slice(0, 4000)}`,
      },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content ?? ''
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const arr = extractJsonArray(cleaned)
  if (!arr) return []
  return arr
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, 3)
    .map((s) => s.trim().slice(0, 200))
}

/* ------------------------------------------------------------------ */
/* POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // Rate limit (10 req/min per client)
  const limit = rateLimit(`answer:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Answer limit reached. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A query is required (max 2000 chars).' },
      { status: 400 }
    )
  }
  const { query, mode, includeEmail } = parsed.data

  const zai = await getZAI()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          closed = true
        }
      }
      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      try {
        /* ---------------- STAGE 1: PLAN ---------------- */
        let plan: PlanStep[] = []
        try {
          plan = await planSubQuestions(zai, query, mode)
        } catch (err) {
          console.error('[api/answer] plan failed:', err)
        }
        if (plan.length === 0) {
          plan = [
            {
              id: 1,
              query: query.slice(0, 200),
              reason: 'Direct search of the original question.',
            },
          ]
        }
        send({ type: 'plan', steps: plan })

        /* ---------------- STAGE 2: SEARCH (parallel) + EMAIL (parallel) ---------------- */
        const emailPromise = (async (): Promise<{
          matches: EmailMatch[]
          skipped?: string
        }> => {
          if (!includeEmail) return { matches: [] }
          try {
            const { getPrimaryAccount, searchEmails } = await import('@/lib/email')
            const account = await getPrimaryAccount()
            if (!account) {
              return { matches: [], skipped: 'No email account connected' }
            }
            const result = await searchEmails(account, query, { limit: 5 })
            const matches: EmailMatch[] = result.matches.map((m) => {
              const fromLabel = m.fromName
                ? `${m.fromName} <${m.from}>`
                : m.from
              return {
                subject: m.subject,
                from: fromLabel,
                date: m.date ?? null,
                snippet: `${m.subject} — from ${fromLabel}`,
              }
            })
            return { matches }
          } catch (err) {
            console.error('[api/answer] email search failed:', err)
            return {
              matches: [],
              skipped:
                err instanceof Error
                  ? `Email search failed: ${err.message}`
                  : 'Email search failed',
            }
          }
        })()

        const searchResults: Array<{ step: PlanStep; results: RawSearchItem[] }> = []
        await Promise.all(
          plan.map(async (step) => {
            send({ type: 'search_start', stepId: step.id })
            try {
              const results = (await zai.functions.invoke('web_search', {
                query: step.query,
                num: 5,
              })) as RawSearchItem[]
              const safe = Array.isArray(results) ? results : []
              searchResults.push({ step, results: safe })
              send({
                type: 'search_done',
                stepId: step.id,
                results: safe.map((r) => ({
                  title: r.name,
                  url: r.url,
                  snippet: r.snippet,
                  host: r.host_name,
                  date: r.date ?? null,
                  favicon: r.favicon ?? null,
                })),
              })
            } catch (err) {
              console.error(
                '[api/answer] search failed for step',
                step.id,
                err
              )
              searchResults.push({ step, results: [] })
              send({
                type: 'search_done',
                stepId: step.id,
                results: [],
                error:
                  err instanceof Error ? err.message : 'Search failed.',
              })
            }
          })
        )

        // Email resolution
        const emailResult = await emailPromise
        if (emailResult.skipped) {
          send({ type: 'email_skipped', reason: emailResult.skipped })
        } else if (emailResult.matches.length > 0) {
          send({ type: 'email_search_done', matches: emailResult.matches })
        }

        /* ---------------- Build deduped source list ---------------- */
        const deduped = new Map<string, RawSearchItem>()
        for (const { results } of searchResults) {
          for (const r of results) {
            if (!r.url || deduped.has(r.url)) continue
            deduped.set(r.url, r)
          }
        }

        const allSources: SourceEntry[] = []
        let idx = 1
        for (const r of deduped.values()) {
          allSources.push({
            n: idx++,
            title: r.name,
            url: r.url,
            host: r.host_name || safeHost(r.url) || 'unknown',
            snippet: r.snippet,
            favicon: r.favicon,
            date: r.date,
          })
        }

        /* ---------------- STAGE 3: READ (pro mode only) ---------------- */
        const pagesToRead: RawSearchItem[] = []
        if (mode === 'pro') {
          const seenHosts = new Set<string>()
          for (const r of deduped.values()) {
            const host = r.host_name || safeHost(r.url)
            if (!host || seenHosts.has(host)) continue
            seenHosts.add(host)
            pagesToRead.push(r)
            if (pagesToRead.length >= 3) break
          }
        }

        const pageTexts = new Map<string, PageData>()
        await Promise.all(
          pagesToRead.map(async (r) => {
            send({ type: 'read_start', url: r.url })
            try {
              const res = await fetch(READER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: r.url }),
                signal: AbortSignal.timeout(READ_TIMEOUT_MS),
              })
              if (!res.ok) {
                send({
                  type: 'read_done',
                  url: r.url,
                  title: r.name,
                  wordCount: 0,
                  error: `Reader returned ${res.status}`,
                })
                return
              }
              const data = (await res.json()) as ReaderResponse
              const page = data?.page
              if (!page) {
                send({
                  type: 'read_done',
                  url: r.url,
                  title: r.name,
                  wordCount: 0,
                  error: 'No page data',
                })
                return
              }
              const text = (page.text ?? '').slice(0, MAX_PAGE_CHARS)
              const wordCount =
                page.wordCount ?? text.split(/\s+/).filter(Boolean).length
              pageTexts.set(r.url, {
                title: page.title ?? r.name,
                text,
                wordCount,
              })
              send({
                type: 'read_done',
                url: r.url,
                title: page.title ?? r.name,
                wordCount,
              })
            } catch (err) {
              console.error('[api/answer] read failed for', r.url, err)
              send({
                type: 'read_done',
                url: r.url,
                title: r.name,
                wordCount: 0,
                error:
                  err instanceof Error ? err.message : 'Reader failed.',
              })
            }
          })
        )

        /* ---------------- STAGE 4: SYNTHESIZE ---------------- */
        send({ type: 'synthesize_start' })
        let answer: string
        try {
          if (allSources.length === 0 && emailResult.matches.length === 0) {
            answer =
              'I could not find any sources for that question. ' +
              'This might be a temporary search outage or a very niche topic. ' +
              'Try rephrasing your question or breaking it into more specific parts.\n\n' +
              'Takeaway: No sources retrieved — try again or rephrase.'
          } else {
            answer = await synthesizeAnswer(
              zai,
              query,
              allSources,
              pageTexts,
              emailResult.matches
            )
            if (!answer) {
              throw new Error('Synthesis returned an empty answer.')
            }
          }
        } catch (err) {
          console.error('[api/answer] synthesize failed:', err)
          send({
            type: 'error',
            stage: 'synthesize',
            message:
              err instanceof Error ? err.message : 'Synthesis failed.',
          })
          close()
          return
        }
        send({ type: 'answer', content: answer })

        /* ---------------- STAGE 5: SOURCES ---------------- */
        send({ type: 'sources', sources: allSources })

        /* ---------------- STAGE 6: FOLLOW-UPS ---------------- */
        let followups: string[] = []
        try {
          followups = await generateFollowups(zai, query, answer)
        } catch (err) {
          console.error('[api/answer] followups failed:', err)
        }
        send({ type: 'followups', questions: followups })

        /* ---------------- STAGE 7: DONE ---------------- */
        send({ type: 'done' })
      } catch (err) {
        console.error('[api/answer] pipeline error:', err)
        send({
          type: 'error',
          stage: 'pipeline',
          message: err instanceof Error ? err.message : 'Pipeline failed.',
        })
      } finally {
        close()
      }
    },
  })

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
