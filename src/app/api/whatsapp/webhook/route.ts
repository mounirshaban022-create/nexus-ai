import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import {
  getWhatsAppAccountByVerifyToken,
  getWhatsAppAccountByPhoneNumberId,
  waSendText,
  waMarkRead,
  saveInboundMessage,
  saveOutboundMessage,
  generateAgentReply,
} from '@/lib/whatsapp'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* WhatsApp webhook — Meta calls these two endpoints.                  */
/*                                                                     */
/* GET  : webhook subscription handshake. Meta sends                   */
/*        ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…       */
/*        We echo the challenge when the token matches.                */
/* POST : message + delivery-status events. We acknowledge instantly   */
/*        (Meta requires a fast 200) and process the actual agent      */
/*        reply in `after()` so slow LLM calls never time us out.      */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const account = await getWhatsAppAccountByVerifyToken(token)
  if (!account || token !== account.verifyToken) {
    console.warn('[whatsapp-webhook] verification failed — token mismatch')
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Token matches → confirm the webhook subscription
  await db.whatsAppAccount.update({
    where: { id: account.id },
    data: { webhookVerified: true },
  })
  console.log('[whatsapp-webhook] subscription verified by Meta ✓')

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

/* ------------------------- POST: events --------------------------- */

/** Warn once per process when the webhook runs unsigned (no app secret
 *  configured) — per-call logging would spam Meta's retry traffic. */
let warnedNoSignature = false

interface WaWebhookPayload {
  object?: string
  entry?: {
    id?: string
    changes?: {
      field?: string
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: WaInboundMessage[]
        statuses?: { id?: string; status?: string; recipient_id?: string }[]
      }
    }[]
  }[]
}

interface WaInboundMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string }
  }
}

export async function POST(req: NextRequest) {
  // Light rate limit — generous enough for Meta's retries.
  const limit = rateLimit(`wa-webhook:${clientKey(req)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many events.' }, { status: 429 })
  }

  // Read the RAW body first — the HMAC must be computed over the exact
  // bytes Meta sent (req.json() would re-serialize and break the hash).
  const rawBody = await req.text()

  // Signature verification: Meta's X-Hub-Signature-256 header must equal
  // sha256=HMAC(rawBody, WHATSAPP_APP_SECRET). FAIL-CLOSED: without the
  // app secret the webhook is DISABLED — unsigned events are rejected
  // (they would let anyone spoof inbound messages and trigger paid AI
  // auto-replies). Set WHATSAPP_APP_SECRET in env vars (Meta App
  // Dashboard → Settings → Basic → App secret) to enable the webhook.
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    if (!warnedNoSignature) {
      warnedNoSignature = true
      console.warn(
        '[whatsapp-webhook] WHATSAPP_APP_SECRET is not set — webhook is DISABLED (fail-closed). Add the Meta App secret in env vars to enable it.'
      )
    }
    return NextResponse.json(
      {
        error:
          'WhatsApp webhook is disabled: WHATSAPP_APP_SECRET is not configured. Add the Meta App secret in env vars to enable signed webhook processing.',
      },
      { status: 503 }
    )
  }
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.warn('[whatsapp-webhook] invalid X-Hub-Signature-256 — rejected')
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  let payload: WaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as WaWebhookPayload
  } catch {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Acknowledge instantly — heavy work happens in after()
  after(async () => {
    try {
      await processWebhook(payload)
    } catch (error) {
      console.error('[whatsapp-webhook] processing error:', error)
    }
  })

  return NextResponse.json({ received: true }, { status: 200 })
}

/** Extract readable text from any supported inbound message shape. */
function extractText(message: WaInboundMessage): string {
  if (message.text?.body) return message.text.body
  if (message.button?.text) return message.button.text
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title
  if (message.type) {
    const labels: Record<string, string> = {
      image: '📷 Image',
      audio: '🎤 Voice note',
      video: '🎬 Video',
      document: '📄 Document',
      location: '📍 Location',
      contacts: '👤 Contact card',
      sticker: '🌟 Sticker',
    }
    return labels[message.type] ?? `[${message.type}]`
  }
  return '[unsupported message]'
}

async function processWebhook(payload: WaWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account' || !payload.entry?.length) return

  // Per-entry account resolution: each webhook entry carries the
  // phone_number_id it belongs to, so we route to the correct user's
  // account (WhatsApp connections are now per-user, not global).
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      const eventPhoneNumberId = value.metadata?.phone_number_id
      if (!eventPhoneNumberId) continue
      const account = await getWhatsAppAccountByPhoneNumberId(eventPhoneNumberId)
      if (!account) {
        console.warn('[whatsapp-webhook] no account owns phone_number_id', eventPhoneNumberId)
        continue
      }

      /* ---------- 1. Delivery status updates (blue ticks etc.) ---------- */
      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue
        try {
          await db.whatsAppMessage.updateMany({
            where: { waMessageId: status.id, direction: 'out' },
            data: { status: status.status },
          })
        } catch {
          /* non-fatal */
        }
      }

      /* ---------- 2. Inbound customer messages ---------- */
      for (const message of value.messages ?? []) {
        const from = message.from
        const messageId = message.id
        if (!from || !messageId) continue

        const body = extractText(message)
        const contactName = value.contacts?.[0]?.profile?.name

        // Dedupe on Meta's message id (Meta retries webhooks)
        const isNew = await saveInboundMessage(
          account.id,
          from,
          account.displayPhone || account.phoneNumberId,
          body,
          messageId
        )
        if (!isNew) continue

        console.log(`[whatsapp-webhook] inbound from +${from}: ${body.slice(0, 80)}`)

        // Mark as read (best effort)
        await waMarkRead(account, messageId)

        // Auto-reply through the NEXUS agent
        if (account.autoReply) {
          try {
            const reply = await generateAgentReply(account, from, body, contactName)
            const result = await waSendText(account, from, reply)
            await saveOutboundMessage(
              account.id,
              account.displayPhone || account.phoneNumberId,
              from,
              reply,
              result.waMessageId ?? null,
              result.ok ? 'sent' : 'failed'
            )
            if (result.ok) {
              console.log(`[whatsapp-webhook] agent replied to +${from}: ${reply.slice(0, 80)}`)
            } else {
              await db.whatsAppAccount.update({
                where: { id: account.id },
                data: { status: 'error', statusMessage: result.error ?? 'Send failed' },
              })
            }
          } catch (error) {
            console.error('[whatsapp-webhook] auto-reply error:', error)
          }
        }
      }
    }
  }
}
