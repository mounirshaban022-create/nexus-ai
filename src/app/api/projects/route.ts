import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 — Priority 3: persistent projects with multi-session + files +
 * persistent custom instructions.
 *
 * This file: list (GET) and create (POST). Detail/edit/delete live at
 * /api/projects/[id]. File sub-resources live at /api/projects/[id]/files
 * and /api/projects/[id]/files/[fileId].
 *
 * All endpoints require a verified session cookie. Guests get 401 — there
 * is no guest project path (projects are, by definition, per-user durable
 * context).
 *
 * Ownership is enforced at every write/read via findFirst({ where: { id,
 * userId: session.userId } }) — an opaque id alone is never trusted.
 */

const MAX_NAME = 100
const MAX_DESC = 500
const MAX_INSTRUCTIONS = 4000
const MAX_PROJECTS_PER_USER = 100
const ALLOWED_COLORS = ['amber', 'orange', 'rose', 'pink', 'yellow'] as const

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
  description: z.string().trim().max(MAX_DESC).optional().default(''),
  color: z.enum(ALLOWED_COLORS).optional().default('amber'),
  customInstructions: z.string().trim().max(MAX_INSTRUCTIONS).optional().default(''),
})

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to view projects.' }, { status: 401 })
  }
  const limit = rateLimit(`project:list:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  // Eager aggregate stats (conversation count, file count, last activity)
  // via Prisma's relation count — single query, no N+1.
  const projects = await db.project.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_PROJECTS_PER_USER,
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      customInstructions: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          sessions: true,
          files: true,
        },
      },
    },
  })

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      customInstructions: p.customInstructions,
      stats: {
        conversations: p._count.sessions,
        files: p._count.files,
      },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to create projects.' }, { status: 401 })
  }
  const limit = rateLimit(`project:create:${session.userId}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Name is required (max 100 chars). Description max 500. Instructions max 4000.' },
      { status: 400 }
    )
  }

  // Cap total projects per user to prevent runaway growth.
  const count = await db.project.count({ where: { userId: session.userId } })
  if (count >= MAX_PROJECTS_PER_USER) {
    return NextResponse.json(
      { error: `Project limit reached (${MAX_PROJECTS_PER_USER}). Delete one before creating another.` },
      { status: 409 }
    )
  }

  const project = await db.project.create({
    data: {
      userId: session.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      color: parsed.data.color,
      customInstructions: parsed.data.customInstructions ?? '',
    },
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

  return NextResponse.json({ project }, { status: 201 })
}
