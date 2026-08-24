import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPrimaryAccount, searchEmails } from '@/lib/email'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(25).optional().default(10),
  folder: z.string().min(1).max(120).optional().default('INBOX'),
})

/**
 * POST /api/email/search
 * Searches emails by keyword in the primary connected account.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit first (20 per 60s per client)
    const rl = rateLimit(`email-search:${clientKey(req)}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many searches. Please slow down.', retryAfter: rl.retryAfterSeconds },
        { status: 429 }
      )
    }

    const parsed = searchSchema.safeParse(await req.json())
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const message = issue
        ? `Invalid request: ${issue.path.join('.') || 'body'} — ${issue.message}`
        : 'Invalid request.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
    const { query, limit, folder } = parsed.data

    const account = await getPrimaryAccount()
    if (!account) {
      return NextResponse.json(
        { error: 'No email account connected.', needsConnect: true },
        { status: 400 }
      )
    }

    const result = await searchEmails(account, query, { folder, limit })
    return NextResponse.json({
      account: { email: account.email },
      folder: result.folder,
      query: result.query,
      matches: result.matches,
    })
  } catch (error) {
    console.error('[api/email/search] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to search emails.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
