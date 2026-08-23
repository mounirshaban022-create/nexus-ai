import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const VIDEO_DIR = path.join(process.cwd(), 'generated-videos')

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid video id.' }, { status: 400 })
    }
    const filePath = path.join(VIDEO_DIR, `${id}.mp4`)
    const buffer = await readFile(filePath)
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
