import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/generations — the platform-wide media + documents vault.
 * ?type=images|videos|documents &userId= &limit= &offset=
 * Image/video bytes live in the `data` column (base64) and are served
 * through /api/console/generations/file/[kind]/[id] so the console shows
 * REAL thumbnails, not metadata stubs.
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const url = new URL(req.url)
    const type = url.searchParams.get('type') ?? 'images'
    const userId = url.searchParams.get('userId') ?? undefined
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 36), 100)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

    if (type === 'images') {
      const where = userId ? { userId } : {}
      const [rows, total] = await Promise.all([
        db.generatedImage.findMany({
          where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
          select: { id: true, prompt: true, size: true, provider: true, userId: true, createdAt: true, url: true,
            user: { select: { email: true, name: true } } },
        }),
        db.generatedImage.count({ where }),
      ])
      return NextResponse.json({ type, items: rows.map(r => ({ ...r, fileUrl: `/api/console/generations/file/images/${r.id}` })), total })
    }

    if (type === 'videos') {
      const where = userId ? { userId } : {}
      const [rows, total] = await Promise.all([
        db.generatedVideo.findMany({
          where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
          select: { id: true, prompt: true, scenes: true, voice: true, style: true, status: true, error: true, url: true, userId: true, createdAt: true,
            user: { select: { email: true, name: true } } },
        }),
        db.generatedVideo.count({ where }),
      ])
      return NextResponse.json({ type, items: rows.map(r => ({ ...r, fileUrl: r.url ?? `/api/console/generations/file/videos/${r.id}` })), total })
    }

    // documents
    const where = userId ? { userId } : {}
    const [rows, total] = await Promise.all([
      db.generatedDocument.findMany({
        where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
        select: { id: true, filename: true, format: true, title: true, summary: true, size: true, mimeType: true, userId: true, createdAt: true,
          user: { select: { email: true, name: true } } },
      }),
      db.generatedDocument.count({ where }),
    ])
    return NextResponse.json({ type: 'documents', items: rows.map(r => ({ ...r, fileUrl: `/api/console/generations/file/documents/${r.id}` })), total })
  } catch (error) {
    console.error('[api/console/generations] error:', error)
    return NextResponse.json({ error: 'Failed to load generations' }, { status: 500 })
  }
}
