'use client'

/**
 * Kokoro TTS — 82M parameter neural voice, 100% in-browser (WASM).
 * Premium quality, no API, no network, works in iframes.
 * https://github.com/hexgrad/kokoro
 */

let ttsInstance: any = null
let loadingPromise: Promise<any> | null = null

export async function loadKokoro(): Promise<any> {
  if (ttsInstance) return ttsInstance
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const { KokoroTTS } = await import('kokoro-js')
    ttsInstance = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      { dtype: 'q8', device: 'wasm' }
    )
    return ttsInstance
  })()

  return loadingPromise
}

export interface KokoroVoice {
  id: string
  label: string
}

/** Premium Kokoro voices (female + male, multiple accents). */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', label: 'Heart (US Female)' },
  { id: 'af_bella', label: 'Bella (US Female)' },
  { id: 'af_nicole', label: 'Nicole (AU Female)' },
  { id: 'am_adam', label: 'Adam (US Male)' },
  { id: 'am_michael', label: 'Michael (US Male)' },
  { id: 'bf_emma', label: 'Emma (UK Female)' },
  { id: 'bm_george', label: 'George (UK Male)' },
]

/**
 * Generate speech with Kokoro (premium neural voice, in-browser).
 * Returns a WAV Blob ready for WebAudio playback.
 */
export async function kokoroSpeak(
  text: string,
  voiceId = 'af_heart'
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  try {
    const tts = await loadKokoro()
    const audio = await tts.generate(text.slice(0, 2000), { voice: voiceId })
    const wav = audio.toWav()
    const blob = new Blob([wav], { type: 'audio/wav' })
    return { ok: true, blob }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 100) : 'Kokoro failed' }
  }
}

/** Check if Kokoro is ready (model downloaded + loaded). */
export async function isKokoroReady(): Promise<boolean> {
  try {
    await loadKokoro()
    return Boolean(ttsInstance)
  } catch {
    return false
  }
}
