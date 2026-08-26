import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

const IS_VERCEL = Boolean(process.env.VERCEL)
const VIDEO_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-videos') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-videos')

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`file-read:${clientKey(req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  try {
    const { id } = await context.params
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid video id.' }, { status: 400 })
    }

    let buffer: Buffer | null = null

    // 1. Disk (local FS or a warm Vercel /tmp from the generating lambda).
    try {
      buffer = await readFile(path.join(VIDEO_DIR, `${id}.mp4`))
    } catch {
      /* fall through to the DB copy */
    }

    // 2. DB base64 — the durable copy that survives Vercel's ephemeral /tmp.
    if (!buffer) {
      const record = await db.generatedVideo.findFirst({
        where: { jobId: id, status: 'done' },
        select: { data: true },
      })
      if (record?.data) {
        buffer = Buffer.from(record.data, 'base64')
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'Video not found.' }, { status: 404 })
    }

    const download = req.nextUrl.searchParams.get('download') === '1'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': download
          ? `attachment; filename="nexus-video.mp4"`
          : 'inline',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Video not found.' }, { status: 404 })
  }
}
