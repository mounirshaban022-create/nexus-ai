import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getVerifiedSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
    // Auth gate + ownership scoping: conversation history is per-account.
    // Signed-out (guest) clients get 401 — their chats still work, they
    // just aren't listed server-side.
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`file-read:${clientKey(req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  try {
    const kind = req.nextUrl.searchParams.get('kind') === 'agent' ? 'agent' : 'chat'
    const sessions = await db.chatSession.findMany({
      where: { kind, userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        agentSlug: s.agentSlug ?? null,
        agentPinned: s.agentPinned ?? false,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        preview: s.messages[0]?.content?.slice(0, 120) ?? '',
      })),
    })
  } catch (error) {
    console.error('[api/chat/sessions] GET error:', error)
    return NextResponse.json({ error: 'Failed to load conversations.' }, { status: 500 })
  }
}
