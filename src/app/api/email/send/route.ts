import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { getPrimaryAccount, sendEmail } from '@/lib/email'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const sendSchema = z.object({
  to: z.string().email().max(200),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
})

/**
 * POST /api/email/send
 * Sends an email via SMTP using the primary connected account.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    // Rate limit first — stricter (10 per 60s) since sending is sensitive
    const rl = rateLimit(`email-send:${clientKey(req)}`, 10, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many send attempts. Please wait before sending again.', retryAfter: rl.retryAfterSeconds },
        { status: 429 }
      )
    }

    const parsed = sendSchema.safeParse(await req.json())
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const message = issue
        ? `Invalid request: ${issue.path.join('.') || 'body'} — ${issue.message}`
        : 'Invalid request.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
    const { to, subject, body } = parsed.data

    const account = await getPrimaryAccount()
    if (!account) {
      return NextResponse.json(
        { error: 'No email account connected.', needsConnect: true },
        { status: 400 }
      )
    }

    const result = await sendEmail(account, { to, subject, body })
    console.log('[api/email/send] sent', result.messageId)
    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    })
  } catch (error) {
    console.error('[api/email/send] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send email.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
