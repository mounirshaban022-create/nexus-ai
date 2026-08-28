import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * STIRLING-PDF ENGINE ROUTE — proxies NEXUS Studio's PDF operations to a
 * self-hosted Stirling-PDF server (github.com/Stirling-Tools/Stirling-PDF,
 * ~40k stars). Stirling is the open-source PDF powerhouse that handles
 * real PDF EDITING: merge, split, rotate, remove/reorder pages, watermark,
 * convert to HTML/images, and more — operations no JS library can do well.
 *
 * Self-healing: if the Stirling server is down, this route restarts it
 * (watchdog.sh also keeps it alive) before failing.
 *
 * Verified-live operations (2026-08, Stirling v2.14.3):
 *   merge        POST /api/v1/general/merge-pdfs      (files[])
 *   split        POST /api/v1/general/split-pages     (file + pages) → ZIP
 *   rotate       POST /api/v1/general/rotate-pdf      (file + angle)
 *   removePages  POST /api/v1/general/remove-pages    (file + pageNumbers)
 *   rearrange    POST /api/v1/general/rearrange-pages (file + newPageOrder)
 *   singlePage   POST /api/v1/general/pdf-to-single-page
 *   toHtml       POST /api/v1/convert/pdf/html
 *   toImages     POST /api/v1/convert/pdf/img         (imageFormat+dpi) → ZIP
 *   watermark    POST /api/v1/security/add-watermark  (text+size+opacity+rotation)
 *   info         POST /api/v1/analysis/basic-info     → JSON
 */

export const maxDuration = 120

const STIRLING_URL = process.env.STIRLING_URL || 'http://localhost:8080'
const STIRLING_HOME = '/tmp/my-project/stirling'

