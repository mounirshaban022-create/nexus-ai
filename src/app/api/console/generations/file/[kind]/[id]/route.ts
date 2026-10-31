import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * /api/console/generations/file/[kind]/[id] — authenticated media bytes.
 * Serves the base64 payload stored in the DB (survives Vercel's ephemeral
 * /tmp) so the console can render real thumbnails / real video playback /
 * real document downloads. Falls back to the stored url when data is absent.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const { kind, id } = await params

    if (kind === 'images') {
      const row = await db.generatedImage.findUnique({ where: { id }, select: { data: true, url: true } })
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (row.data) {
        const buf = Buffer.from(row.data, 'base64')
        return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
      }
      if (row.url) return NextResponse.redirect(new URL(row.url, req.url))
      return NextResponse.json({ error: 'No bytes stored' }, { status: 404 })
    }

    if (kind === 'videos') {
      const row = await db.generatedVideo.findUnique({ where: { id }, select: { data: true, url: true } })
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (row.data) {
        const buf = Buffer.from(row.data, 'base64')
        return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600' } })
      }
      if (row.url) return NextResponse.redirect(new URL(row.url, req.url))
      return NextResponse.json({ error: 'Video bytes not stored' }, { status: 404 })
    }

    if (kind === 'documents') {
      const row = await db.generatedDocument.findUnique({ where: { id }, select: { data: true, downloadUrl: true, mimeType: true, filename: true } })
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (row.data) {
        const buf = Buffer.from(row.data, 'base64')
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': row.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${row.filename.replace(/[^\w.\- ]+/g, '_')}"`,
          },
        })
      }
      if (row.downloadUrl) return NextResponse.redirect(new URL(row.downloadUrl, req.url))
      return NextResponse.json({ error: 'Document bytes not stored' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
  } catch (error) {
    console.error('[api/console/generations/file] error:', error)
    return NextResponse.json({ error: 'File serve failed' }, { status: 500 })
  }
}
