import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

const IS_VERCEL = Boolean(process.env.VERCEL)
const FILES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-images')

const MIME_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown; charset=utf-8',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  zip: 'application/zip',
  png: 'image/png',
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
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid file id.' }, { status: 400 })
    }

    const download = req.nextUrl.searchParams.get('download') === '1'
    const title = req.nextUrl.searchParams.get('title') || 'nexus-document'

    // 1. Disk (local FS or a warm Vercel /tmp from the generating lambda).
    for (const ext of ['docx', 'xlsx', 'pptx', 'md', 'pdf', 'html', 'txt', 'zip', 'png']) {
      try {
        const filePath = path.join(FILES_DIR, `${id}.${ext}`)
        const buffer = await readFile(filePath)
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

    // 2. DB base64 — the durable copy that survives Vercel's ephemeral /tmp
    // across serverless invocations. The office/create route stamps the
    // record id = file id, so a direct lookup resolves it.
    try {
      const record = await db.generatedDocument.findUnique({
        where: { id },
        select: { data: true, mimeType: true, format: true, filename: true },
      })
      if (record?.data) {
        const buffer = Buffer.from(record.data, 'base64')
        const ext = record.format || 'docx'
        const mime = record.mimeType || MIME_TYPES[ext] || 'application/octet-stream'
        const fname = record.filename || `${title}.${ext}`
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': mime,
            'Content-Length': buffer.length.toString(),
            'Content-Disposition': download
              ? `attachment; filename="${fname.replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, 80)}"`
              : 'inline',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    } catch {
      /* DB miss — fall through to 404 */
    }

    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}
