import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    // Auth gate — conversation rows are only readable by their owner.
    const auth = await getVerifiedSession(req)
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const { id } = await context.params
    const session = await db.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!session || session.userId !== auth.userId) {
      // 404 (not 403) — don't leak the existence of other users' rows.
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        kind: session.kind,
        agentSlug: session.agentSlug ?? null,
        agentPinned: session.agentPinned ?? false,
        updatedAt: session.updatedAt,
        messages: session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          toolName: m.toolName,
          toolData: m.toolData,
          attachments: m.attachments ? JSON.parse(m.attachments) : [],
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
    // Auth gate — only the owner may delete a conversation.
    const auth = await getVerifiedSession(req)
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const rl = rateLimit(`session-del:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    const { id } = await context.params
    const row = await db.chatSession.findUnique({ where: { id }, select: { userId: true } })
    if (!row || row.userId !== auth.userId) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }
    await db.chatSession.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete conversation.' }, { status: 500 })
  }
}
