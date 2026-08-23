import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const SYSTEM_PROMPT =
  'You are NEXUS, the AI at the heart of the NEXUS AI super app — an assistant with ' +
  'superpowers: chat, image generation, vision, voice, web search, page reading, and an ' +
  'agent that connects to external tools. You are helpful, precise, and friendly. Format ' +
  'answers in clean Markdown (headings, lists, tables, code blocks) whenever it improves ' +
  'clarity. Be concise for simple questions and thorough for complex ones.'

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

    // Rebuild history and re-run completion
    const remaining = messages.slice(0, cutoff + 1)
    const llmMessages = [
      { role: 'assistant', content: SYSTEM_PROMPT },
      ...remaining.slice(-24).map((m) => ({ role: m.role, content: m.content })),
    ]

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: llmMessages,
      thinking: { type: 'disabled' },
    })

    const reply = completion.choices[0]?.message?.content
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
