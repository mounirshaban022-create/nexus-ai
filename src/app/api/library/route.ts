import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

/**
 * NEXUS Library — unified, reverse-chronological feed of everything
 * the user has generated: images, videos, and documents.
 *
 * GET  /api/library            → { items: [{ id, type, name, preview, size, url, downloadUrl?, createdAt, status? }] }
 * DELETE /api/library          → body { id, type } → { ok: true }
 */

type ItemType = 'image' | 'video' | 'document'

interface UnifiedItem {
  id: string
  type: ItemType
  name: string
  preview: string | null
  size: string
  url: string | null
  downloadUrl?: string | null
  createdAt: string
  status?: string
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req)
    // Show items owned by the user OR unclaimed (userId = null).
    const where = { OR: [{ userId: user?.id ?? null }, { userId: null }] }

    const [images, videos, documents] = await Promise.all([
      db.generatedImage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.generatedVideo.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.generatedDocument.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    ])

    const items: UnifiedItem[] = []

    for (const img of images) {
      items.push({
        id: img.id,
        type: 'image',
        name: img.prompt.length > 60 ? img.prompt.slice(0, 60) + '…' : img.prompt,
        preview: img.url,
        size: img.size,
        url: img.url,
        downloadUrl: img.url,
        createdAt: img.createdAt.toISOString(),
      })
    }

    for (const vid of videos) {
      items.push({
        id: vid.id,
        type: 'video',
        name: vid.prompt,
        preview: null,
        size: '—',
        url: vid.url ?? null,
        downloadUrl: vid.url ?? null,
        createdAt: vid.createdAt.toISOString(),
        status: vid.status,
      })
    }

    for (const doc of documents) {
      items.push({
        id: doc.id,
        type: 'document',
        name: doc.filename,
        preview: doc.summary || null,
        size: formatBytes(doc.size),
        url: doc.downloadUrl,
        downloadUrl: doc.downloadUrl,
        createdAt: doc.createdAt.toISOString(),
      })
    }

    // Reverse-chronological (most recent first).
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      items,
      meta: {
        total: items.length,
        images: images.length,
        videos: videos.length,
        documents: documents.length,
        signedIn: !!user,
      },
    })
  } catch (error) {
    console.error('[api/library] GET error:', error)
    return NextResponse.json({ error: 'Failed to load library.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; type?: ItemType }
    const id = body?.id
    const type = body?.type
    if (!id || !type || !['image', 'video', 'document'].includes(type)) {
      return NextResponse.json({ error: 'Body must be { id, type }.' }, { status: 400 })
    }

    if (type === 'image') {
      await db.generatedImage.delete({ where: { id } }).catch(() => {})
    } else if (type === 'video') {
      await db.generatedVideo.delete({ where: { id } }).catch(() => {})
    } else {
      await db.generatedDocument.delete({ where: { id } }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/library] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete item.' }, { status: 500 })
  }
}
