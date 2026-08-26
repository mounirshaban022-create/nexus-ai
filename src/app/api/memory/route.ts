import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 — Priority 1: per-user memory store.
 *
 * Memory is distinct from per-session chat history — each row is one durable
 * fact the user asked NEXUS to remember about them (or that they added
 * manually from the profile page). Injected into the system prompt for
 * future sessions owned by the same userId (Phase 0 Bug 3 scoping).
 *
 * This file: list (GET) and create (POST). Edit/delete live at /api/memory/[id].
 *
 * All endpoints require a verified session cookie. Guests get 401 — there
 * is no guest memory path (memory is, by definition, per-user).
 */

const MAX_MEMORIES_RETURNED = 200
const MAX_MEMORY_CHARS = 600

const createSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MEMORY_CHARS),
  sourceSessionId: z.string().max(64).optional().nullable(),
})

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to view memories.' }, { status: 401 })
  }
  const limit = rateLimit(`memory:list:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const memories = await db.userMemory.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_MEMORIES_RETURNED,
    select: {
      id: true,
      content: true,
      sourceSessionId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ memories })
}

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to save memories.' }, { status: 401 })
  }
  const limit = rateLimit(`memory:create:${session.userId}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Memory text is required (max 600 chars).' },
      { status: 400 }
    )
  }

  // Cap total memories per user to prevent runaway growth (cheap DOS guard).
  // 500 memories × 600 chars = 300KB max — well within SQLite comfort zone.
  const count = await db.userMemory.count({ where: { userId: session.userId } })
  if (count >= 500) {
    return NextResponse.json(
      { error: 'Memory limit reached (500). Delete one before adding another.' },
      { status: 409 }
    )
  }

  const memory = await db.userMemory.create({
    data: {
      userId: session.userId,
      content: parsed.data.content,
      sourceSessionId: parsed.data.sourceSessionId ?? null,
    },
    select: {
      id: true,
      content: true,
      sourceSessionId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ memory }, { status: 201 })
}
