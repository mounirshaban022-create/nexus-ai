import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'
import { ensureConsoleTables, getUserFlag } from '@/lib/console/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/users — full account directory with real usage stats.
 * Query params: ?q=<search> &limit= &offset= &sort=recent|activity|volume
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    await ensureConsoleTables()
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

    const where = q
      ? {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
          ],
        }
      : {}

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true, email: true, name: true, avatarUrl: true, bio: true,
        location: true, timezone: true, language: true, jobTitle: true,
        interests: true, commStyle: true, notifications: true,
        emailVerified: true, lastActiveAt: true, createdAt: true, updatedAt: true,
      },
    })

    const total = await db.user.count({ where })

    // Real per-user usage stats in one pass each (indexes exist on userId+createdAt).
    const enriched = await Promise.all(
      users.map(async u => {
        const [sessions, msgs, images, videos, docs, projects, flag] = await Promise.all([
          db.chatSession.count({ where: { userId: u.id } }),
          db.chatMessage.count({ where: { session: { userId: u.id } } }),
          db.generatedImage.count({ where: { userId: u.id } }),
          db.generatedVideo.count({ where: { userId: u.id } }),
          db.generatedDocument.count({ where: { userId: u.id } }),
          db.project.count({ where: { userId: u.id } }).catch(() => 0),
          getUserFlag(u.id),
        ])
        return {
          ...u,
          stats: { sessions, messages: msgs, images, videos, documents: docs, projects },
          control: { suspended: flag?.suspended ?? false, note: flag?.note ?? null },
        }
      })
    )

    // Platform-wide guest activity (sessions with no owner).
    const guestSessions = await db.chatSession.count({ where: { userId: null } })
    const guestMessages = await db.chatMessage.count({ where: { session: { userId: null } } })

    return NextResponse.json({
      users: enriched,
      total,
      guests: { sessions: guestSessions, messages: guestMessages },
    })
  } catch (error) {
    console.error('[api/console/users] error:', error)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }
}
