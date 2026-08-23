import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get('kind') === 'agent' ? 'agent' : 'chat'
    const sessions = await db.chatSession.findMany({
      where: { kind },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
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
