import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/conversations/[id] — the FULL user↔AI transcript.
 * Returns every message incl. thinking traces, tool calls (name + JSON
 * args/results) and generated attachment cards, plus the owning user and
 * session metadata. This is the console's ground truth for "see even the
 * chat with the AI for the users".
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const { id } = await params
    const session = await db.chatSession.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } },
        project: { select: { id: true, name: true, color: true, customInstructions: true } },
      },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const messages = await db.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, role: true, content: true, thinking: true,
        toolName: true, toolData: true, attachments: true, createdAt: true,
      },
    })

    // Parse heavy JSON fields once so the UI doesn't re-parse per bubble.
    const parsed = messages.map(m => ({
      ...m,
      toolDataParsed: (() => {
        if (!m.toolData) return null
        try { return JSON.parse(m.toolData) } catch { return { raw: m.toolData.slice(0, 2000) } }
      })(),
      attachmentsParsed: (() => {
        if (!m.attachments) return []
        try { return JSON.parse(m.attachments) } catch { return [] }
      })(),
    }))

    return NextResponse.json({
      session: {
        id: session.id, title: session.title, kind: session.kind,
        agentSlug: session.agentSlug, agentPinned: session.agentPinned,
        user: session.user ?? { id: null, email: 'guest@nexus.local', name: 'Guest (anonymous)' },
        project: session.project,
        createdAt: session.createdAt, updatedAt: session.updatedAt,
      },
      messages: parsed,
      stats: {
        total: parsed.length,
        user: parsed.filter(m => m.role === 'user').length,
        assistant: parsed.filter(m => m.role === 'assistant').length,
        tool: parsed.filter(m => m.role === 'tool').length,
        withThinking: parsed.filter(m => m.thinking).length,
        withAttachments: parsed.filter(m => (m.attachmentsParsed as unknown[]).length > 0).length,
      },
    })
  } catch (error) {
    console.error('[api/console/conversations/[id]] error:', error)
    return NextResponse.json({ error: 'Failed to load transcript' }, { status: 500 })
  }
}
