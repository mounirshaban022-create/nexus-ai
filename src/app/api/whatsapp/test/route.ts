import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getWhatsAppAccount,
  waSendText,
  saveOutboundMessage,
  normalizeWaNumber,
} from '@/lib/whatsapp'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* /api/whatsapp/test — send a real WhatsApp message from the NEXUS   */
/* number to any verified recipient. Phase 1: Meta's test number can  */
/* only reach numbers that were verified with an OTP inside the Meta  */
/* console (max 5). The user's own number is the first one.           */
/* ------------------------------------------------------------------ */

const testSchema = z.object({
  to: z.string().min(5).max(25),
  message: z.string().min(1).max(1500).optional(),
})

export async function POST(req: NextRequest) {
  const limit = rateLimit(`wa-test:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many test messages. Wait a minute.' },
      { status: 429 }
    )
  }

  const account = await getWhatsAppAccount()
  if (!account) {
    return NextResponse.json(
      { error: 'Connect your WhatsApp number first (step 1–3 above).' },
      { status: 400 }
    )
  }

  const parsed = testSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  }

  const to = normalizeWaNumber(parsed.data.to)
  const message =
    parsed.data.message?.trim() ||
    `✅ NEXUS is live on WhatsApp!\n\nThis is a test message from your NEXUS AI assistant. If you can read this, sending works. When you reply, ${account.businessName} will answer automatically.`

  const result = await waSendText(account, to, message)

  await saveOutboundMessage(
    account.id,
    account.displayPhone || account.phoneNumberId,
    to,
    message,
    result.waMessageId ?? null,
    result.ok ? 'sent' : 'failed'
  )

  if (!result.ok) {
    // Surface the most common Phase-1 pitfalls in plain English
    let hint = result.error ?? 'Send failed.'
    if (/recipient|phone number/i.test(hint)) {
      hint +=
        ' — In TEST mode, the recipient must first be verified: Meta console → WhatsApp → API Setup → "To" field → add the number → enter the OTP it receives.'
    } else if (/token|auth/i.test(hint)) {
      hint += ' — Your access token may have expired (temporary tokens last 24h). Generate a fresh one in the Meta console.'
    }
    return NextResponse.json({ error: hint }, { status: 400 })
  }

  // A successful send proves the connection end-to-end
  return NextResponse.json({
    ok: true,
    waMessageId: result.waMessageId,
    sentTo: to,
  })
}
