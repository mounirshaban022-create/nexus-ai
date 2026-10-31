/**
 * GOOGLE VEO 3 — TRUE generative video (the "real AI video" tier).
 *
 * The default NEXUS video pipeline is a smart slideshow (FLUX scene stills +
 * Ken Burns + neural narration). Veo 3 generates REAL video with native
 * audio from one prompt — the Sora/Veo-class output famous apps serve.
 *
 * OPT-IN: enabled when USE_VEO=true AND GEMINI_API_KEY is set (Veo needs a
 * paid-tier Gemini API quota; free-tier keys fail the availability preflight
 * and the pipeline falls back to the slideshow automatically).
 *
 * API (documented: ai.google.dev/gemini-api/docs/video):
 *   POST /v1beta/models/veo-3.0-fast-generate-001:predictLongRunning
 *   GET  /v1beta/{operation.name}          → poll until done
 *   GET  {response uri}&key=…              → download MP4
 */

const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const VEO_MODELS = ['veo-3.0-fast-generate-001', 'veo-3.0-generate-001']

export function veoConfigured(): boolean {
  return (
    (process.env.GEMINI_API_KEY || '').trim().length > 0 &&
    (process.env.USE_VEO || '').trim().toLowerCase() === 'true'
  )
}

/** Cached availability preflight (1h) so video creation doesn't pay the
 *  probe cost on every request — and so a key WITHOUT Veo access falls
 *  back to the slideshow pipeline instantly. */
const globalForVeo = globalThis as unknown as { __nexusVeoAvailable?: { at: number; ok: boolean } }

export async function veoAvailable(): Promise<boolean> {
  const cached = globalForVeo.__nexusVeoAvailable
  if (cached && Date.now() - cached.at < 3_600_000) return cached.ok
  const key = (process.env.GEMINI_API_KEY || '').trim()
  if (!key) return false
  let ok = false
  try {
    const res = await fetch(`${VEO_BASE}/models/${VEO_MODELS[0]}?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    ok = res.ok
  } catch {
    ok = false
  }
  globalForVeo.__nexusVeoAvailable = { at: Date.now(), ok }
  return ok
}

interface VeoOperation {
  name?: string
  done?: boolean
  error?: { message?: string }
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { videos?: Array<{ uri?: string }> }
      // Some API versions use a different nesting — probe both.
      videos?: Array<{ uri?: string; gcsUri?: string }>
    }
  }
}

function extractVideoUri(op: VeoOperation): string | null {
  const genResp = op.response?.generateVideoResponse
  const uri =
    genResp?.generatedSamples?.videos?.[0]?.uri ??
    genResp?.videos?.[0]?.uri ??
    genResp?.videos?.[0]?.gcsUri
  return typeof uri === 'string' && uri.startsWith('http') ? uri : null
}

/**
 * Generate ONE Veo clip (8s, 720p, native audio) for a prompt.
 * Returns the MP4 buffer. Throws with a readable message on failure.
 */
export async function veoGenerateClip(
  prompt: string,
  opts: { pollTimeoutMs?: number; aspectRatio?: string; negativePrompt?: string } = {}
): Promise<Buffer> {
  const key = (process.env.GEMINI_API_KEY || '').trim()
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  const trimmed = prompt.trim().slice(0, 1800)
  if (!trimmed) throw new Error('Video prompt is empty')

  const pollTimeoutMs = opts.pollTimeoutMs ?? 240_000
  let lastErr: Error | null = null

  for (const model of VEO_MODELS) {
    // 1. Start the generation (long-running operation).
    let opName: string
    try {
      const res = await fetch(`${VEO_BASE}/models/${model}:predictLongRunning?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: trimmed }],
          parameters: {
            aspectRatio: opts.aspectRatio ?? '16:9',
            ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
          },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const body = (await res.json().catch(() => ({}))) as VeoOperation & { error?: { message?: string } }
      if (!res.ok || !body.name) {
        const msg = body.error?.message || `Veo ${model} responded ${res.status}`
        lastErr = new Error(msg)
        continue // try the fallback model
      }
      opName = body.name
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      continue
    }

    // 2. Poll the operation until done (Veo typically takes 1-3 min).
    const deadline = Date.now() + pollTimeoutMs
    let uri: string | null = null
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000))
      const poll = await fetch(`${VEO_BASE}/${opName}?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(30_000),
      })
      const op = (await poll.json().catch(() => ({}))) as VeoOperation
      if (op.done && op.error) throw new Error(`Veo failed: ${op.error.message ?? 'unknown error'}`)
      uri = extractVideoUri(op)
      if (op.done && uri) break
      if (op.done && !uri) throw new Error('Veo finished without a video payload')
    }
    if (!uri) throw new Error(`Veo timed out after ${Math.round(pollTimeoutMs / 1000)}s`)

    // 3. Download the MP4 (the URI requires the API key appended).
    const dl = await fetch(uri.includes('key=') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(120_000),
    })
    if (!dl.ok) throw new Error(`Veo video download failed (HTTP ${dl.status})`)
    const buf = Buffer.from(await dl.arrayBuffer())
    if (buf.length < 10_000) throw new Error('Veo returned an empty video')
    return buf
  }
  throw lastErr ?? new Error('Veo generation failed')
}
