/* NEXUS on-device speech recognition worker.
 *
 * Loads OpenAI Whisper (open-source, via transformers.js + ONNX) fully in
 * the browser — no API keys, no servers, works in every modern browser
 * (Chrome, Firefox, Safari, Edge) INCLUDING cross-origin iframes where
 * Chrome's Web Speech API is broken.
 *
 * The transformers.js library is imported from the jsDelivr CDN at runtime,
 * so this worker adds ZERO weight to the app bundle. The model (~45 MB,
 * quantized) is downloaded once and cached by the browser's Cache API.
 *
 * Messages IN : { type: 'transcribe', audio: Float32Array@16kHz, lang: 'en', seq }
 * Messages OUT: { type: 'progress', percent, note }
 *               { type: 'ready' }
 *               { type: 'result', text, seq }
 *               { type: 'error', message, seq }
 *
 * The seq echo lets the client route responses when a warm-up and a real
 * transcription overlap — the old single-slot protocol delivered the
 * warm-up's empty result to the waiting caller (race bug).
 */

let pipePromise = null
let pipe = null

/* Route every Hugging Face model download through our own origin.
 * Direct huggingface.co fetches die in production (401 on anonymous/gated
 * files + missing CORS headers on some networks), which silently killed
 * the on-device fallback. /api/hf-proxy streams the same files same-origin
 * (with the deployment's HF token when present). */
const HF_PROXY_PREFIX = '/api/hf-proxy/'
if (typeof self.fetch === 'function') {
  const rawFetch = self.fetch.bind(self)
  self.fetch = (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input && input.url
      if (url && url.startsWith('https://huggingface.co/')) {
        input = HF_PROXY_PREFIX + url.slice('https://huggingface.co/'.length)
      }
    } catch {
      /* fall through to the original fetch */
    }
    return rawFetch(input, init)
  }
}

async function getPipeline() {
  if (pipe) return pipe
  if (!pipePromise) {
    pipePromise = (async () => {
      self.postMessage({ type: 'progress', percent: 0, note: 'Loading speech engine…' })
      const { pipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5'
      )
      env.allowLocalModels = false

      // Cross-origin iframes (embedded previews) have no SharedArrayBuffer
      // (crossOriginIsolated=false) — ORT's multi-threaded wasm then fails
      // to spawn its workers and the backend never initializes. Forcing a
      // single thread there is the documented workaround; single-thread
      // whisper-tiny stays real-time on any real CPU.
      try {
        env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? 2 : 1
      } catch {
        /* older transformers builds — auto is fine */
      }

      const progress_callback = (p) => {
        if (p && p.status === 'progress' && p.total) {
          const percent = Math.round((p.loaded / p.total) * 100)
          self.postMessage({ type: 'progress', percent, note: 'Downloading on-device ear (one-time)…' })
        }
      }

      // Try WebGPU first (near-instant on supporting GPUs). The WASM (CPU)
      // fallback uses whisper-TINY — base saturates weak/low-core devices
      // for tens of seconds during ONNX compile, while tiny stays real-time
      // even on 2-core machines (accuracy trade is worth it vs. hanging).
      const attempts = [
        { model: 'onnx-community/whisper-base', device: 'webgpu', dtype: 'q8' },
        { model: 'onnx-community/whisper-tiny', device: 'wasm', dtype: 'q8' },
      ]
      let lastErr = null
      for (const cfg of attempts) {
        if (cfg.device === 'webgpu' && !self.navigator.gpu) continue
        try {
          pipe = await pipeline('automatic-speech-recognition', cfg.model, {
            ...cfg,
            progress_callback,
          })
          self.postMessage({ type: 'ready', device: cfg.device, model: cfg.model })
          return pipe
        } catch (e) {
          lastErr = e
          pipe = null
        }
      }
      throw lastErr || new Error('Could not initialize the speech engine.')
    })().catch((e) => {
      pipePromise = null
      throw e
    })
  }
  return pipePromise
}

self.onmessage = async (e) => {
  const { type, audio, lang, seq } = e.data || {}
  if (type !== 'transcribe' || !audio) return
  try {
    const recognizer = await getPipeline()
    const opts = { task: 'transcribe' }
    // Whisper auto-detects when no language is given; pass a known code
    // (en, ar, fr …) for better accuracy + speed.
    const short = String(lang || '').split('-')[0].toLowerCase()
    const supported = [
      'en','ar','fr','de','es','it','pt','ru','hi','zh','ja','ko','tr','nl','pl',
      'sv','uk','vi','id','cs','ro','el','he','fa','ur','th','ms','fi','da','no','hu',
    ]
    if (supported.includes(short)) opts.language = short
    const out = await recognizer(audio, opts)
    self.postMessage({ type: 'result', text: (out && out.text ? String(out.text) : '').trim(), seq })
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : 'Speech engine failed.', seq })
  }
}
