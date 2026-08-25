'use client'

/**
 * Kokoro TTS — 82M parameter neural voice, 100% in-browser (WASM/ONNX).
 * Premium quality, no API key, works offline once the model is cached.
 * https://github.com/hexgrad/kokoro
 *
 * FAIL-SOFT by design: every entry point times out and rejects cleanly so
 * the caller can fall back to the server TTS chain. A failed load is never
 * cached — the next attempt can retry fresh.
 */

let ttsInstance: any = null
let loadingPromise: Promise<any> | null = null

/** Loads the Kokoro model (downloads ~90MB on first use). Rejects after `timeoutMs`. */
export async function loadKokoro(timeoutMs = 60_000): Promise<any> {
  if (ttsInstance) return ttsInstance
  if (loadingPromise) return loadingPromise

  const attempt = (async () => {
    const { KokoroTTS } = await import('kokoro-js')
    const instance = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      { dtype: 'q8', device: 'wasm' }
    )
    ttsInstance = instance
    return instance
  })()

  loadingPromise = Promise.race([
    attempt,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Kokoro load timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]).catch((err) => {
    // Never cache a rejection — allow a clean retry later.
    loadingPromise = null
    throw err
  })

  return loadingPromise
}

export interface KokoroVoice {
  id: string
  label: string
}

/** Premium Kokoro voices (female + male, multiple accents). English-only model. */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', label: 'Heart' },
  { id: 'af_bella', label: 'Bella' },
  { id: 'af_nicole', label: 'Nicole' },
  { id: 'am_adam', label: 'Adam' },
  { id: 'am_michael', label: 'Michael' },
  { id: 'bf_emma', label: 'Emma' },
  { id: 'bm_george', label: 'George' },
]

/** Prefix used by voice ids in the shared picker (e.g. "kokoro:af_heart"). */
export const KOKORO_PREFIX = 'kokoro:'

/** True when the id is a Kokoro picker voice ("kokoro:<voice>"). */
export function isKokoroVoiceId(id: string): boolean {
  return id.startsWith(KOKORO_PREFIX)
}

/** "kokoro:af_heart" → "af_heart" (falls back to Heart when malformed). */
export function kokoroVoiceIdFrom(id: string): string {
  const v = id.slice(KOKORO_PREFIX.length).trim()
  return KOKORO_VOICES.some((k) => k.id === v) ? v : 'af_heart'
}

/**
 * Generate speech with Kokoro (premium neural voice, in-browser).
 * Returns a WAV Blob ready for playback. Always resolves with
 * { ok: false, error } on failure — never throws — so callers can
 * simply fall through to the next engine in the chain.
 */
export async function kokoroSpeak(
  text: string,
  voiceId = 'af_heart',
  timeoutMs = 25_000
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  try {
    const result = await Promise.race([
      (async () => {
        const tts = await loadKokoro()
        const audio = await tts.generate(text.slice(0, 2000), { voice: voiceId })
        const wav = audio.toWav() as ArrayBuffer
        return new Blob([wav], { type: 'audio/wav' })
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Kokoro synthesis timed out')), timeoutMs)
      ),
    ])
    return { ok: true, blob: result }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 120) : 'Kokoro failed',
    }
  }
}

/** Check if Kokoro is ready (model downloaded + loaded). Never throws. */
export async function isKokoroReady(timeoutMs = 60_000): Promise<boolean> {
  try {
    await loadKokoro(timeoutMs)
    return Boolean(ttsInstance)
  } catch {
    return false
  }
}
