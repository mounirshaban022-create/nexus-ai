import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 — Priority 1: per-user memory edit/delete.
 *
 * All operations check ownership: the memory row must belong to the
 * verified session user. A user cannot edit or delete another user's
 * memories, even if they know the memory id (which is a cuid, but
 * defence-in-depth — never trust an opaque id alone).
 */

const MAX_MEMORY_CHARS = 600

const patchSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MEMORY_CHARS),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to edit memories.' }, { status: 401 })
  }
  const limit = rateLimit(`memory:edit:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Memory text is required (max 600 chars).' },
      { status: 400 }
    )
  }

  // Ownership check — findFirst with userId scoping means a row owned by
  // another user is invisible (returns null) and we 404 rather than leak.
  const existing = await db.userMemory.findFirst({
    where: { id, userId: session.userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Memory not found.' }, { status: 404 })
  }

  const updated = await db.userMemory.update({
    where: { id: existing.id },
    data: { content: parsed.data.content },
    select: {
      id: true,
      content: true,
      sourceSessionId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ memory: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to delete memories.' }, { status: 401 })
  }
  const limit = rateLimit(`memory:delete:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params

  // Ownership check — same defence-in-depth as PATCH.
  const existing = await db.userMemory.findFirst({
    where: { id, userId: session.userId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Memory not found.' }, { status: 404 })
  }

  await db.userMemory.delete({ where: { id: existing.id } })

  return NextResponse.json({ ok: true })
}
