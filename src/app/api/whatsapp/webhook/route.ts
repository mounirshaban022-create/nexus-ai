import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { db } from '@/lib/db'
import {
  getWhatsAppAccount,
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

  const account = await getWhatsAppAccount()
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

  let payload: WaWebhookPayload
  try {
    payload = (await req.json()) as WaWebhookPayload
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

  const account = await getWhatsAppAccount()
  if (!account) return

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      // --- Security check: event must belong to OUR phone number ID ---
      const eventPhoneNumberId = value.metadata?.phone_number_id
      if (eventPhoneNumberId && eventPhoneNumberId !== account.phoneNumberId) {
        console.warn('[whatsapp-webhook] dropped event for foreign phone_number_id')
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
