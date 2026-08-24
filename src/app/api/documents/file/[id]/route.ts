import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const IS_VERCEL = Boolean(process.env.VERCEL)
const UPLOAD_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-documents') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-documents')

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const format = req.nextUrl.searchParams.get('format') ?? 'docx'
    if (!/^[a-zA-Z0-9-]+$/.test(id) || !MIME[format]) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const buffer = await readFile(path.join(UPLOAD_DIR, `${id}.${format}`))
    const download = req.nextUrl.searchParams.get('download') === '1'
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': MIME[format],
        'Content-Disposition': download ? `attachment; filename="edited-document.${format}"` : 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}
