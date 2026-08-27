import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedSession } from '@/lib/auth'
import { getPrimaryAccount, readEmail } from '@/lib/email'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ uid: string }> }

/**
 * GET /api/email/message/[uid]?folder=INBOX
 * Reads the full text of a single email by its IMAP uid.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    // Rate limit first (30 per 60s per client)
    const rl = rateLimit(`email-read:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.', retryAfter: rl.retryAfterSeconds },
        { status: 429 }
      )
    }

    const { uid: uidRaw } = await context.params
    const uid = Number.parseInt(uidRaw, 10)
    if (Number.isNaN(uid)) {
      return NextResponse.json(
        { error: 'Invalid message uid — must be an integer.' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(req.url)
    const folder = searchParams.get('folder') || 'INBOX'

    const account = await getPrimaryAccount()
    if (!account) {
      return NextResponse.json(
        { error: 'No email account connected.', needsConnect: true },
        { status: 400 }
      )
    }

    const message = await readEmail(account, uid, folder)
    return NextResponse.json({
      account: { email: account.email },
      folder,
      message,
    })
  } catch (error) {
    console.error('[api/email/message] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to read email.'
    // Email not found is a client error; everything else is treated as a server/IMAP failure.
    const status = /not found/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
