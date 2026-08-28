import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { getWhatsAppAccount } from '@/lib/whatsapp'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* /api/whatsapp/messages — inbox feed for the WhatsApp mode UI.      */
/* Optional ?from=<number> filter returns one conversation.           */
/* Account-scoped feature — requires a verified session.              */
/* ------------------------------------------------------------------ */

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

  const messages = await db.whatsAppMessage.findMany({
    where: fromFilter ? { accountId: account.id, fromNumber: fromFilter } : { accountId: account.id },
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

  return NextResponse.json({
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
    account: {
      autoReply: account.autoReply,
      webhookVerified: account.webhookVerified,
      status: account.status,
    },
  })
}
