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
 * Messages IN : { type: 'transcribe', audio: Float32Array@16kHz, lang: 'en' }
 * Messages OUT: { type: 'progress', percent, note }
 *               { type: 'ready' }
 *               { type: 'result', text }
 *               { type: 'error', message }
 */

let pipePromise = null
let pipe = null

async function getPipeline() {
  if (pipe) return pipe
  if (!pipePromise) {
    pipePromise = (async () => {
      self.postMessage({ type: 'progress', percent: 0, note: 'Loading speech engine…' })
      const { pipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5'
      )
      env.allowLocalModels = false

      const progress_callback = (p) => {
        if (p && p.status === 'progress' && p.total) {
          const percent = Math.round((p.loaded / p.total) * 100)
          self.postMessage({ type: 'progress', percent, note: 'Downloading on-device ear (one-time)…' })
        }
      }

      // Try WebGPU first (near-instant on supporting GPUs), fall back to WASM.
      const attempts = [
        { device: 'webgpu', dtype: 'q8' },
        { device: 'wasm', dtype: 'q8' },
      ]
      let lastErr = null
      for (const cfg of attempts) {
        if (cfg.device === 'webgpu' && !self.navigator.gpu) continue
        try {
          pipe = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
            ...cfg,
            progress_callback,
          })
          self.postMessage({ type: 'ready', device: cfg.device })
          return pipe
        } catch (e) {
          lastErr = e
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
  const { type, audio, lang } = e.data || {}
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
    self.postMessage({ type: 'result', text: (out && out.text ? String(out.text) : '').trim() })
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : 'Speech engine failed.' })
  }
}
