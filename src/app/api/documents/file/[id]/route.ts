import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

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
    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`file-read:${clientKey(req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  try {
    const { id } = await context.params
    const format = req.nextUrl.searchParams.get('format') ?? 'docx'
    if (!/^[a-zA-Z0-9-]+$/.test(id) || !MIME[format]) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const download = req.nextUrl.searchParams.get('download') === '1'

    // 1. Disk (local FS or a warm Vercel /tmp from the generating lambda).
    let buffer: Buffer | null = null
    try {
      buffer = await readFile(path.join(UPLOAD_DIR, `${id}.${format}`))
    } catch {
      /* fall through to DB */
    }

    // 2. DB base64 — the durable copy that survives Vercel's ephemeral /tmp.
    // The documents PUT route stamps record id = file id, so a direct lookup
    // resolves it.
    if (!buffer) {
      try {
        const record = await db.generatedDocument.findUnique({
          where: { id },
          select: { data: true, mimeType: true },
        })
        if (record?.data) {
          buffer = Buffer.from(record.data, 'base64')
        }
      } catch {
        /* DB miss */
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': MIME[format],
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': download ? `attachment; filename="edited-document.${format}"` : 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}
