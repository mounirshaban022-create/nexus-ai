/* ------------------------------------------------------------------ */
/* Agnes AI VIDEO CLIENT — server-side, plain fetch.                   */
/*                                                                    */
/* When AGNES_API_KEY + AGNES_BASE_URL are set, video generation is    */
/* delegated to Agnes (POST /videos/generations → poll                 */
/* GET /videos/generations/:id) instead of the local ffmpeg pipeline.  */
/*                                                                    */
/* The exact Agnes API contract is uncertain (the user only provided   */
/* a base URL + key). This client follows OpenAI-video-API            */
/* conventions and is intentionally defensive — any unexpected        */
/* response shape is surfaced as a clear error (with the raw body     */
/* logged) instead of crashing.                                       */
/*                                                                    */
/* Server-side only. Plain TS module — imported by API routes /       */
/* server actions. No 'use server' directive.                          */
/* ------------------------------------------------------------------ */

export interface AgnesCreateVideoOpts {
  prompt: string
  /** Number of scenes (defaults to 4 if the API doesn't accept this). */
  scenes?: number
  /** Visual style (cinematic / vibrant / minimal / documentary). */
  style?: string
}

export interface AgnesCreateVideoResponse {
  jobId: string
}

export type AgnesVideoStatus =
  | 'queued'
  | 'rendering'
  | 'complete'
  | 'failed'

export interface AgnesVideoStatusResponse {
  status: AgnesVideoStatus
  videoUrl?: string
  progress?: number
  error?: string
}

interface AgnesConfig {
  apiKey: string
  baseUrl: string
}

function readConfig(): AgnesConfig | null {
  const apiKey = process.env.AGNES_API_KEY?.trim()
  const baseUrl = process.env.AGNES_BASE_URL?.trim()
  if (!apiKey || !baseUrl) return null
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

/** True when AGNES_API_KEY + AGNES_BASE_URL are both set. */
export function agnesConfigured(): boolean {
  return Boolean(readConfig())
}

/** Normalize a status string from the upstream API to the canonical
 *  union we expose. Unknown values become 'rendering' (safe default). */
function normalizeStatus(raw: unknown): AgnesVideoStatus {
  if (typeof raw !== 'string') return 'rendering'
  const s = raw.toLowerCase()
  if (s === 'queued' || s === 'pending' || s === 'waiting' || s === 'created') return 'queued'
  if (s === 'rendering' || s === 'processing' || s === 'running' || s === 'in_progress' || s === 'in-progress') return 'rendering'
  if (s === 'complete' || s === 'completed' || s === 'done' || s === 'success' || s === 'succeeded' || s === 'ready') return 'complete'
  if (s === 'failed' || s === 'error' || s === 'errored') return 'failed'
  return 'rendering'
}

/** Pulls a job id out of whatever shape Agnes returned. */
function extractJobId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  // Try common keys in order of likelihood.
  const candidates: Array<unknown> = [
    obj.id,
    obj.job_id,
    obj.jobId,
    obj.request_id,
    obj.requestId,
    obj.task_id,
    obj.taskId,
    (obj.data as Record<string, unknown> | undefined)?.id,
    (obj.data as Record<string, unknown> | undefined)?.job_id,
    (obj.result as Record<string, unknown> | undefined)?.id,
    (obj.result as Record<string, unknown> | undefined)?.job_id,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
    if (typeof c === 'number') return String(c)
  }
  return ''
}

/** Pulls the video URL out of whatever shape Agnes returned. */
function extractVideoUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const obj = payload as Record<string, unknown>
  const candidates: Array<unknown> = [
    obj.video_url,
    obj.videoUrl,
    obj.url,
    obj.output_url,
    obj.outputUrl,
    obj.download_url,
    obj.downloadUrl,
    (obj.data as Record<string, unknown> | undefined)?.video_url,
    (obj.data as Record<string, unknown> | undefined)?.videoUrl,
    (obj.data as Record<string, unknown> | undefined)?.url,
    (obj.result as Record<string, unknown> | undefined)?.video_url,
    (obj.result as Record<string, unknown> | undefined)?.url,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c
  }
  return undefined
}

/** Pulls a numeric progress (0–100) out of the response, if present. */
function extractProgress(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const obj = payload as Record<string, unknown>
  const candidates: Array<unknown> = [
    obj.progress,
    obj.percent,
    obj.percentage,
    (obj.data as Record<string, unknown> | undefined)?.progress,
    (obj.result as Record<string, unknown> | undefined)?.progress,
  ]
  for (const c of candidates) {
    if (typeof c === 'number' && c >= 0 && c <= 100) return c
    if (typeof c === 'string') {
      const n = parseFloat(c)
      if (!Number.isNaN(n) && n >= 0 && n <= 100) return n
    }
  }
  return undefined
}

/** Pulls an error message out of the response, if present. */
function extractError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const obj = payload as Record<string, unknown>
  const candidates: Array<unknown> = [
    obj.error,
    obj.error_message,
    obj.errorMessage,
    obj.message,
    (obj.data as Record<string, unknown> | undefined)?.error,
    (obj.error as Record<string, unknown> | undefined)?.message,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return undefined
}

