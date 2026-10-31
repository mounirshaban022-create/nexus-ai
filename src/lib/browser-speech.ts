'use client'

/* ------------------------------------------------------------------ */
/* BROWSER-NATIVE VOICE ENGINE — the zero-server speech fallback.      */
/*                                                                     */
/* Uses the Web Speech API (SpeechRecognition + speechSynthesis),      */
/* which ships inside Chrome, Edge, Safari and Android browsers.       */
/* This is the same fallback strategy made popular by the biggest      */
/* open-source chat UIs (Open WebUI, LibreChat): try server ASR/TTS    */
/* first, fall back to the browser's built-in speech engine when the   */
/* server side is unavailable — no API keys, no sockets, no cold       */
/* starts, works on ANY host (Vercel included).                        */
/* ------------------------------------------------------------------ */

/* Minimal typings for the (still non-standard) SpeechRecognition API. */
interface SRAlternative {
  transcript: string
  confidence: number
}
interface SRResult {
  isFinal: boolean
  length: number
  [index: number]: SRAlternative
}
interface SRResultList {
  length: number
  [index: number]: SRResult
}
interface SREvent extends Event {
  resultIndex: number
  results: SRResultList
}
interface SRErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/** The SpeechRecognition constructor, or null when the browser lacks one
 *  (Firefox, most in-app webviews). Guard every use — it may throw in
 *  exotic engines even when present. */
export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  try {
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return null
    // Probe: some engines expose the constructor but throw on start().
    return Ctor
  } catch {
    return null
  }
}

export function speechRecognitionSupported(): boolean {
  return speechRecognitionCtor() !== null
}

export function speechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'
}

/** True when this browser can run the FULL on-device voice call
 *  (recognition + synthesis). When false, callers degrade to captions
 *  mode with spoken replies (synthesis only). */
export function fullBrowserVoiceSupported(): boolean {
  return speechRecognitionSupported() && speechSynthesisSupported()
}

/* ------------------------------------------------------------------ */
/* Dictation — continuous speech-to-text with auto-restart             */
/* ------------------------------------------------------------------ */

export interface DictationHandle {
  stop(): void
}

/**
 * Starts continuous dictation. Final transcripts arrive through
 * onFinal; interim text through onInterim (may be undefined).
 *
 * The underlying recognizer stops spontaneously (silence timeouts,
 * Android quirks) — we restart it while active=true, backing off
 * briefly after errors so a denied permission doesn't spin.
 */
export function startDictation(opts: {
  lang?: string
  onFinal: (transcript: string) => void
  onInterim?: (transcript: string) => void
  onError?: (code: string) => void
}): DictationHandle | null {
  const Ctor = speechRecognitionCtor()
  if (!Ctor) return null

  let active = true
  let restarting = false
  let rec: SpeechRecognitionLike | null = null

  const spawn = () => {
    if (!active) return
    try {
      rec = new Ctor()
    } catch {
      return
    }
    rec.lang = opts.lang ?? navigator.language ?? 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e: SREvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const alt = result?.[0]
        if (!alt) continue
        if (result.isFinal) {
          const text = alt.transcript.trim()
          if (text) opts.onFinal(text)
        } else {
          interim += alt.transcript
        }
      }
      if (interim.trim()) opts.onInterim?.(interim.trim())
    }

    rec.onerror = (e: SRErrorEvent) => {
      // 'no-speech' and 'aborted' are normal lifecycle noise.
      if (e.error !== 'no-speech' && e.error !== 'aborted') opts.onError?.(e.error)
    }

    rec.onend = () => {
      if (!active) return
      // Auto-restart with a small backoff after hard errors.
      if (restarting) return
      restarting = true
      window.setTimeout(() => {
        restarting = false
        if (active) spawn()
      }, 350)
    }

    try {
      rec.start()
    } catch {
      /* start() throws if already started — the restart loop recovers */
    }
  }

  spawn()

  return {
    stop() {
      active = false
      try {
        rec?.abort()
      } catch {
        /* already stopped */
      }
      rec = null
    },
  }
}

/* ------------------------------------------------------------------ */
/* Speak — speechSynthesis with voice picking + a cancel handle        */
/* ------------------------------------------------------------------ */

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    const base = lang.toLowerCase().split('-')[0]
    // Exact locale match first (e.g. ar-SA), then language family, then
    // any voice — prefer "natural"/"neural"/Google voices when present.
    const score = (v: SpeechSynthesisVoice): number => {
      let s = 0
      const vl = v.lang.toLowerCase()
      if (vl === lang.toLowerCase()) s += 4
      else if (vl.startsWith(base)) s += 2
      const n = v.name.toLowerCase()
      if (/natural|neural|premium|enhanced/.test(n)) s += 2
      if (/google/.test(n)) s += 1
      if (v.localService) s += 0.5
      return s
    }
    return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null
  } catch {
    return null
  }
}

export interface SpeakHandle {
  cancel(): void
}

/**
 * Speaks text through the browser's built-in synthesizer. Chunks long
 * text on sentence boundaries (some engines truncate long utterances)
 * and queues the chunks so playback is continuous. Resolves when all
 * chunks finished (or were cancelled). The cancel handle lets callers
 * implement barge-in.
 */
export function browserSpeak(
  text: string,
  opts: { lang?: string; rate?: number; onStart?: () => void } = {}
): { done: Promise<void>; handle: SpeakHandle } {
  let cancelled = false
  const cancel = () => {
    cancelled = true
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* not speaking */
    }
  }

  const done = (async () => {
    if (!speechSynthesisSupported() || !text.trim()) return
    const synth = window.speechSynthesis
    synth.cancel() // flush anything stale before queueing fresh audio

    // Chrome loads voices asynchronously — wait briefly for them.
    if (!synth.getVoices().length) {
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, 600)
        synth.addEventListener?.(
          'voiceschanged',
          () => {
            window.clearTimeout(t)
            resolve()
          },
          { once: true }
        )
      })
    }

    const lang = opts.lang ?? navigator.language ?? 'en-US'
    const voice = pickVoice(lang)

    // Sentence-aware chunking (≤180 chars keeps every engine happy).
    const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*|\n+/g) ?? [text]
    const chunks: string[] = []
    let cur = ''
    for (const s of sentences) {
      if ((cur + s).length > 180) {
        if (cur.trim()) chunks.push(cur.trim())
        if (s.length > 180) {
          for (let i = 0; i < s.length; i += 180) chunks.push(s.slice(i, i + 180).trim())
          cur = ''
          continue
        }
        cur = s
      } else {
        cur += s
      }
    }
    if (cur.trim()) chunks.push(cur.trim())
    if (!chunks.length) chunks.push(text.trim())

    opts.onStart?.()
    let firstStarted = false
    for (const chunk of chunks) {
      if (cancelled) return
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (!settled) {
            settled = true
            resolve()
          }
        }
        try {
          const utter = new SpeechSynthesisUtterance(chunk)
          if (voice) utter.voice = voice
          utter.lang = voice?.lang ?? lang
          utter.rate = opts.rate ?? 1.0
          utter.onstart = () => {
            if (!firstStarted) {
              firstStarted = true
              opts.onStart?.()
            }
          }
          utter.onend = finish
          utter.onerror = finish
          synth.speak(utter)
          // Watchdog: some engines silently drop utterances — never hang.
          window.setTimeout(finish, Math.min(45_000, 4_000 + chunk.length * 120))
        } catch {
          finish()
        }
      })
    }
  })()

  return { done, handle: { cancel } }
}
