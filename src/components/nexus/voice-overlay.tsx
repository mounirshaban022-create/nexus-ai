'use client'

/**
 * NEXUS One — full-screen premium voice conversation overlay.
 *
 * State machine: idle → listening → thinking → speaking → listening …
 *  - INPUT : Web Speech API (live interim transcript, auto-restart on end)
 *  - THINK : POST /api/voice/turn  { message, history, language, voice, audio }
 *  - SPEAK : inline audio from the turn response, falling back to
 *            POST /api/tts { text, voice } → object URL → <audio>, then
 *            browser speechSynthesis as a last resort.
 *
 * The orb is the BrandMark wrapped in layered gradient glow rings whose
 * motion maps to the current state (listening = expanding rings that react
 * to mic level, thinking = slow rotating gradient ring + shimmer,
 * speaking = pulse rings locked to the .nx-dot bounce rhythm).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe, Mic, MicOff, PhoneOff, Send, X } from 'lucide-react'
import { BrandMark } from './shared'

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Turn {
  id: string
  user: string
  reply: string
}

const LANGUAGES = [
  { code: 'en-US', label: 'English', voice: 'en-US-AriaNeural' },
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

/** Tiny silent WAV so the /api/voice/turn zod schema passes on the text path. */
const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** The last N turns rendered in the compact conversation log. */
const VISIBLE_TURNS = 4

