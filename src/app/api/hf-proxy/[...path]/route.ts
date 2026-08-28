import { NextRequest, NextResponse } from 'next/server'
import { hfToken } from '@/lib/hf-ai'

/**
 * Same-origin proxy for Hugging Face model files.
 *
 * WHY: the on-device speech engines (browser Whisper worker, Kokoro TTS
 * voices) download weights directly from huggingface.co. In production that
 * fetch is frequently killed — HF answers anonymous/gated requests with 401
 * and the CDN responses lack CORS headers on some networks/ISPs — so every
 * client-side fallback engine silently died ("voice doesn't work at all",
 * "Kokoro offline voices unavailable: Failed to fetch").
 *
 * This route streams the file through our own origin (no CORS involved),
 * attaching the deployment's HF token when present, and caches immutably —
 * model weights never change for a given revision.
 *
 * Usage:  /api/hf-proxy/<repo>/resolve/<revision>/<file...>
 * e.g.    /api/hf-proxy/onnx-community/whisper-tiny/resolve/main/config.json
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_HOST = 'huggingface.co'
const MAX_BYTES = 400 * 1024 * 1024 // largest model bundle we proxy

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  if (!path || path.length < 4) {
    return NextResponse.json({ error: 'Invalid model path.' }, { status: 400 })
  }

  // <repo-owner>/<repo>/resolve/<revision>/<file...>
  const encoded = path.map((p) => encodeURIComponent(p).replace(/%2F/g, ''))
  const target = `https://${ALLOWED_HOST}/${encoded.join('/')}`
  if (!target.includes('/resolve/')) {
    return NextResponse.json({ error: 'Only /resolve/ file URLs are proxied.' }, { status: 400 })
  }

  const token = hfToken()
  const headers: Record<string, string> = { 'User-Agent': 'nexus-ai-model-proxy' }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status }
      )
    }

    const len = Number(upstream.headers.get('content-length') || '0')
    if (len > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large to proxy.' }, { status: 413 })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        ...(len ? { 'Content-Length': String(len) } : {}),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Model fetch failed.' }, { status: 502 })
  }
}
