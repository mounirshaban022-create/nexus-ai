import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/conversations — every chat on the platform (user + guest).
 * Query: ?q=<title search> &userId= &kind=chat|agent &limit= &offset=
 * Returns session cards enriched with owner + message counts so the
 * console can present the full user↔AI activity inventory.
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const userId = url.searchParams.get('userId') ?? undefined
    const kind = url.searchParams.get('kind') ?? undefined
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 40), 100)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

    const where: Record<string, unknown> = {}
    if (q) where.title = { contains: q }
    if (userId) where.userId = userId
    if (kind === 'chat' || kind === 'agent') where.kind = kind
    if (userId === 'guest') where.userId = null

    const sessions = await db.chatSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true, color: true } },
        _count: { select: { messages: true } },
      },
    })

    const total = await db.chatSession.count({ where })

    // Preview snippet: first user message per session (bounded batch).
    const previews = await Promise.all(
      sessions.slice(0, 20).map(async s => {
        try {
          const first = await db.chatMessage.findFirst({
            where: { sessionId: s.id, role: 'user' },
            orderBy: { createdAt: 'asc' },
            select: { content: true },
          })
          return { id: s.id, preview: (first?.content ?? '').slice(0, 180) }
        } catch {
          return { id: s.id, preview: '' }
        }
      })
    )
    const previewMap = new Map(previews.map(p => [p.id, p.preview]))

    return NextResponse.json({
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        agentSlug: s.agentSlug,
        agentPinned: s.agentPinned,
        user: s.user ?? { id: null, email: 'guest@nexus.local', name: 'Guest (anonymous)' },
        project: s.project,
        messageCount: s._count.messages,
        preview: previewMap.get(s.id) ?? '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
    })
  } catch (error) {
    console.error('[api/console/conversations] error:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}
