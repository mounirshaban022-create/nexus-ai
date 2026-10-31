'use client'

/**
 * NEXUS One — real-time AI voice call (phone-call experience).
 *
 * A live call with the AI, powered by the voice-call socket.io mini-service
 * (port 3003 through the gateway — NEVER an absolute URL with a port):
 *
 *   LISTEN : getUserMedia (echoCancellation + noiseSuppression) → an
 *            AnalyserNode RMS VAD segments the mic into utterances; each
 *            segment is recorded with MediaRecorder (webm/opus), base64'd
 *            and emitted as `call:segment`.
 *   THINK  : the server runs ASR → LLM (short spoken persona) and streams
 *            back `call:transcript` captions, `call:state` phases and
 *            sequential `call:audio` wav chunks (sentence-sized).
 *   SPEAK  : chunks are queued and played one-by-one through the shared
 *            AudioContext (decodeAudioData → BufferSource, with an
 *            <audio> element fallback). Barge-in: sustained mic RMS above
 *            a loud threshold while the AI speaks (or the stop button)
 *            clears the queue and emits `call:interrupt`.
 *
 * Graceful degradation: when the mic is unavailable (embedded iframes,
 * exotic browsers) the call becomes a captions mode — typed text goes out
 * as `call:text` and spoken replies still play. Socket drops show an
 * offline chip and rely on socket.io auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'
import {
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Send,
  Square,
} from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import {
  browserSpeak,
  speechRecognitionSupported,
  speechSynthesisSupported,
  startDictation,
  type DictationHandle,
  type SpeakHandle,
} from '@/lib/browser-speech'
import { BrandMark, BRAND } from './shared'

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type CallPhase = 'connecting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'ended'
type MicState = 'pending' | 'ok' | 'denied'

interface CaptionEntry {
  id: number
  role: 'user' | 'assistant'
  text: string
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
}

/** The call speaks with a premium Z.ai neural voice (the mini-service
 *  synthesizes wav via zai.audio.tts — Edge/Kokoro voices don't apply here). */
const CALL_VOICE = 'tongtong'

/** Through the gateway ONLY — never an absolute URL with a port. */
const CALL_CONNECTION_URL = '/?XTransformPort=3003'

/* VAD tuning (mirrors the proven values in voice-overlay.tsx, tightened
 * for turn-taking: a phone call wants faster segment closures). */
const SPEECH_START_MS = 150 // sustained speech before a segment opens
const SILENCE_END_MS = 700 // trailing silence that closes a segment
const MIN_SEGMENT_MS = 400 // shorter segments are discarded
const MAX_SEGMENT_MS = 30_000 // hard cap so a stuck recorder can't run forever
const BARGE_MS = 250 // sustained loud mic input that interrupts the AI

/* ------------------------------------------------------------------ */
/* Pure helpers (module scope)                                         */
/* ------------------------------------------------------------------ */

/** mm:ss call-timer formatting. */
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Blob → raw base64 (data-URL prefix stripped). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      const idx = url.indexOf(',')
      resolve(idx >= 0 ? url.slice(idx + 1) : url)
    }
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}

/** base64 → ArrayBuffer (for decodeAudioData). */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/**
 * Plays one base64 wav chunk end-to-end. Prefers WebAudio
 * (decodeAudioData → BufferSource) for gapless, low-latency playback and
 * falls back to an <audio> data-URL element on decode failure. Resolves
 * when the chunk finished (or was stopped via the provided stop handle).
 */
async function playWavBase64(
  b64: string,
  ctx: AudioContext | null,
  setStop: (stop: () => void) => void
): Promise<void> {
  if (ctx && ctx.state !== 'closed') {
    try {
      const audioBuffer = await ctx.decodeAudioData(base64ToArrayBuffer(b64))
      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        let finished = false
        const done = () => {
          if (!finished) {
            finished = true
            resolve()
          }
        }
        source.onended = done
        setStop(() => {
          try {
            source.stop()
          } catch {
            /* already stopped */
          }
          done()
        })
        source.start()
      })
      return
    } catch {
      /* decode failed (browser quirk) — fall through to the element path */
    }
  }
  await new Promise<void>((resolve) => {
    const el = new Audio(`data:audio/wav;base64,${b64}`)
    let finished = false
    const done = () => {
      if (!finished) {
        finished = true
        el.removeAttribute('src')
        resolve()
      }
    }
    el.onended = done
    el.onerror = done
    setStop(() => {
      el.pause()
      done()
    })
    void el.play().catch(done)
  })
}