export function VoiceOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(true)
  const [muted, setMuted] = useState(false)
  const [lang, setLang] = useState('en-US')
  const [ttsVoice, setTtsVoice] = useState('en-US-AriaNeural')
  const [interim, setInterim] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState('')
  const [showLangs, setShowLangs] = useState(false)
  const [textInput, setTextInput] = useState('')

  const recognitionRef = useRef<any>(null)
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const stateRef = useRef<VoiceState>('idle')
  const mutedRef = useRef(false)
  const startListeningRef = useRef<((langOverride?: string) => void) | null>(null)

  const setStateSafe = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  /* --------------------------------------------------------------- */
  /* Audio plumbing                                                   */
  /* --------------------------------------------------------------- */

  const stopSpeaking = useCallback(() => {
    const el = audioRef.current
    if (el) {
      try {
        el.pause()
        el.removeAttribute('src')
        el.load()
      } catch {
        /* already stopped */
      }
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  /** Plays an object URL through the shared <audio> element. Resolves on end. */
  const playUrl = useCallback((url: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const el = audioRef.current
      if (!el) return resolve()
      el.src = url
      el.onended = () => resolve()
      el.onerror = () => resolve()
      el.play().catch(() => resolve())
    })
  }, [])

  /**
   * Speaks a reply. Prefers the inline audio returned by /api/voice/turn
   * (saves a round-trip), then POST /api/tts, then speechSynthesis.
   */
  const speak = useCallback(
    async (text: string, inlineAudio?: string | null, audioFormat?: string): Promise<void> => {
      setStateSafe('speaking')
      let url: string | null = null
      try {
        if (inlineAudio) {
          const binary = atob(inlineAudio)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          const blob = new Blob([bytes], { type: audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav' })
          url = URL.createObjectURL(blob)
        } else {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0 }),
          })
          if (!res.ok) throw new Error('TTS failed')
          const blob = await res.blob()
          url = URL.createObjectURL(blob)
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = url
        await playUrl(url)
      } catch {
        // Last resort: the browser's built-in synthesizer.
        try {
          await new Promise<void>((resolve) => {
            const utter = new SpeechSynthesisUtterance(text)
            utter.lang = lang
            utter.onend = () => resolve()
            utter.onerror = () => resolve()
            window.speechSynthesis.speak(utter)
            setTimeout(resolve, Math.min(30000, text.length * 100))
          })
        } catch {
          /* continue silently — the text is still in the log */
        }
      }
    },
    [ttsVoice, lang, playUrl, setStateSafe]
  )

  /* --------------------------------------------------------------- */
  /* One conversation turn: think (LLM) → speak (TTS)                  */
  /* --------------------------------------------------------------- */

  const think = useCallback(
    async (userText: string): Promise<{ reply?: string; audio?: string | null; audioFormat?: string }> => {
      const res = await fetch('/api/voice/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyRef.current.slice(-6),
          language: lang.split('-')[0],
          voice: ttsVoice,
          audio: SILENT_WAV,
        }),
      })
      if (!res.ok) throw new Error('AI failed to respond — try again.')
      return await res.json()
    },
    [lang, ttsVoice]
  )

  const handleUtterance = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean) return
      stopRecognitionRef.current?.()
      setStateSafe('thinking')
      setInterim('')
      setError('')
      try {
        historyRef.current.push({ role: 'user', content: clean })
        const data = await think(clean)
        const reply = data.reply?.trim() || 'Sorry, I did not get that.'
        historyRef.current.push({ role: 'assistant', content: reply })
        setTurns((prev) => [...prev.slice(-5), { id: crypto.randomUUID(), user: clean, reply }])
        await speak(reply, data.audio, data.audioFormat)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong — try again.')
      } finally {
        // Auto-reset to listening for the next turn.
        startListeningRef.current?.()
      }
    },
    [think, speak, setStateSafe]
  )

  /* --------------------------------------------------------------- */
  /* Web Speech API input (ported from the proven omni voice mode)    */
  /* --------------------------------------------------------------- */

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        const pulse = recognitionRef.current.__pulse as ReturnType<typeof setInterval> | undefined
        if (pulse) clearInterval(pulse)
        recognitionRef.current.onend = null
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.stop()
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
      setMicLevel(0)
    }
  }, [])

  const stopRecognitionRef = useRef(stopRecognition)
  useEffect(() => {
    stopRecognitionRef.current = stopRecognition
  }, [stopRecognition])

  const startListening = useCallback(
    (langOverride?: string) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) {
        setSupported(false)
        setStateSafe('idle')
        return
      }
      if (mutedRef.current) return
      stopSpeaking()

      const rec = new SR()
      rec.lang = langOverride ?? lang
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
        if (interimText) {
          setInterim(interimText)
          setMicLevel(0.3 + Math.random() * 0.4) // active-speech visual
        }
        if (finalTranscript.trim()) {
          handleUtterance(finalTranscript)
        }
      }

      rec.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          setError('Microphone blocked — allow mic access for this site, then reopen voice mode.')
          setStateSafe('idle')
        } else if (event.error === 'audio-capture' || event.error === 'service-not-allowed' || event.error === 'network') {
          setError('Could not reach the speech service — check your connection.')
          setStateSafe('idle')
        }
        // 'no-speech' and 'aborted' are normal — keep listening.
      }

      rec.onend = () => {
        // Chrome stops after silence — restart while still in listening state.
        if (stateRef.current === 'listening' && recognitionRef.current && !mutedRef.current) {
          try {
            recognitionRef.current.start()
          } catch {
            /* restart race — ignore */
          }
        }
      }

      recognitionRef.current = rec
      try {
        rec.start()
        setStateSafe('listening')
        setError('')
        const pulse = setInterval(() => {
          setMicLevel((v) => Math.max(0.05, v * 0.85))
        }, 150)
        rec.__pulse = pulse
      } catch {
        /* already started */
      }
    },
    [lang, handleUtterance, stopSpeaking, setStateSafe]
  )

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  /* --------------------------------------------------------------- */
  /* Overlay lifecycle                                                */
  /* --------------------------------------------------------------- */

  // Fresh conversation every time the overlay opens; teardown on close.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      setSupported(true)
      setMuted(false)
      mutedRef.current = false
      setTurns([])
      setInterim('')
      setError('')
      setTextInput('')
      setShowLangs(false)
      historyRef.current = []
      setStateSafe('idle')
      startListeningRef.current?.()
    }, 60)
    return () => {
      clearTimeout(t)
      stopRecognition()
      stopSpeaking()
    }
  }, [open, setStateSafe, stopRecognition, stopSpeaking])

  // Escape closes the overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  /* --------------------------------------------------------------- */
  /* Controls                                                         */
  /* --------------------------------------------------------------- */

  const toggleMute = () => {
    if (muted) {
      setMuted(false)
      mutedRef.current = false
      setError('')
      startListening()
    } else {
      setMuted(true)
      mutedRef.current = true
      stopRecognition()
      setInterim('')
      setStateSafe('idle')
    }
  }

  const pickLanguage = (l: (typeof LANGUAGES)[number]) => {
    setLang(l.code)
    setTtsVoice(l.voice)
    setShowLangs(false)
    // Restart recognition in the new language when mid-conversation.
    if (stateRef.current === 'listening') {
      stopRecognition()
      setTimeout(() => startListeningRef.current?.(l.code), 150)
    }
  }

  const sendText = () => {
    const text = textInput.trim()
    if (!text || stateRef.current === 'thinking' || stateRef.current === 'speaking') return
    setTextInput('')
    void handleUtterance(text)
  }

  /* --------------------------------------------------------------- */
  /* Render                                                           */
  /* --------------------------------------------------------------- */

  if (!open) return null

  const statusLabel =
    state === 'listening'
      ? 'Listening…'
      : state === 'thinking'
        ? 'Thinking…'
        : state === 'speaking'
          ? 'Speaking…'
          : muted
            ? 'Mic muted'
            : supported
              ? 'Starting…'
              : 'Text mode'

  const recentTurns = turns.slice(-VISIBLE_TURNS)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="NEXUS voice mode"
      className="fixed inset-0 z-50 flex flex-col text-zinc-100"
      style={{
        background:
          'linear-gradient(168deg, rgba(9,9,11,0.97) 0%, rgba(20,8,12,0.96) 55%, rgba(9,9,11,0.98) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark size={22} />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Voice</span>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          aria-label="Close voice mode"
          className="rounded-full p-2.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Center stage */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-4">
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

          {/* listening — expanding rings that breathe with the mic */}
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

          {/* speaking — faster pulse locked to the nx-dot bounce rhythm */}
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
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
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
            <div
              style={
                state === 'listening'
                  ? {
                      transform: `scale(${1 + Math.min(0.16, micLevel * 0.3)})`,
                      transition: 'transform 0.18s ease-out',
                    }
                  : undefined
              }
            >
              <div
                className="relative flex items-center justify-center overflow-hidden rounded-full border border-white/10"
                style={{
                  width: 184,
                  height: 184,
                  background:
                    'radial-gradient(circle at 50% 32%, rgba(255,90,95,0.18), rgba(24,10,14,0.92) 72%)',
                  boxShadow:
                    '0 0 90px -18px rgba(255,90,95,0.45), inset 0 1px 0 rgba(255,255,255,0.09)',
                }}
              >
                {state === 'thinking' && <div aria-hidden className="nx-shimmer absolute inset-0 rounded-full" />}
                <BrandMark size={116} className="relative z-10" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* status */}
        <div className="mt-8 flex items-center gap-2" aria-live="polite">
          <p className="text-sm font-medium text-zinc-300">{statusLabel}</p>
          {state === 'speaking' && (
            <span className="flex items-end gap-1" aria-hidden>
              <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
              <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
              <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
            </span>
          )}
        </div>
        {error && <p className="mt-1.5 max-w-sm text-center text-xs text-red-400/90">{error}</p>}

        {/* live transcript / text fallback */}
        <div className="mt-3 flex min-h-[30px] w-full max-w-md flex-col items-center">
          {state === 'listening' && interim ? (
            <motion.p
              key={interim.slice(0, 24)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className="text-center text-lg italic leading-snug text-zinc-500"
            >
              {interim}
            </motion.p>
          ) : null}

          {!supported && (
            <div className="nx-rise w-full">
              <p className="text-center text-sm leading-relaxed text-zinc-400">
                Your browser doesn&apos;t support live voice — try Chrome. Type below and NEXUS will
                still think and speak.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendText()
                }}
                className="nx-composer mt-3 flex items-center gap-2 rounded-2xl p-1.5 pl-4"
              >
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message…"
                  aria-label="Type a message for NEXUS"
                  className="flex-1 bg-transparent py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || state === 'thinking' || state === 'speaking'}
                  aria-label="Send message"
                  className="nx-gradient-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* compact conversation log — last turns, older fading */}
        {recentTurns.length > 0 && (
          <div className="nx-scroll mt-4 max-h-[20vh] w-full max-w-lg overflow-y-auto pr-1">
            {recentTurns.map((t, i) => (
              <div
                key={t.id}
                className="nx-rise mb-3 text-center last:mb-0"
                style={{ opacity: recentTurns.length === 1 ? 1 : 0.3 + (0.7 * (i + 1)) / recentTurns.length }}
              >
                <p className="text-sm font-medium text-zinc-200">{t.user}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{t.reply}</p>
              </div>
            ))}
          </div>
        )}
      </div>

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
                <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
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
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/25 hover:bg-white/10"
          >
            <Globe className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            disabled={!supported}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            className={`flex h-12 w-12 items-center justify-center rounded-full border transition disabled:opacity-40 ${
              muted
                ? 'border-[#ff5a5f]/50 bg-[#ff5a5f]/15 text-[#ff8a8d]'
                : 'border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10'
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
    </div>
  )
}
