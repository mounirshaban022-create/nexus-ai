import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import {
  getWhatsAppAccount,
  saveInboundMessage,
  saveOutboundMessage,
  generateAgentReply,
} from '@/lib/whatsapp'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* /api/whatsapp/messages — inbox feed for the WhatsApp mode UI.      */
/* Optional ?from=<number> filter returns one conversation.           */
/* POST { text, demo?: true } — rehearsal demo chat (see below).      */
/* Account-scoped feature — requires a verified session.              */
/* ------------------------------------------------------------------ */

/* Shared inbox query — newest-first fetch grouped into conversations,
   reused by GET and POST so both return the exact same shape. */
async function loadInbox(accountId: string, take: number, fromFilter?: string | null) {
  const messages = await db.whatsAppMessage.findMany({
    where: fromFilter ? { accountId, fromNumber: fromFilter } : { accountId },
    orderBy: { createdAt: 'desc' },
    take,
  })

  // Group into conversations by the "other party" number
  const byPeer = new Map<
    string,
    { peer: string; lastAt: Date; lastBody: string; lastDirection: string; unread: number; count: number }
  >()
  for (const msg of messages) {
    const peer = msg.direction === 'in' ? msg.fromNumber : msg.toNumber
    const existing = byPeer.get(peer)
    if (!existing) {
      byPeer.set(peer, {
        peer,
        lastAt: msg.createdAt,
        lastBody: msg.body,
        lastDirection: msg.direction,
        unread: 0,
        count: 1,
      })
    } else {
      existing.count += 1
    }
  }

  const conversations = [...byPeer.values()].sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime()
  )

  return {
    messages: messages
      .slice(0, take)
      .reverse()
      .map((m) => ({
        id: m.id,
        from: m.fromNumber,
        to: m.toNumber,
        direction: m.direction,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    conversations,
  }
}

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const limit = rateLimit(`wa-messages:${clientKey(req)}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const account = await getWhatsAppAccount(session.userId)
  if (!account) {
    return NextResponse.json({ messages: [], conversations: [] })
  }

  const fromFilter = req.nextUrl.searchParams.get('from')
  const take = Math.min(Number(req.nextUrl.searchParams.get('take') ?? 100), 200)

  const inbox = await loadInbox(account.id, take, fromFilter)

  return NextResponse.json({
    ...inbox,
    account: {
      autoReply: account.autoReply,
      webhookVerified: account.webhookVerified,
      status: account.status,
    },
  })
}

/* ------------------------------------------------------------------ */
/* POST { text, demo?: true } — in rehearsal mode, simulate a customer */
/* message and let the agent reply hands-free. Real sending happens    */
/* through the Meta webhook when live credentials are connected.       */
/* ------------------------------------------------------------------ */

const demoSchema = z.object({
  text: z.string().min(1).max(1000),
  demo: z.boolean().optional().default(true),
})

const DEMO_CUSTOMER = '971500000001'

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const limit = rateLimit(`wa-demo:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many demo messages. Wait a moment.' },
      { status: 429 }
    )
  }

  const parsed = demoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type a message first.' }, { status: 400 })
  }

  const account = await getWhatsAppAccount(session.userId)
  if (!account) {
    return NextResponse.json({ error: 'No WhatsApp account connected yet.' }, { status: 404 })
  }

  const selfNumber = account.displayPhone || '000000000000'

  // 1. Simulate the customer's inbound message (dedupe-safe unique id).
  await saveInboundMessage(
    account.id,
    DEMO_CUSTOMER,
    selfNumber,
    parsed.data.text,
    `demo.${Date.now()}`
  )

  // 2. The full agent pipeline runs — same brain as a real customer chat.
  //    Always replies here: this is the demo, regardless of the autoReply flag.
  try {
    const reply = await generateAgentReply(
      account,
      DEMO_CUSTOMER,
      parsed.data.text,
      'Demo Customer'
    )
    await saveOutboundMessage(account.id, selfNumber, DEMO_CUSTOMER, reply, null, 'sent')
  } catch (error) {
    console.error('[whatsapp-messages] demo reply error:', error)
    // Fall through — the saved messages are still returned below.
  }

  // 3. Same response shape as GET so the UI can refresh in one round trip.
  const inbox = await loadInbox(account.id, 100)

  return NextResponse.json({
    ...inbox,
    account: {
      autoReply: account.autoReply,
      webhookVerified: account.webhookVerified,
      status: account.status,
    },
  })
}
