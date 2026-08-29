import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { z } from 'zod'
import { readPageSmart } from '@/lib/web-access'
import { assertPublicUrl } from '@/lib/safe-url'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  url: z.string().min(3).max(2000),
})

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

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

    // SMART PAGE READER — direct fetch first (keyless, no quota),
    // Z.ai page_reader as fallback for JS-rendered pages.
    const page = await readPageSmart(parsed.toString())

    const text = page.text

    if (!page.html && !text) {
      return NextResponse.json(
        { error: 'Could not extract content from that page. It may require JavaScript or block readers.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      page: {
        title: page.title,
        url: page.url,
        publishedTime: page.publishedTime ?? null,
        html: page.html.slice(0, 200_000),
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
