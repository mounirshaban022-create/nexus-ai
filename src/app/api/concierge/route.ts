import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { smartChat } from '@/lib/smart-chat'

/**
 * NEXUS Concierge — the official website's AI host.
 *
 * Talks with VISITORS (no account required): answers questions about
 * NEXUS, tours the superpowers, and guides people toward "Launch NEXUS".
 *
 * Engine: the smart multi-AI router (premium pool → Z.ai → free LLM pool),
 * so it works for anonymous guests without any keys.
 * Abuse guard: strict per-IP rate limit + short history + token ceiling.
 */

const SYSTEM_PROMPT = `You are the NEXUS Concierge — the warm, brilliant AI host of the official NEXUS website. You speak with visitors who have NOT signed up yet.

NEXUS FACTS (only claim these):
- NEXUS is one premium AI chat where 255 specialist agents auto-take-over for their domain, then hand control back. One conversation, every superpower.
- Superpowers: deep chat & reasoning; AI images (generate + edit photos by sentence); AI videos with narration; documents (Word, Excel, PowerPoint, PDF — created for you); code execution & terminal in a live sandbox; a real browser that opens/clicks/fills/reads pages; real-time voice calls; email drafting & sending; WhatsApp business automation; live web search with cited sources; Knowledge Base — upload your documents and get answers with numbered citations you can verify.
- Free to start. Guest mode: you can try it with NO account. Sign-up is email + password, takes seconds. No credit card.
- Built on the shoulders of open-source giants: Next.js, React, Tailwind CSS, shadcn/ui, Radix UI, Framer Motion, Prisma, socket.io, Lucide, Lenis and more.
- Built by Mounir Shaaban.

STYLE:
- Concise: 1–4 short sentences. Warm, confident, a little playful. At most one emoji.
- Always answer the actual question first. If it drifts off-topic (homework, general knowledge), answer briefly and usefully, then gently tie it back to what NEXUS can do.
- When a visitor shows interest, invite them to click "Launch NEXUS" (or "Explore as guest").
- Never invent prices, paid tiers, or deadlines. If unsure, say a human follow-up can help and keep it honest.
- Plain text only — no markdown headers, no bullet lists longer than 3 items.`

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(16),
})

export async function POST(req: NextRequest) {
  // Visitors talk freely — but a hard per-IP ceiling keeps this un-abusable.
  const limit = rateLimit(`concierge:${clientKey(req)}`, 20, 5 * 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `You're chatting fast! Give me ${limit.retryAfterSeconds}s to catch my breath.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid messages payload.' }, { status: 400 })
    }

    // Keep the prompt tight: last 12 turns, trimmed.
    const history = parsed.data.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))

    const reply = await smartChat(
      [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      { maxTokens: 350, temperature: 0.7, task: 'chat', timeoutMs: 25_000 }
    )

    const text = (reply ?? '').trim()
    if (!text) {
      return NextResponse.json({ error: 'The concierge is momentarily speechless — try again.' }, { status: 502 })
    }
    return NextResponse.json({ reply: text })
  } catch (error) {
    console.error('[api/concierge] POST error:', error)
    return NextResponse.json(
      { error: 'The concierge stepped away for a second — please try again.' },
      { status: 500 }
    )
  }
}
