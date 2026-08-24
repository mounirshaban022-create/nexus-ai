import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryAccount, listEmails } from '@/lib/email'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * GET /api/email/inbox?limit=10&folder=INBOX
 * Lists recent emails from the primary connected account.
 */
export async function GET(req: NextRequest) {
  try {
    // Rate limit first (20 per 60s per client)
    const rl = rateLimit(`inbox:${clientKey(req)}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.', retryAfter: rl.retryAfterSeconds },
        { status: 429 }
      )
    }

    const { searchParams } = new URL(req.url)
    const rawLimit = Number(searchParams.get('limit') ?? '10')
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 25) : 10
    const folder = searchParams.get('folder') || 'INBOX'

    const account = await getPrimaryAccount()
    if (!account) {
      return NextResponse.json(
        { error: 'No email account connected.', needsConnect: true },
        { status: 400 }
      )
    }

    const result = await listEmails(account, { folder, limit })
    return NextResponse.json({
      account: { email: account.email, label: account.label },
      folder: result.folder,
      total: result.total,
      emails: result.emails,
    })
  } catch (error) {
    console.error('[api/email/inbox] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load inbox.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
