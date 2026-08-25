import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const session = await db.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        kind: session.kind,
        agentSlug: session.agentSlug ?? null,
        updatedAt: session.updatedAt,
        messages: session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          toolName: m.toolName,
          toolData: m.toolData,
        })),
      },
    })
  } catch (error) {
    console.error('[api/chat/sessions/:id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load conversation.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const rl = rateLimit(`session-del:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    const { id } = await context.params
    await db.chatSession.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete conversation.' }, { status: 500 })
  }
}
