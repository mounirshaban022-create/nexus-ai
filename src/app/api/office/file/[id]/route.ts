import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const FILES_DIR = path.join(process.cwd(), 'generated-images')

const MIME_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown; charset=utf-8',
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid file id.' }, { status: 400 })
    }

    // Find the file regardless of extension
    for (const ext of ['docx', 'xlsx', 'pptx', 'md']) {
      try {
        const filePath = path.join(FILES_DIR, `${id}.${ext}`)
        const buffer = await readFile(filePath)
        const download = req.nextUrl.searchParams.get('download') === '1'
        const title = req.nextUrl.searchParams.get('title') || 'nexus-document'
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': MIME_TYPES[ext],
            'Content-Length': buffer.length.toString(),
            'Content-Disposition': download
              ? `attachment; filename="${title.replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, 60) || 'document'}.${ext}"`
              : 'inline',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      } catch {
        // try next extension
      }
    }

    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}
