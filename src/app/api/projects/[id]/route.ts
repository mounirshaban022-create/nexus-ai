import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 P3 — single-project detail + edit + delete.
 *
 * GET    /api/projects/[id] → project fields + 50 most-recent sessions
 *                              (id, title, createdAt, updatedAt) + all files
 *                              (id, filename, mimeType, size, createdAt).
 * PATCH  /api/projects/[id] → update name/description/color/customInstructions.
 * DELETE /api/projects/[id] → delete the project. Sessions get projectId=null
 *                              (SetNull), so their history survives but loses
 *                              the project context. Files cascade-delete
 *                              (they only exist in the project context).
 *
 * Ownership check is the same Phase 0 Bug 3 pattern as /api/memory/[id]:
 * `findFirst({ where: { id, userId: session.userId } })`. A project owned
 * by another user is invisible (404), not exposed — defence in depth,
 * never trust an opaque id alone.
 */

const MAX_NAME = 100
const MAX_DESC = 500
const MAX_INSTRUCTIONS = 4000
const ALLOWED_COLORS = ['amber', 'orange', 'rose', 'pink', 'yellow'] as const

const patchSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME).optional(),
  description: z.string().trim().max(MAX_DESC).optional(),
  color: z.enum(ALLOWED_COLORS).optional(),
  customInstructions: z.string().trim().max(MAX_INSTRUCTIONS).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to view projects.' }, { status: 401 })
  }
  const limit = rateLimit(`project:get:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  // Ownership: scoped to the verified user. A row owned by another user
  // returns null → 404 (no info leak).
  const project = await db.project.findFirst({
    where: { id, userId: session.userId },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      customInstructions: true,
      createdAt: true,
      updatedAt: true,
      sessions: {
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      files: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  return NextResponse.json({ project })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to edit projects.' }, { status: 401 })
  }
  const limit = rateLimit(`project:edit:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid fields. Name max 100, description max 500, instructions max 4000.' },
      { status: 400 }
    )
  }

  // Ownership check — same defence-in-depth as /api/memory/[id].
  const existing = await db.project.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  // Strip undefined fields so we don't null-out unset fields on partial PATCH.
  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v
  }

  const updated = await db.project.update({
    where: { id: existing.id },
    data: updates,
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      customInstructions: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ project: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to delete projects.' }, { status: 401 })
  }
  const limit = rateLimit(`project:delete:${session.userId}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  // Ownership check — defence in depth.
  const existing = await db.project.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  // Files cascade-delete (Project → ProjectFile onDelete: Cascade).
  // Sessions get projectId=null (SetNull), so their history is preserved
  // and they remain accessible from the loose chat list — they just lose
  // the project's persistent context.
  await db.project.delete({ where: { id: existing.id } })

  return NextResponse.json({ ok: true })
}
