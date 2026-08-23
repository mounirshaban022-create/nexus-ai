import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { assertPublicUrl } from '@/lib/connectors'

interface PageData {
  title: string
  url: string
  html: string
  publishedTime?: string
}

const requestSchema = z.object({
  url: z.string().min(3).max(2000),
})

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`reader:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const bodyParsed = requestSchema.safeParse(await req.json())
    if (!bodyParsed.success) {
      return NextResponse.json({ error: 'A URL is required.' }, { status: 400 })
    }

    const raw = bodyParsed.data.url.trim()
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    assertPublicUrl(withProtocol) // SSRF guard

    let parsed: URL
    try {
      parsed = new URL(withProtocol)
    } catch {
      return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 })
    }

    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parsed.hostname)) {
      return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 })
    }

    const zai = await getZAI()
    const result = (await zai.functions.invoke('page_reader', {
      url: parsed.toString(),
    })) as { data?: PageData } & Record<string, unknown>

    const data = result?.data ?? (result as unknown as PageData)
    const html = data?.html ?? ''
    const text = htmlToPlainText(html)

    if (!html && !text) {
      return NextResponse.json(
        { error: 'Could not extract content from that page. It may require JavaScript or block readers.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      page: {
        title: data.title ?? parsed.hostname,
        url: data.url ?? parsed.toString(),
        publishedTime: data.publishedTime ?? null,
        html,
        text: text.slice(0, 40000),
        wordCount: text.split(/\s+/).filter(Boolean).length,
      },
    })
  } catch (error) {
    console.error('[api/reader] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to read that page. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
