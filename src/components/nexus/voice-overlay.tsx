'use client'

/**
 * NEXUS One — full-screen premium voice conversation overlay.
 *
 * FAIL-SOFT VOICE CHAIN (the "works perfectly" part):
 *  INPUT  : Web Speech API (live transcript as you speak)
 *         → MediaRecorder + in-browser VAD → server ASR on the recorded blob
 *         → always-available text input (mic denied / exotic browsers).
 *  THINK  : POST /api/voice/turn { message | audio, history, voice, lang }.
 *  SPEAK  : inline audio from the turn response → selected Kokoro offline
 *           voice (only if the in-browser model loaded) → POST /api/tts →
 *           browser speechSynthesis. No engine failure can dead-end a turn.
 *
 * Hands-free: after each spoken reply the overlay auto-restarts listening
 * until the user mutes or closes it. Voice + language choices persist to
 * localStorage; the Arabic UI defaults to an Arabic neural voice (mirrors
 * the server's pickVoiceForLanguage('ar') override in /api/voice/turn).
 *
 * The orb is the BrandMark wrapped in layered gradient glow rings whose
 * motion maps to the current state, with a real mic-driven waveform strip
 * (getUserMedia analyser; synthetic motion when the analyser is missing).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Globe, Loader2, Mic, MicOff, PhoneOff, Send, X } from 'lucide-react'
import { BrandMark } from './shared'
import { VoicePicker, KOKORO_PREFIX } from './voice-picker'
import { useToast } from '@/hooks/use-toast'
import { usePreferences } from '@/lib/preferences'
import { resolveVoice } from '@/lib/voices'
import {
  isKokoroVoiceId,
  kokoroVoiceIdFrom,
  kokoroSpeak,
  loadKokoro,
} from '@/components/omni/kokoro-voice'
import { blobToWavBase64 } from '@/components/omni/audio-utils'
import { onDeviceTranscribe, onDeviceAsrBroken, warmUpOnDeviceAsr } from '@/lib/whisper-client'

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** What happened in a turn — lets the recorder path fall back to the
 * on-device Whisper engine when the SERVER speech engines fail (the old
 * code swallowed failures, so the fallback was unreachable dead code). */
type TurnOutcome = 'ok' | 'no-speech' | 'asr-failed' | 'aborted' | 'error'

interface Turn {
  id: string
  user: string
  reply: string
}

interface TurnResponse {
  sessionId?: string
  transcript?: string
  reply?: string
  audio?: string | null
  audioFormat?: string
  note?: string
}

const LANGUAGES = [
  // English uses the PREMIUM Z.ai voice (warm, friendly neural voice
  // via the z-ai-web-dev-sdk). Other languages fall back to free
  // Microsoft Edge neural voices because the Z.ai TTS catalog is
  // English/Chinese-only.
  { code: 'en-US', label: 'English', voice: 'en-US-AvaMultilingualNeural' },
  { code: 'ar-AE', label: 'العربية', voice: 'ar-AE-FatimaNeural' },
  { code: 'ar-SA', label: 'العربية (SA)', voice: 'ar-SA-ZariyahNeural' },
  { code: 'fr-FR', label: 'Français', voice: 'fr-FR-DeniseNeural' },
  { code: 'es-ES', label: 'Español', voice: 'es-ES-ElviraNeural' },
  { code: 'de-DE', label: 'Deutsch', voice: 'de-DE-KatjaNeural' },
  { code: 'hi-IN', label: 'हिन्दी', voice: 'hi-IN-SwaraNeural' },
  { code: 'ja-JP', label: '日本語', voice: 'ja-JP-NanamiNeural' },
  { code: 'zh-CN', label: '中文', voice: 'zh-CN-XiaoxiaoNeural' },
  { code: 'pt-BR', label: 'Português', voice: 'pt-BR-FranciscaNeural' },
  { code: 'ru-RU', label: 'Русский', voice: 'ru-RU-SvetlanaNeural' },
  { code: 'tr-TR', label: 'Türkçe', voice: 'tr-TR-EmelNeural' },
]

/** localStorage keys for the persisted voice preferences. */
const VOICE_KEY = 'nexus-voice-id'
const SERVER_VOICE_KEY = 'nexus-server-voice-id'

/** Tiny silent WAV used to unlock <audio> playback inside the open gesture (iOS Safari). */
const SILENT_WAV_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** The last N turns rendered in the compact conversation log. */
const VISIBLE_TURNS = 4

/** Waveform bar count under the orb. */
const WAVE_BARS = 22

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