/* ------------------------------------------------------------------ */
/* VoiceCallMode                                                       */
/* ------------------------------------------------------------------ */

export function VoiceCallMode({ onExit }: { onExit: () => void }) {
  /* ---------------------------- UI state ---------------------------- */
  const [phase, setPhase] = useState<CallPhase>('connecting')
  const [connected, setConnected] = useState(false)
  const [micAvailable, setMicAvailable] = useState<MicState>('pending')
  const [muted, setMuted] = useState(false)
  const [captions, setCaptions] = useState<CaptionEntry[]>([])
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [exchanges, setExchanges] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [finalDuration, setFinalDuration] = useState(0)
  const [notice, setNotice] = useState('')
  const [callError, setCallError] = useState('')
  const [draft, setDraft] = useState('')
  /** ON-DEVICE VOICE — active when the call mini-service is unreachable
   *  (Vercel & any host without the sandbox gateway). The browser's own
   *  Web Speech API runs recognition + synthesis; the brain is /api/chat. */
  const [browserMode, setBrowserMode] = useState(false)
  const [interim, setInterim] = useState('')

  /* --------------------------- refs (engine) ------------------------ */
  const socketRef = useRef<Socket | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingRef = useRef(false)
  const discardNextRef = useRef(false)
  const recordStartRef = useRef(0)
  const lastSoundRef = useRef(0)
  const speechMsRef = useRef(0)
  const noiseRef = useRef({ samples: 0, sum: 0, floor: 0 })
  const rafRef = useRef(0)
  const queueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const playbackStopRef = useRef<(() => void) | null>(null)
  const startedAtRef = useRef(0)
  const callReadyRef = useRef(false)
  const micOkRef = useRef(false)
  const mutedRef = useRef(false)
  const phaseRef = useRef<CallPhase>('connecting')
  const captionIdRef = useRef(0)
  const discardRecordingRef = useRef<(() => void) | null>(null)
  const bargeInRef = useRef<((manual?: boolean) => void) | null>(null)
  const browserModeRef = useRef(false)
  const dictationRef = useRef<DictationHandle | null>(null)
  const speakHandleRef = useRef<SpeakHandle | null>(null)
  const sessionIdRef = useRef<string | undefined>(undefined)
  const turnBusyRef = useRef(false)
  const browserTurnRef = useRef<((text: string) => Promise<void>) | null>(null)

  /** Mic RMS → orb pulse (spring-smoothed; only driven while listening). */
  const levelMotion = useMotionValue(0)
  const levelSpring = useSpring(levelMotion, { stiffness: 140, damping: 18 })
  const orbScale = useTransform(levelSpring, [0, 0.5], [1, 1.12])

  /** Single source of truth for phase — refs mirror it for the rAF loop. */
  const goPhase = useCallback((p: CallPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  /** One shared AudioContext for the mic analyser AND playback. */
  const ensureAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        audioCtxRef.current = new Ctor()
      }
      return audioCtxRef.current
    } catch {
      return null
    }
  }, [])

  /** Push a finished transcript turn into captions (keep last 3) + the
   *  full-call transcript log used by the end-of-call summary. */
  const pushTurn = useCallback((role: 'user' | 'assistant', text: string) => {
    captionIdRef.current += 1
    setCaptions((prev) => [...prev.slice(-2), { id: captionIdRef.current, role, text }])
    setTranscript((prev) => [...prev, { role, text }])
    if (role === 'assistant') setExchanges((n) => n + 1)
  }, [])

  /* ------------------------ playback queue -------------------------- */

  const stopPlayback = useCallback(() => {
    queueRef.current = []
    playbackStopRef.current?.()
    playbackStopRef.current = null
    playingRef.current = false
  }, [])

  /** Drains the received `call:audio` chunk queue sequentially. The AI is
   *  "speaking" from the first queued chunk until the queue drains. */
  const pumpQueue = useCallback(async () => {
    if (playingRef.current) return
    playingRef.current = true
    try {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {})
      while (queueRef.current.length > 0) {
        if (phaseRef.current === 'ended') break
        const b64 = queueRef.current[0] ?? ''
        if (!b64) break
        queueRef.current.shift()
        await playWavBase64(b64, ctx, (stop) => {
          playbackStopRef.current = stop
        })
      }
    } finally {
      playingRef.current = false
      playbackStopRef.current = null
      // Server sets "listening" after emitting its LAST chunk — we only
      // downgrade the UI once playback actually drained (never mid-play).
      if (queueRef.current.length === 0 && phaseRef.current === 'speaking') {
        goPhase('listening')
      }
    }
  }, [ensureAudioCtx, goPhase])

  /* ------------------------ mic VAD engine -------------------------- */

  /** Starts the single persistent rAF loop that drives: noise-floor
   *  calibration, the orb level meter, segment open/close, and barge-in.
   *  All state lives in refs so the loop never goes stale. */
  const startVadLoop = useCallback(() => {
    if (rafRef.current) return
    const data = new Float32Array(1024) // matches analyser.fftSize
    let bargeMs = 0
    let lastFrame = performance.now()

    /** Stop the active recorder WITHOUT emitting (mute / phase change). */
    const discardRecording = () => {
      const rec = recorderRef.current
      if (rec && rec.state === 'recording') {
        discardNextRef.current = true
        chunksRef.current = []
        try {
          rec.stop()
        } catch {
          /* already stopped */
        }
      }
      recorderRef.current = null
      recordingRef.current = false
      speechMsRef.current = 0
    }
    discardRecordingRef.current = discardRecording

    /** Barge-in: cut AI audio, tell the server, return to listening. */
    const bargeIn = (manual = false) => {
      stopPlayback()
      discardRecording()
      if (manual) setNotice('')
      goPhase('listening')
      socketRef.current?.emit('call:interrupt')
    }
    bargeInRef.current = bargeIn

    const emitSegment = async (blob: Blob) => {
      const socket = socketRef.current
      if (!socket || !socket.connected || mutedRef.current || !callReadyRef.current) return
      try {
        const b64 = await blobToBase64(blob)
        if (!b64) return
        goPhase('transcribing') // optimistic — the server confirms immediately
        socket.emit('call:segment', { audio: b64 })
      } catch {
        /* unreadable blob — skip the segment silently */
      }
    }

    const startSegment = (fromMs: number) => {
      const stream = micStreamRef.current
      if (!stream || typeof MediaRecorder === 'undefined' || recordingRef.current) return
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      let rec: MediaRecorder
      try {
        rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      } catch {
        return
      }
      recorderRef.current = rec
      chunksRef.current = []
      discardNextRef.current = false
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const discard = discardNextRef.current
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        recorderRef.current = null
        recordingRef.current = false
        if (discard || blob.size < 800) return
        void emitSegment(blob)
      }
      rec.start(250)
      recordingRef.current = true
      recordStartRef.current = fromMs
      lastSoundRef.current = fromMs
    }

    const finishSegment = (emit: boolean) => {
      const rec = recorderRef.current
      if (!rec) return
      if (!emit) {
        discardRecording()
        return
      }
      if (rec.state === 'recording') {
        try {
          rec.stop() // onstop assembles the blob and emits it
        } catch {
          discardRecording()
        }
      } else {
        discardRecording()
      }
    }

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const analyser = analyserRef.current
      if (!analyser) return
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i]
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      const now = performance.now()
      const dt = Math.min(60, now - lastFrame)
      lastFrame = now

      // Adaptive noise floor — calibrated on the first ~600ms of ambient audio.
      const noise = noiseRef.current
      if (noise.samples < 36) {
        noise.sum += rms
        noise.samples += 1
        if (noise.samples === 36) noise.floor = Math.max(0.002, noise.sum / 36)
      }
      const floor = noise.samples >= 36 ? noise.floor : 0.012

      // Orb level meter — driven only while listening; zero otherwise.
      levelMotion.set(
        mutedRef.current || phaseRef.current !== 'listening'
          ? 0
          : Math.min(0.5, Math.max(0, rms * 2.2 - floor))
      )

      /* While the AI speaks: barge-in on sustained loud mic input.
       * echoCancellation removes the correlated TTS audio; residual noise
       * sits well below this raised threshold. */
      if (phaseRef.current === 'speaking') {
        const speakThreshold = Math.max(0.045, floor * 4)
        if (rms > speakThreshold) {
          bargeMs += dt
          if (bargeMs >= BARGE_MS) {
            bargeMs = 0
            bargeIn(false)
          }
        } else {
          bargeMs = 0
        }
        if (recordingRef.current) discardRecording()
        return
      }

      const listening =
        callReadyRef.current &&
        !mutedRef.current &&
        micOkRef.current &&
        phaseRef.current === 'listening'
      if (!listening) {
        if (recordingRef.current) discardRecording()
        speechMsRef.current = Math.max(0, speechMsRef.current - dt)
        return
      }

      const threshold = Math.max(0.012, floor * 2.5)
      if (rms > threshold) {
        speechMsRef.current += dt
        if (!recordingRef.current) {
          if (speechMsRef.current >= SPEECH_START_MS) startSegment(now - speechMsRef.current)
        } else {
          lastSoundRef.current = now
        }
      } else {
        speechMsRef.current = Math.max(0, speechMsRef.current - dt)
      }
      if (recordingRef.current) {
        const dur = now - recordStartRef.current
        if (now - lastSoundRef.current > SILENCE_END_MS) finishSegment(dur >= MIN_SEGMENT_MS)
        else if (dur > MAX_SEGMENT_MS) finishSegment(true)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [goPhase, levelMotion, stopPlayback])

  /** Releases the mic + VAD loop (end call / unmount / call-again reset). */
  const teardownMic = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    discardRecordingRef.current?.()
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    try {
      micSourceRef.current?.disconnect()
    } catch {
      /* already disconnected */
    }
    micSourceRef.current = null
    analyserRef.current = null
    micOkRef.current = false
  }, [])

  /** Acquires the mic and starts the VAD loop. Resolves false when the mic
   *  is unavailable (embedded iframes) → the UI degrades to captions mode. */
  const startMic = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicAvailable('denied')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      const ctx = ensureAudioCtx()
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop())
        setMicAvailable('denied')
        return false
      }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      micStreamRef.current = stream
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      micSourceRef.current = source
      analyserRef.current = analyser
      noiseRef.current = { samples: 0, sum: 0, floor: 0 } // recalibrate per session
      micOkRef.current = true
      setMicAvailable('ok')
      startVadLoop()
      return true
    } catch {
      micOkRef.current = false
      setMicAvailable('denied')
      return false
    }
  }, [ensureAudioCtx, startVadLoop])

  /* ------------------- ON-DEVICE VOICE ENGINE ----------------------- */
  /* When the voice-call mini-service is unreachable (Vercel and every   */
  /* host without the sandbox gateway), the call switches to the         */
  /* browser's built-in Web Speech API: recognition listens, /api/chat   */
  /* thinks (the exact same engine normal chat uses), and                */
  /* speechSynthesis speaks — no server-side voice infrastructure.       */

  const pauseDictation = useCallback(() => {
    dictationRef.current?.stop()
    dictationRef.current = null
    setInterim('')
  }, [])

  const startBrowserDictation = useCallback(() => {
    if (!browserModeRef.current || mutedRef.current) return
    if (!speechRecognitionSupported()) return
    if (dictationRef.current) return
    dictationRef.current = startDictation({
      onFinal: (text) => {
        void browserTurnRef.current?.(text)
      },
      onInterim: (t) => setInterim(t),
      onError: (code) => {
        // Hard mic/permission failures degrade to captions mode — typed
        // input still reaches the AI and replies are still spoken.
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
          setMicAvailable('denied')
          pauseDictation()
        }
      },
    })
  }, [pauseDictation])

  const browserTurn = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || turnBusyRef.current) return
      turnBusyRef.current = true
      pauseDictation() // turn-taking: the mic pauses while NEXUS thinks/speaks
      pushTurn('user', text)
      goPhase('thinking')

      let reply = ''
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.slice(0, 8000),
            ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          }),
        })
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error || 'The AI could not answer — try again.')
        }
        // Consume the NDJSON stream (same wire format as the chat view).
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t) continue
            let ev: { type?: string; delta?: string; sessionId?: string; message?: string }
            try {
              ev = JSON.parse(t) as typeof ev
            } catch {
              continue
            }
            if (ev.type === 'assistant_delta' && typeof ev.delta === 'string') {
              reply += ev.delta
            } else if (ev.type === 'done' && typeof ev.sessionId === 'string') {
              sessionIdRef.current = ev.sessionId
            } else if (ev.type === 'error') {
              throw new Error(ev.message || 'The AI could not answer — try again.')
            }
          }
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'The AI could not answer — try again.')
        turnBusyRef.current = false
        if (phaseRef.current !== 'ended') {
          goPhase('listening')
          startBrowserDictation()
        }
        return
      }
      turnBusyRef.current = false

      // Speak the reply — strip markdown noise so it reads naturally.
      const clean = reply
        .replace(/```[\s\S]*?```/g, ' Code omitted. ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_#>`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!clean || phaseRef.current === 'ended') {
        if (phaseRef.current !== 'ended') {
          goPhase('listening')
          startBrowserDictation()
        }
        return
      }
      pushTurn('assistant', clean)
      goPhase('speaking')
      const { done, handle } = browserSpeak(clean, { lang: navigator.language || 'en-US' })
      speakHandleRef.current = handle
      await done
      speakHandleRef.current = null
      if (phaseRef.current === 'ended') return
      goPhase('listening')
      startBrowserDictation()
    },
    [goPhase, pauseDictation, pushTurn, startBrowserDictation]
  )

  useEffect(() => {
    browserTurnRef.current = browserTurn
  }, [browserTurn])

  /** Switch the call to on-device voice — invoked when the call service
   *  can't be reached (no sandbox gateway → Vercel & friends). */
  const enterBrowserMode = useCallback(() => {
    if (browserModeRef.current) return
    browserModeRef.current = true
    setBrowserMode(true)
    // The socket path is dead on this host — stop the reconnect loop.
    try {
      socketRef.current?.removeAllListeners()
      socketRef.current?.disconnect()
    } catch {
      /* already gone */
    }
    socketRef.current = null
    // The recognizer manages the mic itself; the VAD/MediaRecorder
    // pipeline is unnecessary here.
    micOkRef.current = false
    setMicAvailable(speechRecognitionSupported() ? 'ok' : 'denied')
    // Barge-in = cancel synthesis + resume listening.
    bargeInRef.current = () => {
      speakHandleRef.current?.cancel()
      speakHandleRef.current = null
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* not speaking */
      }
      if (phaseRef.current === 'ended') return
      goPhase('listening')
      startBrowserDictation()
    }
    if (!speechSynthesisSupported()) {
      setNotice('This browser cannot speak aloud — replies will appear as captions only.')
    }
    startedAtRef.current = Date.now()
    setSeconds(0)
    goPhase('listening')
    startBrowserDictation()
  }, [goPhase, startBrowserDictation])

  /* --------------------------- call actions ------------------------- */

  const endCall = useCallback(() => {
    socketRef.current?.emit('call:end')
    pauseDictation()
    speakHandleRef.current?.cancel()
    speakHandleRef.current = null
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* not speaking */
    }
    stopPlayback()
    teardownMic()
    setFinalDuration(
      startedAtRef.current ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)) : 0
    )
    goPhase('ended')
  }, [goPhase, pauseDictation, stopPlayback, teardownMic])

  const callAgain = useCallback(() => {
    setCaptions([])
    setTranscript([])
    setExchanges(0)
    setSeconds(0)
    setFinalDuration(0)
    setNotice('')
    setCallError('')
    startedAtRef.current = 0
    queueRef.current = []
    goPhase('connecting')
    if (browserModeRef.current) {
      // On-device voice — no call service to dial, just resume listening.
      startedAtRef.current = Date.now()
      setSeconds(0)
      goPhase('listening')
      startBrowserDictation()
      return
    }
    // If the socket happens to be down, the 'connect' handler re-emits this.
    socketRef.current?.emit('call:start', { voice: CALL_VOICE })
    void startMic()
  }, [goPhase, startBrowserDictation, startMic])

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    if (browserModeRef.current) {
      if (next) {
        pauseDictation()
        speakHandleRef.current?.cancel()
        speakHandleRef.current = null
        try {
          window.speechSynthesis?.cancel()
        } catch {
          /* not speaking */
        }
      } else {
        startBrowserDictation()
      }
      return
    }
    if (next) discardRecordingRef.current?.() // drop any half-recorded segment
  }, [pauseDictation, startBrowserDictation])

  /** Typed fallback (`call:text`) — captions-only mode when the mic is gone.
   *  In on-device (browser) mode the same input runs over plain HTTP. */
  const sendText = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) return
      if (browserModeRef.current) {
        void browserTurnRef.current?.(text)
        return
      }
      const socket = socketRef.current
      if (!socket || !socket.connected) return
      pushTurn('user', text)
      goPhase('thinking')
      socket.emit('call:text', { text: text.slice(0, 2000) })
    },
    [goPhase, pushTurn]
  )

  /* ------------------------- socket lifecycle ----------------------- */

  useEffect(() => {
    const socket = io(CALL_CONNECTION_URL, {
      path: '/', // fixed by the gateway — matches the mini-service
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
    })
    socketRef.current = socket

    // BROWSER-MODE WATCHDOG: on hosts without the voice mini-service
    // (Vercel — any plain Node host) the socket never connects and the
    // call would hang on "Connecting…" forever. After a short grace
    // period the call switches to the browser's own Web Speech engine
    // over plain HTTP, which works everywhere with zero configuration.
    const fallbackTimer = window.setTimeout(() => {
      if (!socket.connected && !browserModeRef.current) enterBrowserMode()
    }, 4500)

    socket.on('connect', () => {
      window.clearTimeout(fallbackTimer)
      if (browserModeRef.current) {
        socket.disconnect() // on-device voice owns this call now
        return
      }
      setConnected(true)
      socket.emit('call:start', { voice: CALL_VOICE })
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('call:ready', (raw: unknown) => {
      const ok = (raw as { ok?: unknown } | null)?.ok === true
      if (!ok) {
        setCallError('The call service refused the connection. Please try again.')
        goPhase('ended')
        return
      }
      startedAtRef.current = Date.now()
      setSeconds(0)
      goPhase('listening')
    })

    socket.on('call:state', (raw: unknown) => {
      const p = (raw as { phase?: unknown } | null)?.phase
      if (phaseRef.current === 'ended') return
      if (p === 'listening') {
        // Keep "Speaking…" until the audio queue actually drains.
        if (!playingRef.current && queueRef.current.length === 0) goPhase('listening')
        return
      }
      if (p === 'transcribing' || p === 'thinking' || p === 'speaking') {
        goPhase(p)
      }
    })

    socket.on('call:transcript', (raw: unknown) => {
      const payload = raw as { role?: unknown; text?: unknown } | null
      const role = payload?.role
      const text = payload?.text
      if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || !text.trim()) return
      pushTurn(role, text.trim())
    })

    socket.on('call:audio', (raw: unknown) => {
      const b64 = (raw as { b64?: unknown } | null)?.b64
      if (typeof b64 !== 'string' || !b64 || phaseRef.current === 'ended') return
      queueRef.current.push(b64)
      void pumpQueue()
    })

    socket.on('call:error', (raw: unknown) => {
      const message = (raw as { message?: unknown } | null)?.message
      if (typeof message === 'string' && message) setNotice(message)
      if (phaseRef.current !== 'ended') goPhase('listening')
    })

    if (!browserModeRef.current) void startMic()

    return () => {
      window.clearTimeout(fallbackTimer)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      dictationRef.current?.stop()
      dictationRef.current = null
      speakHandleRef.current?.cancel()
      speakHandleRef.current = null
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* not speaking */
      }
      stopPlayback()
      teardownMic()
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
    }
  }, [enterBrowserMode, goPhase, pumpQueue, pushTurn, startMic, stopPlayback, teardownMic])

  /* --------------------------- call timer --------------------------- */

  useEffect(() => {
    if (phase === 'ended' || phase === 'connecting' || !startedAtRef.current) return
    const t = window.setInterval(() => {
      setSeconds(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)))
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase])

  /* ------------------------------ render ---------------------------- */

  const duration = phase === 'ended' ? finalDuration : seconds
  const statusText =
    phase === 'connecting'
      ? 'Connecting…'
      : !connected && !browserMode
        ? 'Reconnecting…'
        : phase === 'listening'
          ? muted
            ? 'Muted — mic off'
            : micAvailable === 'denied'
              ? 'Captions mode — type below'
              : 'Listening…'
          : phase === 'transcribing'
            ? 'Understanding…'
            : phase === 'thinking'
              ? 'Thinking…'
              : phase === 'speaking'
                ? 'Speaking…'
                : 'Call ended'

  const submitDraft = () => {
    if (!draft.trim()) return
    sendText(draft)
    setDraft('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0b0a09] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="NEXUS voice call"
    >
      <style>{`
        .vc-scroll::-webkit-scrollbar { width: 6px; }
        .vc-scroll::-webkit-scrollbar-track { background: transparent; }
        .vc-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 9999px; }
      `}</style>

      {/* Ambient warm glows — the call "stage" */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 42% at 50% 28%, ${hexToRgba(BRAND.c2, 0.09)} 0%, transparent 70%), radial-gradient(42% 30% at 82% 84%, ${hexToRgba(BRAND.c1, 0.06)} 0%, transparent 70%)`,
        }}
      />

      {/* Header: identity + timer + reconnect chip */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <BrandMark size={30} className="drop-shadow-[0_2px_8px_rgba(255,90,95,0.35)]" />
          <div>
            <p className="text-sm font-semibold leading-tight">NEXUS</p>
            <p className="text-[11px] leading-tight text-white/45">Voice call</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {browserMode && phase !== 'ended' && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              On-device voice
            </span>
          )}
          {!browserMode && !connected && phase !== 'ended' && (
            <span className="flex items-center gap-1.5 rounded-full border border-[#f5a623]/30 bg-[#f5a623]/10 px-3 py-1 text-[11px] text-[#f5a623]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f5a623]" />
              Reconnecting…
            </span>
          )}
          <span
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tabular-nums text-white/70"
            aria-label={`Call duration ${formatDuration(duration)}`}
          >
            {formatDuration(duration)}
          </span>
        </div>
      </header>

      {/* Center stage: orb + status */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <div className="relative flex h-52 w-52 items-center justify-center sm:h-64 sm:w-64">
          {/* ambient halo */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${hexToRgba(BRAND.c2, 0.28)} 0%, transparent 65%)`,
            }}
            animate={{
              opacity: phase === 'speaking' ? 0.9 : phase === 'listening' ? 0.55 : 0.35,
              scale: phase === 'speaking' ? 1.12 : 1,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
          {/* spin ring — rotates while the AI speaks */}
          <motion.div
            className="absolute inset-2 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${BRAND.c2} 110deg, ${BRAND.c1} 180deg, transparent 260deg)`,
              WebkitMaskImage: 'radial-gradient(circle, transparent 62%, black 66%)',
              maskImage: 'radial-gradient(circle, transparent 62%, black 66%)',
              filter: 'blur(1px)',
            }}
            animate={{ rotate: phase === 'speaking' ? 360 : 0, opacity: phase === 'speaking' ? 1 : 0.35 }}
            transition={
              phase === 'speaking'
                ? { repeat: Infinity, duration: 2.2, ease: 'linear' }
                : { duration: 0.4 }
            }
          />
          {/* glow ring */}
          <motion.div
            className="absolute inset-4 rounded-full"
            animate={{
              boxShadow:
                phase === 'speaking'
                  ? `0 0 90px 18px ${hexToRgba(BRAND.c2, 0.35)}`
                  : phase === 'listening'
                    ? `0 0 50px 6px ${hexToRgba(BRAND.c2, 0.18)}`
                    : `0 0 30px 2px ${hexToRgba(BRAND.c2, 0.1)}`,
            }}
            transition={{ duration: 0.5 }}
          />
          {/* gradient disc — mic-driven pulse while listening, timed pulse while speaking */}
          <motion.div style={{ scale: orbScale }}>
            <motion.div
              className="relative flex h-32 w-32 items-center justify-center rounded-full sm:h-36 sm:w-36"
              style={{ background: BRAND.gradient }}
              animate={phase === 'speaking' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={
                phase === 'speaking'
                  ? { repeat: Infinity, duration: 0.9, ease: 'easeInOut' }
                  : { duration: 0.3 }
              }
            >
              <div className="absolute inset-[3px] rounded-full shadow-[inset_0_-8px_24px_rgba(0,0,0,0.25)]" />
              <BrandMark
                size={60}
                className="relative drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
              />
            </motion.div>
          </motion.div>
        </div>

        <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
          {phase === 'connecting' && (
            <Loader2 className="h-4 w-4 animate-spin text-white/50" aria-hidden />
          )}
          <p className="text-sm font-medium text-white/70">{statusText}</p>
          {browserMode && interim && phase === 'listening' && micAvailable !== 'denied' && (
            <p className="max-w-xs truncate text-center text-xs text-white/45">“{interim}”</p>
          )}
          {notice && phase !== 'ended' && (
            <p className="max-w-xs text-center text-xs text-[#f5a623]">{notice}</p>
          )}
          {micAvailable === 'denied' && phase !== 'ended' && (
            <p className="max-w-xs text-center text-xs text-white/40">
              Mic unavailable here — use captions mode below. You’ll still hear the replies.
            </p>
          )}
        </div>
      </main>

      {/* Live captions — last user utterance + the assistant reply */}
      <section
        className="relative z-10 mx-auto w-full max-w-2xl space-y-1.5 px-4 pb-2"
        role="status"
        aria-live="polite"
        aria-label="Live call captions"
      >
        {captions.slice(-3).map((c, i, arr) => {
          const isUser = c.role === 'user'
          const newest = i === arr.length - 1
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: newest ? 1 : 0.4, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                  isUser
                    ? 'border border-white/10 bg-white/[0.07] text-white/90'
                    : 'border border-[#ff5a5f]/20 bg-[#ff5a5f]/[0.09] text-white/90'
                }`}
              >
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-white/40">
                  {isUser ? 'You' : 'NEXUS'}
                </span>
                <p className="line-clamp-2">{c.text}</p>
              </div>
            </motion.div>
          )
        })}
      </section>

      {/* Captions-mode input (mic denied / embedded iframes) */}
      {micAvailable === 'denied' && phase !== 'ended' && (
        <form
          className="relative z-10 mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-1"
          onSubmit={(e) => {
            e.preventDefault()
            submitDraft()
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type to NEXUS…"
            aria-label="Type a message to NEXUS"
            className="h-11 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/35 focus:border-[#ff5a5f]/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || (!browserMode && !connected)}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ background: BRAND.gradient }}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      )}

      {/* Controls row */}
      {phase !== 'ended' && (
        <footer className="relative z-10 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
              className={`grid h-14 w-14 place-items-center rounded-full border transition-colors ${
                muted
                  ? 'border-[#f5a623]/40 bg-[#f5a623]/15 text-[#f5a623]'
                  : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
              }`}
            >
              {muted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
            </button>

            <button
              type="button"
              onClick={() => bargeInRef.current?.(true)}
              disabled={phase !== 'speaking'}
              aria-label="Stop AI speech (interrupt)"
              className={`grid h-14 w-14 place-items-center rounded-full border transition-colors disabled:opacity-30 ${
                phase === 'speaking'
                  ? 'border-[#ff5a5f]/40 bg-[#ff5a5f]/15 text-white hover:bg-[#ff5a5f]/25'
                  : 'border-white/15 bg-white/5 text-white/80'
              }`}
            >
              <Square className="h-5 w-5" aria-hidden />
            </button>

            <button
              type="button"
              onClick={endCall}
              aria-label="End call"
              className="grid h-16 w-16 place-items-center rounded-full bg-[#e5484d] text-white shadow-lg shadow-[#ff5a5f]/25 transition-colors hover:bg-[#ff5a5f]"
            >
              <PhoneOff className="h-6 w-6" aria-hidden />
            </button>
          </div>
        </footer>
      )}

      {/* End-of-call summary card */}
      <AnimatePresence>
        {phase === 'ended' && (
          <motion.div
            key="call-summary"
            className="absolute inset-0 z-20 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141211] p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ background: BRAND.gradient }}
                >
                  <PhoneOff className="h-5 w-5 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Call ended</h2>
                  <p className="text-xs text-white/50">
                    {formatDuration(finalDuration)} · {exchanges}{' '}
                    {exchanges === 1 ? 'exchange' : 'exchanges'}
                  </p>
                </div>
              </div>

              {callError && <p className="mt-4 text-sm text-[#f5a623]">{callError}</p>}

              <div className="vc-scroll mt-4 max-h-[40vh] min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {transcript.length === 0 ? (
                  <p className="text-sm text-white/40">Nothing was said this call.</p>
                ) : (
                  transcript.map((t, i) => (
                    <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                      <p className="text-[10px] uppercase tracking-wider text-white/35">
                        {t.role === 'user' ? 'You' : 'NEXUS'}
                      </p>
                      <p
                        className={`mt-0.5 inline-block max-w-[92%] rounded-2xl px-3 py-1.5 text-left text-sm leading-snug ${
                          t.role === 'user'
                            ? 'bg-white/[0.07] text-white/85'
                            : 'bg-[#ff5a5f]/10 text-white/85'
                        }`}
                      >
                        {t.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={callAgain}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: BRAND.gradient }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Call again
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <PhoneOff className="h-4 w-4" aria-hidden />
                  Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
