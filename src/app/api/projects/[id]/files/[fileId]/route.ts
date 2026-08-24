import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Phase 1 P3 — delete a single project file.
 *
 * DELETE /api/projects/[id]/files/[fileId]
 *
 * Ownership is enforced transitively: we findFirst the file by its id AND
 * its project's id AND its project's userId === session.userId. A file
 * owned by another user (or attached to another user's project) returns
 * null → 404. Same defence-in-depth pattern as /api/memory/[id].
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to view project files.' }, { status: 401 })
  }
  const limit = rateLimit(`project:file:get:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id, fileId } = await params
  // Ownership check via project scoping.
  const file = await db.projectFile.findFirst({
    where: {
      id: fileId,
      projectId: id,
      project: { userId: session.userId },
    },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!file) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }

  return NextResponse.json({ file })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Sign in to delete project files.' }, { status: 401 })
  }
  const limit = rateLimit(`project:file:delete:${session.userId}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Retry shortly.' }, { status: 429 })
  }

  const { id, fileId } = await params
  // Ownership check: file id + project id + project.userId scoping.
  const existing = await db.projectFile.findFirst({
    where: {
      id: fileId,
      projectId: id,
      project: { userId: session.userId },
    },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }

  await db.projectFile.delete({ where: { id: existing.id } })

  return NextResponse.json({ ok: true })
}
