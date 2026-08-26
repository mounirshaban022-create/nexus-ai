import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

const IS_VERCEL = Boolean(process.env.VERCEL)
const IMAGES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-images')

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`file-read:${clientKey(_req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  try {
    const { id } = await context.params
    // Only allow safe ids (uuid hex chars), never paths
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid image id.' }, { status: 400 })
    }

    let buffer: Buffer | null = null

    // 1. Disk (local FS or a warm Vercel /tmp from the generating lambda).
    try {
      buffer = await readFile(path.join(IMAGES_DIR, `${id}.png`))
    } catch {
      /* fall through to the DB copy */
    }

    // 2. DB base64 — the durable copy that survives Vercel's ephemeral /tmp.
    if (!buffer) {
      const record = await db.generatedImage.findFirst({
        where: { url: `/api/image/file/${id}` },
        select: { data: true },
      })
      if (record?.data) {
        buffer = Buffer.from(record.data, 'base64')
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    }

    // Sniff the real image type from magic bytes (generator may return JPEG data)
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8
    const contentType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/png'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }
}
