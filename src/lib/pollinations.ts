/* ------------------------------------------------------------------ */
/* POLLINATIONS FLUX — free universal image engine                     */
/*                                                                     */
/* Shared by the app's /api/image route and the console studio as the  */
/* always-available fallback in the premium cascade. Extracted verbatim */
/* from the original route so both call sites use identical logic.     */
/*                                                                     */
/* RESILIENCE (fixes the video-pipeline 429 outage): Pollinations      */
/* rate-limits anonymous callers to roughly one request every few      */
/* seconds. Callers that fire bursts (e.g. all video scenes at once)   */
/* got HTTP 429 and the whole job failed. pollinationsImage() now      */
/* retries 429/5xx responses with a growing backoff internally, so     */
/* every consumer is rate-limit-proof by default.                      */
/* ------------------------------------------------------------------ */

/** Tunables — 4 tries ≈ worst case ~50s of waiting, well inside the
 *  90s per-image timeout budget of the video pipeline. */
const RETRY_DELAYS_MS = [3_000, 8_000, 16_000, 26_000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function pollinationsOnce(prompt: string, w: number, h: number, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Quality-boosted prompt (cinematic quality terms improve Pollinations output significantly)
    const qualityPrompt = `${prompt}, high quality, detailed, professional, sharp focus, beautiful lighting`
    const seed = Math.floor(Math.random() * 1_000_000)
    const res = await fetch(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(qualityPrompt)}?width=${w}&height=${h}&nologo=true&enhance=true&model=flux&seed=${seed}`,
      { signal: controller.signal }
    )
    if (!res.ok) throw new Error(`Free image service responded ${res.status}`)
    const arr = new Uint8Array(await res.arrayBuffer())
    const buffer = Buffer.from(arr)
    if (buffer.length < 1000) throw new Error('Free image service returned no data')
    return buffer
  } finally {
    clearTimeout(timer)
  }
}

/** Generate one image with automatic 429/5xx retry + backoff.
 *  `onRetry` lets live pipelines surface progress ("rate limited — retrying"). */
export async function pollinationsImage(
  prompt: string,
  size: string,
  opts?: { timeoutMs?: number; onRetry?: (attempt: number, delayMs: number, reason: string) => void }
): Promise<Buffer> {
  const [w, h] = size.split('x').map(Number)
  const timeoutMs = opts?.timeoutMs ?? 90_000

  let lastErr: Error = new Error('Free image service did not respond')
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]
      opts?.onRetry?.(attempt, delay, lastErr.message)
      await sleep(delay)
    }
    try {
      return await pollinationsOnce(prompt, w, h, timeoutMs)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      const msg = lastErr.message
      const rateLimited = msg.includes('429') || msg.includes('502') || msg.includes('503')
      const abort = msg.includes('aborted') || msg.includes('timeout')
      // Retry rate limits + transient failures; give up on the last attempt.
      if (!rateLimited && !abort && attempt < RETRY_DELAYS_MS.length) continue
      if (!rateLimited && !abort) throw lastErr
    }
  }
  throw lastErr
}

/** Fires scene requests SEQUENTIALLY (one at a time) with a pause between
 *  scenes — the anonymous tier simply does not allow bursts. Returns each
 *  image through `onScene` as soon as it lands, so the pipeline can start
 *  downstream work early and report live progress. */
export async function pollinationsSequence(
  prompts: string[],
  size: string,
  opts?: { timeoutMs?: number; gapMs?: number; onScene?: (index: number, buffer: Buffer) => void | Promise<void>; onRetry?: (index: number, attempt: number, delayMs: number, reason: string) => void }
): Promise<Buffer[]> {
  const out: Buffer[] = []
  const gap = opts?.gapMs ?? 2_500
  for (let i = 0; i < prompts.length; i++) {
    if (i > 0) await sleep(gap)
    const buf = await pollinationsImage(prompts[i], size, {
      timeoutMs: opts?.timeoutMs,
      onRetry: opts?.onRetry ? (a, d, r) => opts.onRetry?.(i, a, d, r) : undefined,
    })
    out.push(buf)
    if (opts?.onScene) await opts.onScene(i, buf)
  }
  return out
}
