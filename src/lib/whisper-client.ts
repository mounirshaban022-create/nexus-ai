/**
 * On-device speech recognition client (browser Whisper via transformers.js).
 *
 * Why: the Web Speech API only works in Chrome/Edge AND is broken inside
 * cross-origin iframes (the sandbox preview panel) — while server ASR needs
 * a reachable backend. Open-source Whisper running locally in a Web Worker
 * hears the user in EVERY browser, offline, keyless, free.
 *
 * Usage:
 *   const text = await onDeviceTranscribe(audioBlob, 'en-US', (pct) => …)
 *
 * Protocol: every transcribe request carries a unique `seq`; the worker
 * echoes it back on result/error. Responses are routed through a seq map,
 * so a background warm-up can never clobber an in-flight transcription
 * (the old single-slot resolver race delivered the warm-up's empty result
 * to the waiting caller).
 */

export type WhisperProgress = (percent: number, note: string) => void

interface PendingJob {
  resolve: (t: string) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let workerBroken = false
const jobs = new Map<number, PendingJob>()
let progressCb: WhisperProgress | null = null
let seq = 0

function settle(jobSeq: number, fn: (job: PendingJob) => void) {
  const job = jobs.get(jobSeq)
  if (!job) return
  jobs.delete(jobSeq)
  clearTimeout(job.timer)
  fn(job)
}

function ensureWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  try {
    worker = new Worker('/whisper-worker.js', { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data || {}
      if (d.type === 'progress' && progressCb) {
        progressCb(Math.max(0, Math.min(100, Number(d.percent) || 0)), String(d.note || ''))
      } else if (d.type === 'ready') {
        if (progressCb) progressCb(100, 'ready')
      } else if (d.type === 'result') {
        settle(Number(d.seq), (job) => job.resolve(String(d.text || '')))
      } else if (d.type === 'error') {
        settle(Number(d.seq), (job) => job.reject(new Error(String(d.message || 'Speech engine failed.'))))
      }
    }
    worker.onerror = () => {
      // CDN blocked / worker crashed — mark broken so callers skip to the
      // server ASR path immediately from now on.
      workerBroken = true
      for (const [, job] of jobs) {
        clearTimeout(job.timer)
        job.reject(new Error('On-device speech engine unavailable.'))
      }
      jobs.clear()
      try {
        worker?.terminate()
      } catch {
        /* noop */
      }
      worker = null
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** True once the worker has proven unloadable (CDN blocked, old browser). */
export function onDeviceAsrBroken(): boolean {
  return workerBroken
}

/**
 * Kick off the model download immediately (call when the voice UI opens so
 * the ~45 MB one-time load overlaps the user's first sentence). Safe to call
 * at any time: it is a seq-tagged job whose (empty) result is discarded, so
 * it can never interfere with a live transcription.
 */
export function warmUpOnDeviceAsr(onProgress?: WhisperProgress): void {
  const w = ensureWorker()
  if (!w) return
  if (onProgress) progressCb = onProgress
  const warmSeq = ++seq
  jobs.set(warmSeq, {
    resolve: () => {},
    reject: () => {},
    timer: setTimeout(() => jobs.delete(warmSeq), 120_000),
  })
  w.postMessage({ type: 'transcribe', audio: new Float32Array(0), lang: 'en', seq: warmSeq })
}

/** Decode any recorded blob (webm/ogg/mp4/wav) → mono Float32Array @16kHz. */
async function blobToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const AC: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const decodeCtx = new AC()
  try {
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
    // Resample to 16 kHz mono with an OfflineAudioContext (exact, deterministic).
    const targetLen = Math.max(1, Math.ceil(decoded.duration * 16000))
    const OAC: typeof OfflineAudioContext =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
    const offline = new OAC(1, targetLen, 16000)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    void decodeCtx.close().catch(() => {})
  }
}

/**
 * Transcribe a recorded audio blob on-device.
 * Resolves with '' when nothing intelligible was heard.
 * Rejects when the engine can't run (caller falls back to server ASR).
 */
export async function onDeviceTranscribe(
  blob: Blob,
  lang: string,
  onProgress?: WhisperProgress,
  timeoutMs = 60_000
): Promise<string> {
  const w = ensureWorker()
  if (!w) throw new Error('On-device speech engine unavailable.')

  const audio = await blobToMono16k(blob)
  if (audio.length < 1600) return '' // < 0.1s of audio — nothing said

  return new Promise<string>((resolve, reject) => {
    const jobSeq = ++seq
    if (onProgress) progressCb = onProgress
    jobs.set(jobSeq, {
      resolve,
      reject,
      timer: setTimeout(() => {
        jobs.delete(jobSeq)
        reject(new Error('On-device recognition timed out.'))
      }, timeoutMs),
    })
    w.postMessage({ type: 'transcribe', audio, lang, seq: jobSeq })
  })
}
