import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const IMAGES_DIR = path.join(process.cwd(), 'generated-images')

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    // Only allow safe ids (uuid hex chars), never paths
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid image id.' }, { status: 400 })
    }

    const filePath = path.join(IMAGES_DIR, `${id}.png`)
    const buffer = await readFile(filePath)

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
