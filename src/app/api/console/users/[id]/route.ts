import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'
import { audit, getUserFlag, setUserSuspended } from '@/lib/console/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/users/[id] — single account inspect + real control actions.
 *
 *  GET    → profile, usage stats, recent sessions, connected accounts
 *  PATCH  { action: 'suspend' | 'unsuspend', note? } → real access control:
 *          the app's session verifier (src/lib/auth.ts) consults the console
 *          flag table, so a suspended user is signed out on their very next
 *          request, and new sign-ins are refused.
 *  PATCH  { action: 'verify_email' }           → mark emailVerified
 *  PATCH  { action: 'force_signout' }          → not supported by design
 *          (JWTs are stateless) — use suspend instead, which is stronger.
 *  DELETE ?confirm=<email>                     → permanent cascade delete
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, avatarUrl: true, bio: true,
        location: true, timezone: true, language: true, jobTitle: true, website: true,
        interests: true, commStyle: true, notifications: true, emailVerified: true,
        lastActiveAt: true, createdAt: true, updatedAt: true,
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [sessions, msgs, images, videos, docs, memories, emailAccounts, aiProviders, waAccounts, flag] = await Promise.all([
      db.chatSession.count({ where: { userId: id } }),
      db.chatMessage.count({ where: { session: { userId: id } } }),
      db.generatedImage.count({ where: { userId: id } }),
      db.generatedVideo.count({ where: { userId: id } }),
      db.generatedDocument.count({ where: { userId: id } }),
      db.userMemory.count({ where: { userId: id } }).catch(() => 0),
      db.emailAccount.count({ where: { userId: id } }).catch(() => 0),
      db.aiProvider.count({ where: { userId: id } }).catch(() => 0),
      db.whatsAppAccount.count({ where: { userId: id } }).catch(() => 0),
      getUserFlag(id),
    ])

    const recentSessions = await db.chatSession.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, kind: true, agentSlug: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
    })

    return NextResponse.json({
      user,
      stats: { sessions, messages: msgs, images, videos, documents: docs, memories, emailAccounts, aiProviders, whatsappAccounts: waAccounts },
      recentSessions,
      control: { suspended: flag?.suspended ?? false, note: flag?.note ?? null },
    })
  } catch (error) {
    console.error('[api/console/users/[id]] GET error:', error)
    return NextResponse.json({ error: 'Failed to load user' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '')

    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (action === 'suspend' || action === 'unsuspend') {
      const suspended = action === 'suspend'
      await setUserSuspended(id, suspended, typeof body?.note === 'string' ? body.note : undefined)
      await audit(suspended ? 'user.suspend' : 'user.unsuspend', { target: user.email, detail: body?.note ?? undefined })
      return NextResponse.json({ ok: true, suspended })
    }

    if (action === 'verify_email') {
      await db.user.update({ where: { id }, data: { emailVerified: true } })
      await audit('user.verify_email', { target: user.email })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('[api/console/users/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const { id } = await params
    const url = new URL(req.url)
    const confirm = (url.searchParams.get('confirm') ?? '').toLowerCase()
    const user = await db.user.findUnique({ where: { id }, select: { email: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (confirm !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Type the user email as ?confirm=<email> to delete' }, { status: 400 })
    }
    // Cascades: sessions/messages/media/memories/projects/accounts per schema onDelete rules.
    await db.user.delete({ where: { id } })
    await audit('user.delete', { target: user.email, detail: 'cascade delete from console' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/console/users/[id]] DELETE error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
