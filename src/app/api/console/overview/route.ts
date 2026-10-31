import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'
import { ensureConsoleTables, recentAudit } from '@/lib/console/guard'
import { premiumImageEngines } from '@/lib/premium-image'
import { hfConfigured, xaiConfigured, groqConfiguredIfAvailable } from '@/lib/console/engines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/overview — live command-center KPIs.
 * Everything is computed from the REAL production database + the live
 * deployment environment: user counts, activity windows, generation
 * volumes, messaging footprint, AI engine availability, integration
 * status and the most recent console audit trail.
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    await ensureConsoleTables()

    const now = Date.now()
    const dayAgo = new Date(now - 24 * 3600_000)
    const weekAgo = new Date(now - 7 * 24 * 3600_000)

    // ── User metrics ────────────────────────────────────────────────
    const [totalUsers, newUsers24h, activeWeek, guests] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: dayAgo } } }),
      db.user.count({ where: { lastActiveAt: { gte: weekAgo } } }),
      db.chatSession.count({ where: { userId: null } }),
    ])

    // ── Conversation metrics ────────────────────────────────────────
    const [sessions, messages, messages24h, agentSessions] = await Promise.all([
      db.chatSession.count(),
      db.chatMessage.count(),
      db.chatMessage.count({ where: { createdAt: { gte: dayAgo } } }),
      db.chatSession.count({ where: { agentSlug: { not: null } } }),
    ])

    // ── Generation volumes ─────────────────────────────────────────
    const [images, videos, documents, images24h] = await Promise.all([
      db.generatedImage.count(),
      db.generatedVideo.count(),
      db.generatedDocument.count(),
      db.generatedImage.count({ where: { createdAt: { gte: dayAgo } } }),
    ])

    // ── Messaging footprint ────────────────────────────────────────
    let emailAccounts = 0
    let whatsappAccounts = 0
    let whatsappMessages = 0
    let whatsappIn24h = 0
    try {
      emailAccounts = await db.emailAccount.count()
      whatsappAccounts = await db.whatsAppAccount.count()
      whatsappMessages = await db.whatsAppMessage.count()
      whatsappIn24h = await db.whatsAppMessage.count({ where: { createdAt: { gte: dayAgo } } })
    } catch { /* tables may be absent in dev */ }

    // ── Projects + memory ──────────────────────────────────────────
    let projects = 0
    let memories = 0
    try {
      projects = await db.project.count()
      memories = await db.userMemory.count()
    } catch { /* older DBs */ }

    // ── AI engines live status (presence of provisioned keys) ──────
    const engines = {
      gemini: premiumImageEngines().gemini,
      huggingface: hfConfigured(),
      xai: xaiConfigured(),
      groq: groqConfiguredIfAvailable(),
      agnesVideo: Boolean(process.env.AGNES_API_KEY),
      vercelGateway: Boolean(process.env.AI_GATEWAY_API_KEY),
      pollinations: true,
      zai: false, // permanently disabled by owner directive
    }

    // ── Supabase (database) connectivity — real latency probe ──────
    let dbLatencyMs = -1
    try {
      const t0 = Date.now()
      await db.$queryRaw`SELECT 1`
      dbLatencyMs = Date.now() - t0
    } catch { /* unreachable */ }

    // ── Recent growth sparkline: messages per day (14 days) ────────
    let activity: { day: string; count: number }[] = []
    try {
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT DATE("createdAt") AS day, COUNT(*) AS count
         FROM "ChatMessage"
         WHERE "createdAt" >= NOW() - INTERVAL '14 days'
         GROUP BY DATE("createdAt") ORDER BY day ASC`
      )
      activity = rows.map(r => ({ day: String(r.day).slice(0, 10), count: Number(r.count) }))
    } catch { /* SQLite dev: DATE() differs — non-fatal */ }

    const trail = await recentAudit(8)

    return NextResponse.json({
      users: { total: totalUsers, new24h: newUsers24h, activeWeek, guests },
      conversations: { sessions, messages, messages24h, agentSessions },
      generations: { images, videos, documents, images24h },
      messaging: { emailAccounts, whatsappAccounts, whatsappMessages, whatsappIn24h },
      workspace: { projects, memories },
      engines,
      platform: {
        dbLatencyMs,
        supabaseConfigured: dbLatencyMs >= 0,
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
        isVercel: Boolean(process.env.VERCEL),
        region: process.env.VERCEL_REGION ?? 'local',
      },
      activity,
      auditTrail: trail,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[api/console/overview] error:', error)
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 })
  }
}