function getSpeechRecognition(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export function VoiceOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast()
  const uiLang = usePreferences((s) => s.language)

  /* --------------------------------------------------------------- */
  /* State                                                            */
  /* --------------------------------------------------------------- */
  const [state, setState] = useState<VoiceState>('idle')
  const [muted, setMuted] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [lang, setLang] = useState('en-US')
  const [voiceId, setVoiceId] = useState('en-US-AvaMultilingualNeural')
  const [interim, setInterim] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState('')
  const [showLangs, setShowLangs] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [noSpeech, setNoSpeech] = useState(false)
  const [caption, setCaption] = useState('')
  const [kokoroReady, setKokoroReady] = useState(false)
  const [kokoroLoading, setKokoroLoading] = useState(false)

  /* --------------------------------------------------------------- */
  /* Refs (single source of truth inside async voice pipelines)       */
  /* --------------------------------------------------------------- */
  const recognitionRef = useRef<any>(null)
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const sessionIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const stateRef = useRef<VoiceState>('idle')
  const mutedRef = useRef(false)
  const micDeniedRef = useRef(false)
  const openRef = useRef(false)
  const busyRef = useRef(false)
  const langRef = useRef('en-US')
  const voiceIdRef = useRef('en-US-AvaMultilingualNeural')
  const serverVoiceRef = useRef('en-US-AvaMultilingualNeural')
  const uiLangRef = useRef<'en' | 'ar'>('en')
  const kokoroReadyRef = useRef(false)
  const kokoroTriedRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const speakEpochRef = useRef(0)
  const playResolveRef = useRef<(() => void) | null>(null)
  const turnControllerRef = useRef<AbortController | null>(null)
  const asrTokenRef = useRef(0)
  const forceRecorderRef = useRef(false)
  const restartCountRef = useRef(0)
  const lastStartRef = useRef(0)
  const manualStopRef = useRef(false)
  const netErrRef = useRef(0)
  // Voice-glitch fixes (session 2026-08):
  //  - micGenRef: mic-acquisition generation — a getUserMedia promise that
  //    resolves AFTER the overlay closed/reopened is discarded (no leaks).
  //  - recorderActiveRef: double-recorder lock (two MediaRecorders on one
  //    stream caused glitchy overlapping turns).
  //  - srLastHeardRef/speechEnergyRef/watchdogFiredRef: the Web Speech
  //    watchdog — Chrome's SR can fail SILENTLY (mic works, service answers,
  //    but no transcript ever arrives). When the user has clearly spoken for
  //    ~2s with zero SR output, we auto-switch to the proven
  //    recorder+server-Whisper path instead of leaving the user unheard.
  const micGenRef = useRef(0)
  const recorderActiveRef = useRef(false)
  const srLastHeardRef = useRef(0)
  const srStartedAtRef = useRef(0)
  const speechEnergyRef = useRef(0)
  const watchdogFiredRef = useRef(false)
  const waveRef = useRef<HTMLDivElement | null>(null)
  const orbScaleRef = useRef<HTMLDivElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const startListeningRef = useRef<((langOverride?: string) => void) | null>(null)
  const runTurnRef = useRef<((input: { message?: string; audioBase64?: string }) => Promise<TurnOutcome>) | null>(null)

  const setStateSafe = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    uiLangRef.current = uiLang
  }, [uiLang])

  // Keep the conversation log glued to the latest turn.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [turns])

  /* --------------------------------------------------------------- */
  /* Audio plumbing                                                   */
  /* --------------------------------------------------------------- */

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as any).webkitAudioContext
      if (!AC) return null
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AC()
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume().catch(() => {})
      }
      return audioCtxRef.current
    } catch {
      return null
    }
  }, [])

  /** iOS/Safari autoplay unlock — runs inside the overlay-open click gesture. */
  const unlockAudio = useCallback(() => {
    ensureAudioCtx()
    const el = audioRef.current
    if (el) {
      try {
        el.src = SILENT_WAV_URL
        const p = el.play()
        if (p && typeof (p as Promise<void>).then === 'function') {
          p.then(() => {
            try {
              el.pause()
            } catch {
              /* already paused */
            }
          }).catch(() => {})
        }
      } catch {
        /* unlock best-effort */
      }
    }
  }, [ensureAudioCtx])

  const stopSpeaking = useCallback(() => {
    speakEpochRef.current++ // invalidate any in-flight playback chain
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* not supported */
    }
    const el = audioRef.current
    if (el) {
      try {
        el.pause()
      } catch {
        /* already stopped */
      }
    }
    playResolveRef.current?.()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  /** Plays an object URL through the shared <audio> element. Resolves on end/stop. */
  const playUrl = useCallback((url: string, epoch: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      const el = audioRef.current
      if (!el || speakEpochRef.current !== epoch) return resolve()
      const done = () => {
        el.onended = null
        el.onerror = null
        el.onpause = null
        playResolveRef.current = null
        resolve()
      }
      playResolveRef.current = done
      el.onended = done
      el.onerror = done
      el.onpause = done
      el.src = url
      try {
        el.play().catch(done)
      } catch {
        done()
      }
    })
  }, [])

  /**
   * SPEAK — the fail-soft TTS chain:
   *   1. Kokoro offline voice (only when explicitly selected AND loaded)
   *   2. inline audio returned by /api/voice/turn (neural, zero extra hops)
   *   3. POST /api/tts with the selected server voice
   *   4. browser speechSynthesis (always available)
   */
  const speak = useCallback(
    async (text: string, inlineAudio?: string | null, audioFormat?: string): Promise<void> => {
      const epoch = ++speakEpochRef.current
      const alive = () => openRef.current && speakEpochRef.current === epoch
      setStateSafe('speaking')
      setCaption(text)

      const trackUrl = (url: string) => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = url
      }

      // 1 — Kokoro in-browser neural voice
      if (isKokoroVoiceId(voiceIdRef.current) && kokoroReadyRef.current) {
        const res = await kokoroSpeak(text, kokoroVoiceIdFrom(voiceIdRef.current), 25_000)
        if (!alive()) return
        if (res.ok && res.blob) {
          const url = URL.createObjectURL(res.blob)
          trackUrl(url)
          await playUrl(url, epoch)
          return
        }
        // Kokoro failed → silently fall through to the server chain.
      }
      if (!alive()) return

      // 2 — inline audio from the voice turn (saves a round-trip)
      if (inlineAudio) {
        try {
          const blob = base64ToBlob(inlineAudio, audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav')
          if (blob.size > 100) {
            const url = URL.createObjectURL(blob)
            trackUrl(url)
            await playUrl(url, epoch)
            return
          }
        } catch {
          /* fall through */
        }
        if (!alive()) return
      }

      // 3 — dedicated TTS endpoint
      try {
        const res = await fetch(`/api/tts?lang=${encodeURIComponent(uiLangRef.current)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: serverVoiceRef.current, speed: 1.0 }),
          signal: turnControllerRef.current?.signal ?? undefined,
        })
        if (res.ok) {
          const blob = await res.blob()
          if (blob.size > 100 && alive()) {
            const url = URL.createObjectURL(blob)
            trackUrl(url)
            await playUrl(url, epoch)
            return
          }
        }
      } catch {
        /* fall through */
      }
      if (!alive()) return

      // 4 — browser built-in synthesizer (last resort)
      try {
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(text)
          utter.lang = langRef.current
          utter.onend = () => resolve()
          utter.onerror = () => resolve()
          window.speechSynthesis.speak(utter)
          window.setTimeout(resolve, Math.min(30_000, text.length * 90))
        })
      } catch {
        /* the text is still in the conversation log */
      }
    },
    [playUrl, setStateSafe]
  )

  /* --------------------------------------------------------------- */
  /* THINK — one server round-trip: ASR (if audio) → chat → TTS        */
  /* --------------------------------------------------------------- */

  const think = useCallback(async (input: { message?: string; audioBase64?: string }): Promise<TurnResponse> => {
    const body: Record<string, unknown> = {
      history: historyRef.current.slice(-6),
      language: langRef.current.split('-')[0],
      voice: serverVoiceRef.current,
      lang: uiLangRef.current,
    }
    if (input.message) body.message = input.message
    if (input.audioBase64) body.audio = input.audioBase64
    if (sessionIdRef.current) body.sessionId = sessionIdRef.current

    const res = await fetch('/api/voice/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: turnControllerRef.current?.signal ?? undefined,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error((data as { error?: string } | null)?.error || 'AI failed to respond — try again.')
    return data as TurnResponse
  }, [])

  /* --------------------------------------------------------------- */
  /* Input stoppers                                                   */
  /* --------------------------------------------------------------- */

  const stopRecognition = useCallback(() => {
    manualStopRef.current = true
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.stop()
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
    }
    setInterim('')
  }, [])

  const stopAsrLoop = useCallback(() => {
    asrTokenRef.current++
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    mediaRecorderRef.current = null
  }, [])

  /* --------------------------------------------------------------- */
  /* One conversation turn (shared by speech, recorder and text)      */
  /* --------------------------------------------------------------- */

  const runTurn = useCallback(
    async (input: { message?: string; audioBase64?: string }): Promise<TurnOutcome> => {
      const message = input.message?.trim()
      if ((!message && !input.audioBase64) || busyRef.current || !openRef.current) return 'no-speech'
      busyRef.current = true
      stopRecognition()
      stopAsrLoop()
      stopSpeaking()
      setStateSafe('thinking')
      setInterim('')
      setError('')
      setCaption('')
      turnControllerRef.current = new AbortController()
      // When the SERVER speech engines fail, the recorder path (startAsrLoop)
      // must get control back to try the on-device Whisper — so this turn
      // must NOT auto-restart listening in its finally block.
      let suppressRestart = false
      try {
        const data = await think({ message, audioBase64: input.audioBase64 })
        if (data.sessionId) sessionIdRef.current = data.sessionId
        if (data.note === 'asr-engine-failed') {
          // Both server ASR engines failed (quota / outage). Return control
          // to the caller WITHOUT restarting the loop — it falls back to the
          // on-device Whisper engine.
          suppressRestart = true
          return 'asr-failed'
        }
        const reply = (data.reply ?? '').trim()
        const shown = message || (data.transcript ?? '').trim()
        if (!reply || !shown || data.note === 'no-speech') {
          setNoSpeech(true)
          window.setTimeout(() => setNoSpeech(false), 2200)
          return 'no-speech'
        }
        historyRef.current.push({ role: 'user', content: shown })
        historyRef.current.push({ role: 'assistant', content: reply })
        setTurns((prev) => [...prev.slice(-5), { id: crypto.randomUUID(), user: shown, reply }])
        await speak(reply, data.audio, data.audioFormat)
        return 'ok'
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'aborted'
        const msg = e instanceof Error ? e.message : 'Something went wrong — try again.'
        setError(msg)
        toast({ title: 'Voice error', description: msg, variant: 'destructive' })
        return 'error'
      } finally {
        busyRef.current = false
        if (suppressRestart) {
          // Caller decides what happens next (on-device fallback) — leave
          // the state machine to it.
        } else if (openRef.current && !mutedRef.current && !micDeniedRef.current) {
          startListeningRef.current?.() // hands-free loop: listen again
        } else {
          setStateSafe('idle')
        }
      }
    },
    [think, speak, stopRecognition, stopAsrLoop, stopSpeaking, setStateSafe, toast]
  )

  useEffect(() => {
    runTurnRef.current = runTurn
  }, [runTurn])

  /* --------------------------------------------------------------- */
  /* ASR fallback — MediaRecorder + VAD → server ASR                  */
  /* (used when Web Speech is missing or thrashing)                   */
  /* --------------------------------------------------------------- */

  const startAsrLoop = useCallback(async (): Promise<void> => {
    const stream = micStreamRef.current
    if (!stream || typeof MediaRecorder === 'undefined' || busyRef.current) return
    if (!openRef.current || mutedRef.current) return
    if (recorderActiveRef.current) return // double-recorder lock
    const token = ++asrTokenRef.current
    recorderActiveRef.current = true
    const release = () => {
      recorderActiveRef.current = false
    }
    const alive = () =>
      asrTokenRef.current === token && openRef.current && !mutedRef.current && !busyRef.current

    try {
      const ctx = ensureAudioCtx()
      if (!ctx || ctx.state === 'closed') throw new Error('Audio context unavailable')
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = rec
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.start(250)
      setStateSafe('listening')
      setError('')
      setCaption('')
      netErrRef.current = 0

      // ADAPTIVE VAD — the old fixed 0.008 threshold mistook ambient noise
      // for speech (false "Didn't catch that" loops) or missed quiet talkers.
      // Calibrate on the first ~600 ms of ambient audio, then require
      // sustained speech and ~1.2 s of trailing silence to close the turn.
      const spoke = await new Promise<boolean>((resolve) => {
        const data = new Uint8Array(analyser.fftSize)
        let speechStart: number | null = null
        let lastSound = performance.now()
        let speechMs = 0
        const startedAt = performance.now()
        let noiseFloor = 0
        const noiseWindow: number[] = []
        const SILENCE_MS = 1200
        const MIN_SPEECH_MS = 240
        const MAX_WAIT = 15_000
        let raf = 0
        const loop = () => {
          if (!alive()) {
            cancelAnimationFrame(raf)
            resolve(false)
            return
          }
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
          const now = performance.now()
          // Ambient calibration — collect ~36 frames (≈600 ms) and take the
          // MEDIAN as the noise floor. The old MEAN was poisoned when the
          // user started talking (or any beep played) during calibration:
          // the floor inflated, the 2.5× threshold rose ABOVE the speech
          // level itself, and the overlay sat at "Listening…" forever —
          // "the mic doesn't hear me". The median ignores those spikes and
          // the hard cap keeps the threshold reachable in noisy rooms.
          if (noiseFloor === 0 && speechStart === null) {
            noiseWindow.push(rms)
            if (noiseWindow.length === 36) {
              const sorted = [...noiseWindow].sort((a, b) => a - b)
              noiseFloor = Math.max(0.002, sorted[18])
            }
          }
          const threshold =
            noiseFloor > 0
              ? Math.min(0.06, Math.max(0.01, noiseFloor * 2.5))
              : 0.012
          if (rms > threshold) {
            speechMs += 16 // rAF frame ≈ 16 ms
            if (speechStart === null && speechMs >= MIN_SPEECH_MS) {
              speechStart = now - speechMs
            }
            lastSound = now
          } else if (speechStart === null) {
            speechMs = 0 // below threshold before any speech — reset
          }
          if (
            speechStart !== null &&
            now - lastSound > SILENCE_MS &&
            speechMs >= MIN_SPEECH_MS
          ) {
            cancelAnimationFrame(raf)
            resolve(true)
            return
          }
          if (speechStart === null && now - startedAt > MAX_WAIT) {
            cancelAnimationFrame(raf)
            resolve(false)
            return
          }
          if (speechStart !== null && now - speechStart > MAX_WAIT) {
            cancelAnimationFrame(raf)
            resolve(true)
            return
          }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      })

      const blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
        try {
          rec.stop()
        } catch {
          resolve(new Blob())
        }
      })
      try {
        source.disconnect()
      } catch {
        /* already disconnected */
      }
      try {
        analyser.disconnect()
      } catch {
        /* already disconnected */
      }
      if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null
      if (!alive()) {
        release()
        return
      }

      if (!spoke || blob.size < 1000) {
        // Pure silence — restart the loop WITHOUT the "Didn't catch that"
        // nag (nothing was said; nagging every 15 s felt glitchy).
        release()
        startListeningRef.current?.()
        return
      }

      setStateSafe('thinking')

      /* PRIMARY — server-side Whisper-large-v3 (Hugging Face): the most
       * accurate engine, zero client downloads, works in every browser and
       * inside cross-origin iframes. The server tries HF first and Z.ai
       * second. When BOTH server engines fail it replies with
       * note:'asr-engine-failed' and we fall back to on-device Whisper. */
      setCaption('')
      const base64 = await blobToWavBase64(blob)
      if (!alive()) {
        release()
        return
      }
      const outcome = await runTurnRef.current?.({ audioBase64: base64 })
      if (outcome !== 'asr-failed') {
        release()
        return
      }

      /* FALLBACK — on-device Whisper (offline / server engines down). */
      if (!onDeviceAsrBroken()) {
        try {
          const text = await onDeviceTranscribe(blob, langRef.current, (pct, note) => {
            if (asrTokenRef.current === token) {
              setCaption(pct >= 100 ? 'Listening…' : `${note} ${pct}%`)
            }
          })
          if (text) {
            setCaption('')
            release()
            await runTurnRef.current?.({ message: text })
            return
          }
        } catch {
          /* engine unavailable too — report below */
        }
      }

      // Every engine failed to hear anything.
      release()
      if (openRef.current && asrTokenRef.current === token) {
        setNoSpeech(true)
        window.setTimeout(() => setNoSpeech(false), 2200)
        setError('Speech engines are unreachable right now — check your connection, or type below.')
        setStateSafe('idle')
      }
    } catch (e) {
      release()
      if ((e as Error)?.name === 'AbortError') return
      if (asrTokenRef.current === token) {
        setError('Voice capture failed — check your microphone, or type below.')
        setStateSafe('idle')
      }
    }
  }, [ensureAudioCtx, setStateSafe])

  /* --------------------------------------------------------------- */
  /* LISTEN — Web Speech API with recorder fallback                   */
  /* --------------------------------------------------------------- */

  const startListening = useCallback(
    (langOverride?: string) => {
      if (!openRef.current || mutedRef.current || micDeniedRef.current || busyRef.current) return
      const SR = getSpeechRecognition()

      if (!SR || forceRecorderRef.current) {
        if (micStreamRef.current && typeof MediaRecorder !== 'undefined') {
          void startAsrLoop()
        } else {
          // No mic stream (blocked by the embedding iframe's permission
          // policy, or denied) and no usable Web Speech — flip to the
          // micDenied visual state so the prominent card + "open in a new
          // tab" CTA (which deep-links to ?voice=1) renders, not just the
          // small error line. Text input stays available below either way.
          setStateSafe('idle')
          if (!micDeniedRef.current && !mutedRef.current) {
            let framed = false
            try {
              framed = window.self !== window.top
            } catch {
              framed = true
            }
            micDeniedRef.current = true
            setMicDenied(true)
            setInterim('')
            setError(
              framed
                ? 'The microphone is blocked inside this embedded preview. Open the app in a new tab — NEXUS will hear you there. You can also type below; replies are still spoken.'
                : 'Voice input is unavailable in this browser — type below and NEXUS will still reply out loud.'
            )
          }
        }
        return
      }

      stopSpeaking()
      const rec = new SR()
      rec.lang = langOverride ?? langRef.current
      rec.continuous = true
      rec.interimResults = true

      rec.onresult = (event: any) => {
        let finalTranscript = ''
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          if (r.isFinal) finalTranscript += r[0].transcript
          else interimText += r[0].transcript
        }
        // The SR watchdog bookkeeping — SR IS producing output.
        srLastHeardRef.current = performance.now()
        speechEnergyRef.current = 0
        if (interimText) {
          netErrRef.current = 0
          setInterim(interimText)
        }
        if (finalTranscript.trim() && !busyRef.current) {
          void runTurnRef.current?.({ message: finalTranscript })
        }
      }

      rec.onerror = (event: any) => {
        const kind = event?.error
        if (kind === 'not-allowed' || kind === 'permission-denied') {
          if (micStreamRef.current && typeof MediaRecorder !== 'undefined') {
            // Raw mic works — fall back to the record → server-ASR path.
            stopRecognition()
            forceRecorderRef.current = true
            window.setTimeout(() => startListeningRef.current?.(), 200)
          } else {
            micDeniedRef.current = true
            setMicDenied(true)
            setStateSafe('idle')
            setInterim('')
          }
        } else if (kind === 'audio-capture' || kind === 'network') {
          netErrRef.current += 1
          if (netErrRef.current >= 3) {
            if (micStreamRef.current && typeof MediaRecorder !== 'undefined') {
              // The browser's speech SERVICE is unreachable (common on some
              // networks) but the raw mic works — switch to the on-device
              // Whisper engine instead of giving up: NEXUS keeps hearing.
              stopRecognition()
              forceRecorderRef.current = true
              warmUpOnDeviceAsr((pct, note) => {
                if (pct > 0 && pct < 100) setCaption(`${note} ${pct}%`)
              })
              setCaption('Switching to the on-device ear…')
              window.setTimeout(() => startListeningRef.current?.(), 200)
            } else {
              stopRecognition()
              setStateSafe('idle')
              setError('Could not reach the speech service — type below; replies are still spoken aloud.')
            }
          } else {
            setError('Speech service hiccup — retrying…')
          }
        } else if (kind === 'no-speech') {
          setNoSpeech(true)
          window.setTimeout(() => setNoSpeech(false), 2200)
        }
        // 'aborted' is normal between restarts.
      }

      rec.onend = () => {
        if (manualStopRef.current) return
        if (stateRef.current !== 'listening' || !recognitionRef.current) return
        // Loop protection: count only consecutive IMMEDIATE restarts.
        const elapsed = performance.now() - lastStartRef.current
        if (elapsed < 1000) {
          restartCountRef.current += 1
          if (restartCountRef.current >= 10) {
            stopRecognition()
            if (micStreamRef.current && typeof MediaRecorder !== 'undefined') {
              // SR is thrashing in this browser — the recorder + server
              // Whisper path works everywhere. SWITCH to it instead of
              // giving up (was: a dead "type below" error message).
              forceRecorderRef.current = true
              window.setTimeout(() => startListeningRef.current?.(), 150)
            } else {
              setStateSafe('idle')
              setError('Voice recognition keeps stopping in this browser — type below; replies are still spoken.')
            }
            return
          }
          if (restartCountRef.current >= 5 && micStreamRef.current && typeof MediaRecorder !== 'undefined') {
            // Web Speech is thrashing — switch to the proven record → upload path.
            stopRecognition()
            forceRecorderRef.current = true
            window.setTimeout(() => startListeningRef.current?.(), 150)
            return
          }
        } else {
          restartCountRef.current = 0
        }
        try {
          recognitionRef.current.start()
          lastStartRef.current = performance.now()
        } catch {
          /* restart race — the next onend retries */
        }
      }

      recognitionRef.current = rec
      manualStopRef.current = false
      restartCountRef.current = 0
      // Watchdog bookkeeping — give SR a fair startup window.
      srLastHeardRef.current = performance.now()
      srStartedAtRef.current = performance.now()
      speechEnergyRef.current = 0
      try {
        rec.start()
        lastStartRef.current = performance.now()
        setStateSafe('listening')
        setError('')
        setCaption('')
      } catch {
        /* already started */
      }
    },
    [startAsrLoop, stopRecognition, stopSpeaking, setStateSafe]
  )

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  /* --------------------------------------------------------------- */
  /* Mic acquisition (permission + waveform analyser)                 */
  /* --------------------------------------------------------------- */

  const acquireMic = useCallback(async (): Promise<boolean> => {
    if (micStreamRef.current) return true
    if (!navigator.mediaDevices?.getUserMedia) return false
    // Generation token — if the overlay closes (or reopens) while the
    // permission prompt is still up, the late-resolving stream is discarded
    // instead of leaked (the old 6-second race aborted while the user was
    // still READING the prompt, then leaked the mic when it resolved later).
    const gen = ++micGenRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (gen !== micGenRef.current || !openRef.current) {
        try {
          stream.getTracks().forEach((tr) => tr.stop())
        } catch {
          /* already stopped */
        }
        return false
      }
      micStreamRef.current = stream
      // Waveform analyser (kept separate from the VAD analyser).
      try {
        const ctx = ensureAudioCtx()
        if (ctx && ctx.state !== 'closed') {
          const src = ctx.createMediaStreamSource(stream)
          const an = ctx.createAnalyser()
          an.fftSize = 256
          an.smoothingTimeConstant = 0.7
          src.connect(an)
          micAnalyserRef.current = an
        }
      } catch {
        /* waveform falls back to synthetic motion */
      }
      return true
    } catch {
      return false
    }
  }, [ensureAudioCtx])

  /* --------------------------------------------------------------- */
  /* Overlay lifecycle                                                */
  /* --------------------------------------------------------------- */

  // Fresh conversation every time the overlay opens; full teardown on close.
  useEffect(() => {
    if (!open) return

    setMuted(false)
    mutedRef.current = false
    setMicDenied(false)
    micDeniedRef.current = false
    // Chrome's SpeechRecognition silently never transcribes inside a
    // cross-origin iframe (the preview panel). When framed, go straight
    // to the recorder + on-device Whisper path — it hears the user there.
    try {
      forceRecorderRef.current = window.self !== window.top
    } catch {
      forceRecorderRef.current = true
    }
    netErrRef.current = 0
    restartCountRef.current = 0
    watchdogFiredRef.current = false
    speechEnergyRef.current = 0
    srLastHeardRef.current = performance.now()
    srStartedAtRef.current = performance.now()
    recorderActiveRef.current = false
    micGenRef.current++
    setTurns([])
    setInterim('')
    setError('')
    setTextInput('')
    setShowLangs(false)
    setNoSpeech(false)
    setCaption('')
    historyRef.current = []
    sessionIdRef.current = null
    busyRef.current = false
    setStateSafe('idle')

    // Voice + language preferences (persisted; Arabic UI → Arabic voice).
    const ui = uiLangRef.current
    // Premium Z.ai voice by default for English UI; Arabic UI keeps the
    // Arabic Microsoft Edge voice because Z.ai has no Arabic voice.
    const defServer = ui === 'ar' ? 'ar-SA-HamedNeural' : 'en-US-AvaMultilingualNeural'
    const storedServer = window.localStorage.getItem(SERVER_VOICE_KEY)
    const server = storedServer && resolveVoice(storedServer) ? storedServer : defServer
    serverVoiceRef.current = server
    window.localStorage.setItem(SERVER_VOICE_KEY, server)

    let initial = window.localStorage.getItem(VOICE_KEY)
    if (!initial || !(isKokoroVoiceId(initial) || resolveVoice(initial))) initial = server
    voiceIdRef.current = initial
    setVoiceId(initial)
    window.localStorage.setItem(VOICE_KEY, initial)

    const prefix = server.split('-')[0].toLowerCase()
    const langMatch = LANGUAGES.find((l) => l.code.toLowerCase().startsWith(`${prefix}-`))
    const recLang = langMatch?.code ?? (ui === 'ar' ? 'ar-SA' : 'en-US')
    langRef.current = recLang
    setLang(recLang)

    unlockAudio()

    // NOTE: no eager Whisper pre-warm anymore. The PRIMARY recognition path
    // is now the SERVER-side Whisper-large-v3 (accurate, instant, zero
    // downloads) — the on-device engine only spins up as an emergency
    // fallback when the server path fails, so its ~45 MB one-time download
    // is no longer spent up-front for every user. EXCEPTION below: when the
    // server has NO speech engine at all, we DO pre-warm.
    let cancelled = false

    // Ask the server which speech engines exist in THIS deployment. When
    // NEITHER server engine is configured (HF_TOKEN missing + the Z.ai SDK
    // unreachable — the "voice doesn't hear me on the deployment" case),
    // every server transcription attempt is doomed: pre-warm the on-device
    // Whisper engine NOW so its ~45 MB download overlaps the user's first
    // sentence instead of starting after a failed server round-trip.
    fetch('/api/asr/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { serverAsr?: boolean } | null) => {
        if (cancelled || !s || s.serverAsr !== false) return
        warmUpOnDeviceAsr((pct, note) => {
          if (pct > 0 && pct < 100) setCaption(`${note} ${pct}%`)
        })
      })
      .catch(() => {})

    const t = window.setTimeout(() => {
      if (cancelled) return
      void (async () => {
        const micOk = await acquireMic()
        if (cancelled) return
        if (micOk) {
          startListeningRef.current?.()
        } else {
          const SR = getSpeechRecognition()
          if (!SR) {
            micDeniedRef.current = true
            setMicDenied(true)
            setStateSafe('idle')
          } else {
            // getUserMedia failed but Web Speech may still work on some
            // browsers — try it; its error handler flips to micDenied.
            startListeningRef.current?.()
          }
        }
      })()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      manualStopRef.current = true
      micGenRef.current++ // invalidate any in-flight getUserMedia
      stopRecognition()
      stopAsrLoop()
      recorderActiveRef.current = false
      stopSpeaking()
      turnControllerRef.current?.abort()
      turnControllerRef.current = null
      try {
        micStreamRef.current?.getTracks().forEach((tr) => tr.stop())
      } catch {
        /* already stopped */
      }
      micStreamRef.current = null
      micAnalyserRef.current = null
      try {
        void audioCtxRef.current?.close()
      } catch {
        /* already closed */
      }
      audioCtxRef.current = null
      busyRef.current = false
    }
  }, [open, unlockAudio, acquireMic, stopRecognition, stopAsrLoop, stopSpeaking, setStateSafe])

  // Optional Kokoro offline voices — load in the background, surface only on
  // success. NEVER blocks or breaks the primary server-voice path.
  useEffect(() => {
    if (!open || kokoroTriedRef.current) return
    setKokoroLoading(true)
    const kick = window.setTimeout(() => {
      kokoroTriedRef.current = true
      loadKokoro(45_000)
        .then(() => {
          kokoroReadyRef.current = true
          setKokoroReady(true)
        })
        .catch((e: unknown) => {
          console.debug('[voice] Kokoro offline voices unavailable:', e instanceof Error ? e.message : e)
        })
        .finally(() => setKokoroLoading(false))
    }, 2500)
    return () => window.clearTimeout(kick)
  }, [open])

  // Waveform + orb pulse — one rAF loop, direct DOM writes (no re-renders).
  // Also hosts the WEB SPEECH WATCHDOG: Chrome's SpeechRecognition can fail
  // SILENTLY (mic works, no errors, but no transcript ever arrives — the
  // reported "voice doesn't hear me" glitch). When the user has clearly
  // spoken for ~2s with zero SR output, we auto-switch to the proven
  // recorder + server-Whisper path.
  useEffect(() => {
    if (!open) return
    let raf = 0
    let lastFrame = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = Math.min(100, now - lastFrame)
      lastFrame = now
      const bars = waveRef.current?.children
      if (bars && bars.length > 0) {
        const n = bars.length
        const t = now / 1000
        const st = stateRef.current

        let levels: number[] | null = null
        const an = micAnalyserRef.current
        if (st === 'listening' && an) {
          const data = new Uint8Array(an.fftSize)
          an.getByteTimeDomainData(data)
          const seg = Math.floor(data.length / n) || 1
          levels = []
          let energySum = 0
          for (let i = 0; i < n; i++) {
            let sum = 0
            const from = i * seg
            for (let j = from; j < from + seg && j < data.length; j++) {
              const v = (data[j] - 128) / 128
              sum += v * v
            }
            const rms = Math.sqrt(sum / seg)
            energySum += rms
            levels.push(Math.min(1, rms * 6))
          }

          // ---- Web Speech watchdog (SR mode only) ----
          // Two rescue triggers:
          //   1. speech detected for >2.2 s with zero SR output (SR answers
          //      but never transcribes), or
          //   2. DEAD-MAN: SR has been running >8 s and has produced no
          //      result/error/interim since start. Headless/WebView/embedded
          //      Chromium ships SpeechRecognition that silently does nothing
          //      — the overlay sat at "Listening…" forever and voice looked
          //      completely dead. Force-switching to the recorder path is
          //      always safe: the recorder simply waits for real speech.
          if (recognitionRef.current && !watchdogFiredRef.current) {
            const overallRms = energySum / n
            if (overallRms > 0.012) {
              speechEnergyRef.current += dt
            }
            const srSilentSinceStart =
              srLastHeardRef.current <= srStartedAtRef.current &&
              now - srStartedAtRef.current > 8000
            if (
              (speechEnergyRef.current > 2200 &&
                now - srLastHeardRef.current > 3000) ||
              srSilentSinceStart
            ) {
              watchdogFiredRef.current = true
              speechEnergyRef.current = 0
              stopRecognition()
              forceRecorderRef.current = true
              setCaption('')
              setInterim('')
              window.setTimeout(() => startListeningRef.current?.(), 150)
            }
          }
        }

        let total = 0
        for (let i = 0; i < n; i++) {
          const el = bars[i] as HTMLElement
          let target: number
          if (levels) {
            target = 0.14 + levels[i] * 0.86
          } else if (st === 'listening') {
            target = 0.14 + Math.abs(Math.sin(t * 4.4 + i * 0.7)) * 0.3
          } else if (st === 'speaking') {
            target = 0.16 + Math.abs(Math.sin(t * 7 + i * 0.55)) * 0.5 + Math.abs(Math.sin(t * 3.1 + i * 0.21)) * 0.28
          } else if (st === 'thinking') {
            target = 0.12 + Math.abs(Math.sin(t * 2 + i * 0.35)) * 0.16
          } else {
            target = 0.1
          }
          const cur = parseFloat(el.dataset.l ?? '0.1')
          const next = cur + (target - cur) * 0.25
          el.dataset.l = String(next)
          el.style.transform = `scaleY(${next.toFixed(3)})`
          total += next
        }

        if (orbScaleRef.current) {
          const avg = total / n
          const scale = st === 'listening' ? 1 + Math.min(0.16, avg * 0.35) : 1
          orbScaleRef.current.style.transform = `scale(${scale.toFixed(3)})`
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open, stopRecognition])

  // Escape closes the overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Unmount safety net.
  useEffect(
    () => () => {
      manualStopRef.current = true
      stopRecognition()
      stopAsrLoop()
      stopSpeaking()
      try {
        micStreamRef.current?.getTracks().forEach((tr) => tr.stop())
      } catch {
        /* already stopped */
      }
    },
    [stopRecognition, stopAsrLoop, stopSpeaking]
  )

  /* --------------------------------------------------------------- */
  /* Controls                                                         */
  /* --------------------------------------------------------------- */

  const applyVoice = useCallback((id: string) => {
    voiceIdRef.current = id
    setVoiceId(id)
    try {
      window.localStorage.setItem(VOICE_KEY, id)
      if (!isKokoroVoiceId(id)) {
        serverVoiceRef.current = id
        window.localStorage.setItem(SERVER_VOICE_KEY, id)
      }
    } catch {
      /* private mode — preferences just won't persist */
    }
  }, [])

  const handleVoiceChange = useCallback(
    (id: string) => {
      applyVoice(id)
      // Keep recognition aligned with the spoken language when possible.
      if (!isKokoroVoiceId(id)) {
        const prefix = id.split('-')[0].toLowerCase()
        const match = LANGUAGES.find((l) => l.code.toLowerCase().startsWith(`${prefix}-`))
        if (match && match.code !== langRef.current) {
          langRef.current = match.code
          setLang(match.code)
          if (stateRef.current === 'listening') {
            stopRecognition()
            stopAsrLoop()
            window.setTimeout(() => startListeningRef.current?.(match.code), 150)
          }
        }
      }
      toast({
        title: `Voice: ${id.startsWith(KOKORO_PREFIX) ? 'Offline neural' : resolveVoice(id)?.label ?? id}`,
        description: 'Applies to the next reply.',
      })
    },
    [applyVoice, stopRecognition, stopAsrLoop, toast]
  )

  const toggleMute = () => {
    if (micDenied) return
    if (muted) {
      setMuted(false)
      mutedRef.current = false
      setError('')
      startListening()
    } else if (stateRef.current === 'idle') {
      // Paused (engine fell back / SR bailed) — the mic button RESUMES
      // listening directly (was: required a confusing mute→unmute dance).
      setError('')
      startListening()
    } else {
      setMuted(true)
      mutedRef.current = true
      stopRecognition()
      stopAsrLoop()
      setInterim('')
      setStateSafe('idle')
    }
  }

  const pickLanguage = (l: (typeof LANGUAGES)[number]) => {
    setLang(l.code)
    langRef.current = l.code
    setShowLangs(false)
    // Switch the TTS voice when the current one speaks another language.
    const cur = voiceIdRef.current
    const curPrefix = isKokoroVoiceId(cur) ? 'en' : cur.split('-')[0].toLowerCase()
    if (curPrefix !== l.code.split('-')[0].toLowerCase()) {
      applyVoice(l.voice)
    }
    if (stateRef.current === 'listening') {
      stopRecognition()
      stopAsrLoop()
      window.setTimeout(() => startListeningRef.current?.(l.code), 150)
    }
  }

  const sendText = () => {
    const text = textInput.trim()
    if (!text || busyRef.current) return
    setTextInput('')
    if (stateRef.current === 'speaking') stopSpeaking() // interrupt audio, keep the flow
    void runTurnRef.current?.({ message: text })
  }

  /* --------------------------------------------------------------- */
  /* Render                                                           */
  /* --------------------------------------------------------------- */

  const inIframe = typeof window !== 'undefined' && window.self !== window.top
  const statusLabel =
    micDenied
      ? 'Text mode'
      : state === 'listening'
        ? 'Listening…'
        : state === 'thinking'
          ? 'Thinking…'
          : state === 'speaking'
            ? 'Speaking…'
            : muted
              ? 'Mic muted'
              : 'Voice paused — tap the mic to resume'

  const recentTurns = turns.slice(-VISIBLE_TURNS)
  const busy = state === 'thinking' || state === 'speaking'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nexus-voice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="dialog"
          aria-modal="true"
          aria-label="NEXUS voice mode"
          className="fixed inset-0 z-50 flex flex-col text-foreground"
          style={{
            background:
              'linear-gradient(168deg, rgba(9,9,11,0.97) 0%, rgba(20,8,12,0.96) 55%, rgba(9,9,11,0.98) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark size={22} />
              <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 sm:inline">
                Voice
              </span>
              <VoicePicker
                value={voiceId}
                onChange={handleVoiceChange}
                kokoroReady={kokoroReady}
                kokoroLoading={kokoroLoading}
              />
            </div>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close voice mode"
              className="shrink-0 rounded-full p-2.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Center stage */}
          <div className="nx-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
            <div className="mx-auto flex w-full max-w-xl flex-col items-center my-auto">
              {/* ---- The orb ---- */}
              <div className="relative flex items-center justify-center">
                {/* ambient brand glow */}
                <div
                  aria-hidden
                  className="absolute h-[300px] w-[300px] rounded-full"
                  style={{
                    background:
                      'radial-gradient(closest-side, rgba(255,90,95,0.20), rgba(245,166,35,0.08) 55%, transparent 75%)',
                    filter: 'blur(30px)',
                  }}
                />

                {/* listening — expanding rings */}
                {state === 'listening' &&
                  [0, 1, 2].map((i) => (
                    <motion.span
                      key={`ring-l-${i}`}
                      aria-hidden
                      className="absolute rounded-full border"
                      style={{ borderColor: 'rgba(255,90,95,0.45)', width: 192, height: 192 }}
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.55, opacity: 0 }}
                      transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut', delay: i * 0.63 }}
                    />
                  ))}

                {/* speaking — faster pulse */}
                {state === 'speaking' &&
                  [0, 1].map((i) => (
                    <motion.span
                      key={`ring-s-${i}`}
                      aria-hidden
                      className="absolute rounded-full border"
                      style={{ borderColor: 'rgba(245,166,35,0.5)', width: 192, height: 192 }}
                      initial={{ scale: 1, opacity: 0.55 }}
                      animate={{ scale: 1.38, opacity: 0 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut', delay: i * 0.6 }}
                    />
                  ))}

                {/* thinking — slow rotating gradient ring */}
                {state === 'thinking' && (
                  <div
                    aria-hidden
                    className="absolute animate-spin rounded-full"
                    style={{
                      width: 208,
                      height: 208,
                      animationDuration: '5.5s',
                      background:
                        'conic-gradient(from 0deg, rgba(245,166,35,0) 0deg, rgba(245,166,35,0.65) 80deg, rgba(255,90,95,0.8) 180deg, rgba(255,42,104,0.65) 280deg, rgba(255,42,104,0) 360deg)',
                      WebkitMask:
                        'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
                    }}
                  />
                )}

                {/* the disc — speaking pulse + mic-level scale on separate layers */}
                <motion.div
                  className="relative z-10"
                  animate={state === 'speaking' ? { scale: [1, 1.045, 1] } : { scale: 1 }}
                  transition={
                    state === 'speaking'
                      ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.3 }
                  }
                >
                  {/* mic-level scale layer — driven directly by the rAF loop */}
                  <div ref={orbScaleRef} style={{ transition: 'transform 0.12s ease-out' }}>
                    <div
                      className="relative flex items-center justify-center overflow-hidden rounded-full border border-border"
                      style={{
                        width: 184,
                        height: 184,
                        background:
                          'radial-gradient(circle at 50% 32%, rgba(255,90,95,0.18), rgba(24,10,14,0.92) 72%)',
                        boxShadow:
                          '0 0 90px -18px rgba(255,90,95,0.45), inset 0 1px 0 rgba(255,255,255,0.09)',
                      }}
                    >
                      {state === 'thinking' && (
                        <div aria-hidden className="nx-shimmer absolute inset-0 rounded-full" />
                      )}
                      <BrandMark size={116} className="relative z-10" />
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* waveform — real mic analyser, synthetic while speaking/thinking */}
              <div
                ref={waveRef}
                aria-hidden
                className="mt-6 flex h-9 items-center gap-[3px]"
              >
                {Array.from({ length: WAVE_BARS }).map((_, i) => (
                  <span
                    key={i}
                    className="h-full w-[3px] rounded-full"
                    style={{
                      background: 'linear-gradient(to top, #ff2a68, #ff5a5f 60%, #f5a623)',
                      transform: 'scaleY(0.12)',
                      transformOrigin: 'center',
                      opacity: 0.85,
                    }}
                  />
                ))}
              </div>

              {/* status */}
              <div className="mt-4 flex items-center gap-2" aria-live="polite">
                <p className="text-sm font-medium text-muted-foreground">{statusLabel}</p>
                {state === 'speaking' && (
                  <span className="flex items-end gap-1" aria-hidden>
                    <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                    <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                    <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                  </span>
                )}
              </div>

              {noSpeech && (
                <p className="mt-1.5 text-center text-xs italic text-muted-foreground/80">
                  Didn&apos;t catch that — take your time, still listening.
                </p>
              )}
              {error && !micDenied && (
                <p className="mt-1.5 max-w-sm text-center text-xs text-red-400/90">{error}</p>
              )}

              {/* mic denied — friendly fallback message (text input is always below) */}
              {micDenied && (
                <div className="nx-rise mt-3 flex max-w-md items-start gap-2.5 rounded-2xl border border-[#f5a623]/25 bg-[#f5a623]/10 px-3.5 py-2.5 text-left">
                  <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-[#f5a623]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {inIframe
                        ? 'The microphone is blocked in this preview frame. Open the app in a new tab to talk — voice mode starts instantly there.'
                        : 'Microphone access is blocked. Allow the mic in your browser to talk — or type below and NEXUS will still reply out loud.'}
                    </p>
                    {inIframe && (
                      <a
                        href={
                          typeof window !== 'undefined'
                            ? `${window.location.origin}${window.location.pathname}?voice=1`
                            : '#'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#f5a623]/40 bg-[#f5a623]/15 px-3 text-xs font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/25"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Open voice in a new tab
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* live captions — interim transcript while listening, reply while speaking */}
              <div className="mt-3 flex min-h-[30px] w-full max-w-md flex-col items-center">
                <AnimatePresence mode="wait">
                  {state === 'listening' && interim ? (
                    <motion.p
                      key="interim"
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center text-lg italic leading-snug text-muted-foreground"
                    >
                      {interim}
                    </motion.p>
                  ) : (state === 'speaking' || state === 'thinking') && caption ? (
                    <motion.p
                      key="caption"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-center text-base leading-relaxed text-foreground"
                      style={{
                        maxHeight: '4.4em',
                        overflow: 'hidden',
                        maskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
                      }}
                    >
                      {caption}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* compact conversation log — last turns, older fading */}
              {recentTurns.length > 0 && (
                <div ref={logRef} className="nx-scroll mt-4 max-h-[20vh] w-full max-w-lg overflow-y-auto pr-1">
                  {recentTurns.map((t, i) => (
                    <div
                      key={t.id}
                      className="nx-rise mb-3 text-center last:mb-0"
                      style={{
                        opacity: recentTurns.length === 1 ? 1 : 0.3 + (0.7 * (i + 1)) / recentTurns.length,
                      }}
                    >
                      <p className="text-sm font-medium text-foreground">{t.user}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{t.reply}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* text fallback — always available ("type instead") */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendText()
            }}
            className="nx-composer mx-auto mb-2 flex w-full max-w-md items-center gap-2 rounded-2xl p-1.5 pl-4"
          >
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={micDenied ? 'Type a message — NEXUS will reply out loud…' : 'Type instead…'}
              aria-label="Type a message for NEXUS"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || busy}
              aria-label="Send message"
              className="nx-gradient-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          {/* Bottom controls */}
          <div
            className="relative z-10 flex items-center justify-between gap-4 px-6 sm:px-10"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            {/* language picker */}
            <div className="relative">
              <AnimatePresence>
                {showLangs && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="nx-glow-card absolute bottom-14 left-0 z-20 w-72 p-2.5"
                    style={{ background: 'rgba(16,10,13,0.97)' }}
                    role="menu"
                    aria-label="Choose language"
                  >
                    <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                      Language
                    </p>
                    <div className="nx-scroll grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => pickLanguage(l)}
                          role="menuitemradio"
                          aria-checked={lang === l.code}
                          className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                            lang === l.code
                              ? 'font-semibold text-white'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                          }`}
                          style={lang === l.code ? { background: 'rgba(255,90,95,0.22)' } : undefined}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => setShowLangs((v) => !v)}
                aria-label="Change language"
                aria-expanded={showLangs}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-accent/50 text-muted-foreground transition hover:border-border hover:bg-accent"
              >
                <Globe className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                disabled={micDenied}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={muted}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition disabled:opacity-40 ${
                  muted
                    ? 'border-[#ff5a5f]/50 bg-[#ff5a5f]/15 text-[#ff8a8d]'
                    : 'border-border bg-accent/50 text-foreground hover:bg-accent'
                }`}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="End voice session"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e5484d] text-white shadow-[0_8px_30px_-6px_rgba(229,72,77,0.6)] transition hover:bg-[#f0555a]"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>

          <audio ref={audioRef} className="hidden" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
