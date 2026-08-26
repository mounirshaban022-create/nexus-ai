import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 P3 — project reference files.
 *
 * POST   /api/projects/[id]/files        → upload a new file (JSON body with
 *                                          filename + content + optional
 *                                          mimeType). Text content only —
 *                                          ≤ 200KB per file, max 50 files
 *                                          per project, both enforced here.
 * GET    /api/projects/[id]/files        → list files (id, filename, mimeType,
 *                                          size, createdAt — NO content,
 *                                          to keep the response small).
 *
 * File-content text is injected into the chat system prompt when a session
 * bound to this project is running — see /api/chat/route.ts. That gives
 * NEXUS durable, project-scoped knowledge of source code, markdown notes,
 * JSON configs, CSVs, etc. Binary file support (PDFs, docx, images) is out
 * of scope for V1.
 *
 * The single-file DELETE endpoint lives at /api/projects/[id]/files/[fileId].
 */

const MAX_FILENAME = 200
const MAX_FILE_BYTES = 200 * 1024 // 200 KB
const MAX_FILES_PER_PROJECT = 50
const MAX_FILENAME_BYTES = 200

const createSchema = z.object({
  filename: z.string().trim().min(1).max(MAX_FILENAME_BYTES),
  content: z.string().min(1).max(MAX_FILE_BYTES),
  mimeType: z.string().trim().max(100).optional().default('text/plain'),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to view project files.' }, { status: 401 })
  }
  const limit = rateLimit(`project:files:list:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  // Ownership check via project scoping.
  const project = await db.project.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  const files = await db.projectFile.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_FILES_PER_PROJECT,
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ files })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to add project files.' }, { status: 401 })
  }
  const limit = rateLimit(`project:files:add:${session.userId}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id } = await params
  // Ownership check — never trust the project id alone.
  const project = await db.project.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `filename (1-${MAX_FILENAME} chars) and content (1-${MAX_FILE_BYTES} bytes) are required.` },
      { status: 400 }
    )
  }

  // Cap total files per project.
  const count = await db.projectFile.count({ where: { projectId: project.id } })
  if (count >= MAX_FILES_PER_PROJECT) {
    return NextResponse.json(
      { error: `File limit reached (${MAX_FILES_PER_PROJECT}). Delete one before adding another.` },
      { status: 409 }
    )
  }

  // Byte-size the content (Prisma stores UTF-8; the schema's `size` field
  // should reflect actual byte length, not character count).
  const byteSize = Buffer.byteLength(parsed.data.content, 'utf8')

  const file = await db.projectFile.create({
    data: {
      projectId: project.id,
      filename: parsed.data.filename,
      content: parsed.data.content,
      mimeType: parsed.data.mimeType,
      size: byteSize,
    },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ file }, { status: 201 })
}
