import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { buildSystemPrompt } from '@/lib/chat-system-prompt'

const requestSchema = z.object({ sessionId: z.string().min(1).max(64) })

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`chat-regen:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    }

    const session = await db.chatSession.findFirst({
      where: { id: parsed.data.sessionId, kind: 'chat' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!session) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    // There must be at least a user message to re-run
    const messages = session.messages
    const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === 'user')
    if (lastUserIndex === -1) {
      return NextResponse.json({ error: 'Nothing to regenerate.' }, { status: 400 })
    }

    // Remove trailing assistant message(s) after the last user message
    const cutoff = messages.length - 1 - lastUserIndex
    const trailing = messages.slice(cutoff + 1).filter((m) => m.role === 'assistant')
    for (const m of trailing) {
      await db.chatMessage.delete({ where: { id: m.id } })
    }

    // Rebuild history and re-run completion. Uses the SAME world-class system
    // prompt as the main chat route (was a weak 3-line prompt sent as an
    // "assistant" message — models then believed they had already SAID the
    // instructions, which degraded instruction following on this path).
    // The user's durable memories are injected too, so a regenerated reply
    // stays consistent with everything the assistant knows about them.
    const remaining = messages.slice(0, cutoff + 1)
    let memories: Array<{ content: string }> = []
    if (session.userId) {
      memories = await db.userMemory.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { content: true },
      })
    }
    // Same always-on public connectors the main route advertises (email
    // connectors require a connected account and are omitted here).
    const enabledConnectors = [
      'web_search', 'read_page', 'wikipedia', 'weather', 'crypto', 'currency',
      'translate', 'dictionary', 'github', 'hacker_news', 'time', 'calculator',
      'recipes', 'nasa', 'news', 'trivia', 'pokemon', 'games', 'forecast',
      'space_news', 'air_quality', 'music',
    ]
    const llmMessages = [
      { role: 'system', content: buildSystemPrompt(enabledConnectors) },
      ...(memories.length
        ? [{ role: 'system', content: `ABOUT THE USER (your memory of them — use naturally):\n${memories.map((m) => `- ${m.content}`).join('\n')}` }]
        : []),
      ...remaining.slice(-30).map((m) => ({ role: m.role, content: m.content })),
    ]

    const reply = await smartChat(llmMessages, { maxTokens: 4000, task: 'chat' })
    if (!reply || !reply.trim()) {
      throw new Error('The model returned an empty response. Please try again.')
    }

    const saved = await db.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: reply },
    })
    await db.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      removedIds: trailing.map((m) => m.id),
      reply: { id: saved.id, role: 'assistant', content: reply },
    })
  } catch (error) {
    console.error('[api/chat/regenerate] POST error:', error)
    const message = error instanceof Error ? error.message : 'Regeneration failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