const requestSchema = z.object({
  operation: z.enum([
    'info', 'merge', 'split', 'rotate', 'removePages', 'rearrange',
    'singlePage', 'toHtml', 'toImages', 'watermark',
  ]),
  /** Primary PDF file as a base64 data URL. */
  file: z.string().min(10).max(60_000_000),
  /** Second PDF for merge. */
  file2: z.string().max(60_000_000).optional(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

/** Decode a data URL to bytes. */
function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Buffer.from(b64, 'base64')
}

async function stirlingAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${STIRLING_URL}/`, { signal: AbortSignal.timeout(4000) })
    return res.status < 500
  } catch {
    return false
  }
}

/** Is a JVM for the Stirling JAR already running (avoids double-spawn → OOM)? */
async function stirlingProcessRunning(): Promise<boolean> {
  const { readdir, readFile } = await import('fs/promises')
  try {
    const pids = await readdir('/proc')
    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue
      try {
        const cmdline = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' ')
        if (cmdline.includes('Stirling-PDF-server.jar')) return true
      } catch {
        /* process gone — ignore */
      }
    }
  } catch {
    /* /proc unreadable — assume not running */
  }
  return false
}

/** Starts Stirling if it's down (self-heal). Returns once it responds. */
async function ensureStirling(): Promise<void> {
  if (await stirlingAlive()) return
  const { existsSync } = await import('fs')
  const jar = path.join(STIRLING_HOME, 'Stirling-PDF-server.jar')
  const java = path.join(STIRLING_HOME, 'jdk-25.0.4.1+1-jre', 'bin', 'java')
  if (!existsSync(jar) || !existsSync(java)) {
    throw new Error('The PDF engine (Stirling-PDF) is not installed on this machine.')
  }
  // Another JVM may already be booting it (watchdog or a concurrent request)
  // — never double-spawn, that OOMs the box.
  if (await stirlingProcessRunning()) {
    console.log('[stirling] already booting — waiting for it...')
  } else {
    console.log('[stirling] server down — restarting...')
    const child = spawn(
      java,
      ['-Xmx650m', '-Xms128m', '-jar', jar, '--server.port=8080', '--server.address=127.0.0.1'],
      { cwd: STIRLING_HOME, detached: true, stdio: 'ignore' }
    )
    child.unref()
  }
  // Wait up to 75s for Spring Boot to come up
  for (let i = 0; i < 37; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (await stirlingAlive()) {
      console.log('[stirling] responding')
      return
    }
  }
  throw new Error('The PDF engine (Stirling-PDF) failed to start. Please try again.')
}

/** Maps an operation to { endpoint, formData } — builds the multipart call. */
function buildStirlingRequest(op: string, file: Buffer, file2: Buffer | null, params: Record<string, string | number>): { endpoint: string; form: FormData } {
  const form = new FormData()
  const push = (name: string, data: Buffer, filename: string, type = 'application/pdf') => {
    form.append(name, new Blob([new Uint8Array(data)], { type }), filename)
  }

  switch (op) {
    case 'info':
      push('fileInput', file, 'input.pdf')
      return { endpoint: '/api/v1/analysis/basic-info', form }
    case 'merge': {
      push('fileInput', file, 'a.pdf')
      if (file2) push('fileInput', file2!, 'b.pdf')
      return { endpoint: '/api/v1/general/merge-pdfs', form }
    }
    case 'split': {
      push('fileInput', file, 'input.pdf')
      form.append('pages', String(params.pages ?? 'all'))
      return { endpoint: '/api/v1/general/split-pages', form }
    }
    case 'rotate': {
      push('fileInput', file, 'input.pdf')
      form.append('angle', String(params.angle ?? 90))
      return { endpoint: '/api/v1/general/rotate-pdf', form }
    }
    case 'removePages': {
      push('fileInput', file, 'input.pdf')
      form.append('pageNumbers', String(params.pageNumbers ?? ''))
      return { endpoint: '/api/v1/general/remove-pages', form }
    }
    case 'rearrange': {
      push('fileInput', file, 'input.pdf')
      form.append('newPageOrder', String(params.newPageOrder ?? ''))
      return { endpoint: '/api/v1/general/rearrange-pages', form }
    }
    case 'singlePage': {
      push('fileInput', file, 'input.pdf')
      return { endpoint: '/api/v1/general/pdf-to-single-page', form }
    }
    case 'toHtml': {
      push('fileInput', file, 'input.pdf')
      return { endpoint: '/api/v1/convert/pdf/html', form }
    }
    case 'toImages': {
      push('fileInput', file, 'input.pdf')
      form.append('imageFormat', String(params.imageFormat ?? 'png'))
      form.append('dpi', String(params.dpi ?? 150))
      form.append('singleImage', String(params.singleImage ?? 'false'))
      return { endpoint: '/api/v1/convert/pdf/img', form }
    }
    case 'watermark': {
      push('fileInput', file, 'input.pdf')
      form.append('watermarkText', String(params.watermarkText ?? 'CONFIDENTIAL'))
      form.append('fontSize', String(params.fontSize ?? 30))
      form.append('opacity', String(params.opacity ?? 0.3))
      form.append('rotation', String(params.rotation ?? 45))
      form.append('width', String(params.width ?? 2))
      form.append('height', String(params.height ?? 2))
      return { endpoint: '/api/v1/security/add-watermark', form }
    }
    default:
      throw new Error(`Unknown operation: ${op}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`studio-pdf:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many PDF operations. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid PDF request.' }, { status: 400 })
    }
    const { operation, file, file2, params = {} } = parsed.data

    // On Vercel there's no local JVM — but an explicitly configured remote
    // Stirling instance (STIRLING_URL) works fine from serverless. Only
    // fail when we're on Vercel WITHOUT a remote engine configured.
    if (process.env.VERCEL && !process.env.STIRLING_URL) {
      throw new Error(
        'PDF tools require the Stirling-PDF engine, which needs a JVM server. ' +
        'Deploy Stirling-PDF separately (Railway/Render free tier) and set STIRLING_URL in your environment variables to enable PDF tools.'
      )
    }
    // Local (or Vercel + STIRLING_URL): make sure the engine is up. With a
    // remote URL this is just a health probe; the local self-heal spawn is
    // skipped automatically when the JAR isn't installed.
    await ensureStirling()

    const fileBuf = decodeDataUrl(file)
    if (fileBuf.length < 100) throw new Error('That file looks empty or invalid.')
    const file2Buf = file2 ? decodeDataUrl(file2) : null

    const { endpoint, form } = buildStirlingRequest(operation, fileBuf, file2Buf, params)
    const res = await fetch(`${STIRLING_URL}${endpoint}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(100_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      let message = `The PDF engine responded ${res.status}.`
      try {
        const j = JSON.parse(errText)
        message = j.error || j.detail || message
      } catch {
        if (errText) message = errText.slice(0, 200)
      }
      throw new Error(message)
    }

    // JSON responses (info) pass straight through
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = await res.json()
      return NextResponse.json({ info: data })
    }

    // Binary responses (PDF / ZIP / image) → save + serve
    const buffer = Buffer.from(await res.arrayBuffer())
    const isZip = contentType.includes('zip') || buffer.subarray(0, 2).toString() === 'PK'
    const isHtml = contentType.includes('html')
    const ext = isZip ? 'zip' : isHtml ? 'html' : 'pdf'
    const dir = path.join(process.cwd(), 'generated-images')
    await mkdir(dir, { recursive: true })
    const id = randomUUID()
    await writeFile(path.join(dir, `${id}.${ext}`), buffer)

    return NextResponse.json({
      file: {
        url: `/api/office/file/${id}`,
        format: ext,
        filename: `${operation}-${id.slice(0, 8)}.${ext}`,
        size: buffer.byteLength,
        title: `PDF ${operation} result`,
      },
    })
  } catch (error) {
    console.error('[api/studio/pdf] POST error:', error)
    return NextResponse.json({ error: 'PDF operation failed. Please try again.' }, { status: 500 })
  }
}