function buildHeaders(cfg: AgnesConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Submit a video generation job to Agnes. Returns `{ jobId }`.
 *
 * Defensive: surfaces a clear error if the response shape is unexpected.
 */
export async function agnesCreateVideo(
  opts: AgnesCreateVideoOpts
): Promise<AgnesCreateVideoResponse> {
  const cfg = readConfig()
  if (!cfg) throw new Error('Agnes not configured (AGNES_API_KEY / AGNES_BASE_URL missing)')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/videos/generations`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      signal: controller.signal,
      body: JSON.stringify({
        prompt: opts.prompt,
        // Most OpenAI-style video APIs accept either `n` (number of
        // outputs) or `scenes` (scene count). Send both to maximize the
        // chance the upstream accepts the field.
        scenes: opts.scenes,
        n: opts.scenes,
        style: opts.style,
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted') || msg.toLowerCase().includes('abort')) {
      throw new Error('Agnes create request timed out after 120s')
    }
    throw new Error(`Agnes network error: ${msg}`)
  }
  clearTimeout(timer)

  const bodyText = await res.text()

  if (!res.ok) {
    // Surface a clear error for auth/quota/rate-limit cases.
    let serverMsg = ''
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string } | string }
      if (typeof j?.error === 'string') serverMsg = j.error
      else if (j?.error?.message) serverMsg = j.error.message
    } catch {
      /* not JSON */
    }
    if (res.status === 401) {
      throw new Error(
        `Agnes create failed: invalid API key (401). Check AGNES_API_KEY.`
      )
    }
    if (res.status === 402) {
      throw new Error(
        `Agnes create failed: payment required (402). Check your Agnes credits.`
      )
    }
    if (res.status === 429) {
      throw new Error(
        `Agnes create failed: rate limited (429). Slow down and retry.`
      )
    }
    console.error('[agnes] create non-OK body:', bodyText.slice(0, 1000))
    throw new Error(
      `Agnes create failed (HTTP ${res.status}). ${serverMsg || bodyText.slice(0, 200) || 'Unknown error.'}`
    )
  }

  // Parse the response. Be defensive about shape.
  let json: unknown
  try {
    json = JSON.parse(bodyText)
  } catch {
    console.error('[agnes] create response was not JSON:', bodyText.slice(0, 1000))
    throw new Error(
      `Agnes create returned a non-JSON response (first 200 chars): ${bodyText.slice(0, 200)}`
    )
  }

  const jobId = extractJobId(json)
  if (!jobId) {
    console.error(
      '[agnes] create response had no recognizable job id:',
      JSON.stringify(json).slice(0, 1000)
    )
    throw new Error(
      `Agnes create response did not contain a job id. Raw: ${JSON.stringify(json).slice(0, 300)}`
    )
  }

  return { jobId }
}

/**
 * Poll a previously-submitted Agnes video job. Returns the canonical
 * status, the video URL (when complete), a progress percentage, and
 * any error message.
 *
 * Defensive: unknown response shapes return a 'failed' status with a
 * descriptive error so the upstream pipeline can surface it to the user
 * instead of hanging forever.
 */
export async function agnesGetVideoStatus(
  jobId: string
): Promise<AgnesVideoStatusResponse> {
  const cfg = readConfig()
  if (!cfg) throw new Error('Agnes not configured (AGNES_API_KEY / AGNES_BASE_URL missing)')

  if (!jobId || !/^[A-Za-z0-9_-]{1,200}$/.test(jobId)) {
    throw new Error(`Agnes status: invalid job id "${jobId}"`)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/videos/generations/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: buildHeaders(cfg),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted') || msg.toLowerCase().includes('abort')) {
      throw new Error('Agnes status request timed out after 60s')
    }
    throw new Error(`Agnes network error: ${msg}`)
  }
  clearTimeout(timer)

  const bodyText = await res.text()

  if (!res.ok) {
    let serverMsg = ''
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string } | string }
      if (typeof j?.error === 'string') serverMsg = j.error
      else if (j?.error?.message) serverMsg = j.error.message
    } catch {
      /* not JSON */
    }
    if (res.status === 404) {
      // Job no longer tracked upstream — treat as failed with a clear msg.
      return {
        status: 'failed',
        error: `Agnes job ${jobId} not found (404).`,
      }
    }
    if (res.status === 401) {
      return {
        status: 'failed',
        error: `Agnes status failed: invalid API key (401).`,
      }
    }
    if (res.status === 429) {
      // Rate limited — leave status as 'queued' so the caller backs off.
      return { status: 'queued', error: 'Agnes status rate limited (429).' }
    }
    console.error('[agnes] status non-OK body:', bodyText.slice(0, 1000))
    return {
      status: 'failed',
      error: `Agnes status failed (HTTP ${res.status}). ${serverMsg || bodyText.slice(0, 200) || 'Unknown error.'}`,
    }
  }

  let json: unknown
  try {
    json = JSON.parse(bodyText)
  } catch {
    console.error('[agnes] status response was not JSON:', bodyText.slice(0, 1000))
    return {
      status: 'failed',
      error: `Agnes status returned a non-JSON response (first 200 chars): ${bodyText.slice(0, 200)}`,
    }
  }

  // Some APIs wrap the actual job object under `data` or `result`.
  const root =
    (json as { data?: unknown; result?: unknown })?.data ??
    (json as { result?: unknown })?.result ??
    json

  const rawStatus =
    (root as { status?: unknown })?.status ??
    (root as { state?: unknown })?.state ??
    (json as { status?: unknown })?.status ??
    'rendering'

  const status = normalizeStatus(rawStatus)
  const videoUrl = extractVideoUrl(root) ?? extractVideoUrl(json)
  const progress = extractProgress(root) ?? extractProgress(json)
  const error = extractError(root) ?? extractError(json)

  return {
    status,
    videoUrl,
    progress,
    error,
  }
}
