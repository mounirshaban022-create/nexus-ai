import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { smartChat } from '@/lib/smart-chat'
import { freeWebSearch } from '@/lib/web-access'
import { rateLimit, clientKey } from '@/lib/rate-limit'

interface SearchItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date?: string
  favicon?: string
}

const requestSchema = z.object({
  query: z.string().min(1).max(500),
  summarize: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`search:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Search limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A search query is required (max 500 chars).' }, { status: 400 })
    }

    const trimmedQuery = parsed.data.query.trim()
    const summarize = parsed.data.summarize

    // FREE WEB ACCESS CHAIN — Brave → DuckDuckGo → Wikipedia → Z.ai
    // (replaces the Z.ai-only search that 429s during quota storms)
    const results = await freeWebSearch(trimmedQuery, 8)

    const mapped: SearchItem[] = results.map((r) => ({
      url: r.url,
      name: r.title,
      snippet: r.snippet,
      host_name: r.host_name,
      rank: r.rank,
      date: r.date,
      favicon: r.favicon,
    }))

    if (mapped.length === 0) {
      return NextResponse.json({
        results: [],
        summary: '',
        note: 'No results found. Try a different query.',
      })
    }

    // Optional AI summary of the top results — smartChat chains through
    // the anonymous free-LLM fallbacks when Z.ai is rate-limited, so the
    // summary keeps working during a 429 storm too.
    let summary = ''
    if (summarize) {
      try {
        const context = mapped
          .slice(0, 6)
          .map((r, i) => `[${i + 1}] ${r.name} (${r.host_name})\n${r.snippet}`)
          .join('\n\n')

        summary = await smartChat(
          [
            {
              role: 'assistant',
              content:
                'You are a research assistant. Given web search results, write a concise, ' +
                'factual digest in Markdown. Highlight the most important findings and cite ' +
                'sources inline using their bracket numbers, e.g. [1]. Keep it under 250 words.',
            },
            {
              role: 'user',
              content: `Query: "${trimmedQuery}"\n\nSearch results:\n${context}\n\nWrite the digest.`,
            },
          ],
          { maxTokens: 700, task: 'fast' }
        )
        summary = summary.trim()
      } catch (err) {
        console.error('[api/search] summary failed:', err)
      }
    }

    return NextResponse.json({ results: mapped, summary })
  } catch (error) {
    console.error('[api/search] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Web search failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
