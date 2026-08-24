'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Phone, Settings2, Square, X, ChevronDown, Check, Volume2, Radio } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { startAsrMode, stopAsrMode } from './voice-asr-fallback'
import { EDGE_VOICES, NEXUS_VOICES, isEdgeVoice, type VoiceOption } from '@/lib/voices'
import { safeJsonFetch } from '@/lib/safe-fetch'

/**
 * NEXUS Premium Voice Mode — ChatGPT-style full-screen voice conversation.
 *
 * Pipeline (proven, multi-layer, resilient):
 *  - INPUT:  Browser-native Web Speech API (live transcription as you speak).
 *            Falls back to MediaRecorder → /api/asr (server-side ASR) if
 *            the browser can't do on-device recognition.
 *  - THINK:  /api/voice/turn (single fast LLM call, voice persona prompt).
 *  - OUTPUT: /api/tts (Microsoft neural voices, 300+ premium voices) OR
 *            Kokoro in-browser neural voice OR browser speechSynthesis.
 *
 * Premium UI:
 *  - Full-screen gradient backdrop with ambient grain.
 *  - Large animated orb (gradient core + pulsing rings + waveform).
 *  - Live interim transcript as you speak.
 *  - Conversation transcript ribbon at the bottom.
 *  - Voice picker (premium neural voices grouped by language).
 *  - Language picker (12 languages).
 */

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Turn {
  id: string
  user: string
  reply: string
}

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)', voice: 'en-US-AriaNeural' },
  { code: 'en-GB', label: 'English (UK)', voice: 'en-GB-SoniaNeural' },
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
  { code: 'it-IT', label: 'Italiano', voice: 'it-IT-ElsaNeural' },
  { code: 'ko-KR', label: '한국어', voice: 'ko-KR-SunHiNeural' },
]

export function VoiceModeOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const [state, setState] = useState<VoiceState>('idle')
  const [iframeBlocked, setIframeBlocked] = useState(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [lang, setLang] = useState('en-US')
  const [ttsVoice, setTtsVoice] = useState('en-US-AriaNeural')
  const [interim, setInterim] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [error, setError] = useState('')

  const recognitionRef = useRef<any>(null)
  const historyRef = useRef<Array<{ role: string; content: string }>>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stateRef = useRef<VoiceState>('idle')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Bug C: keep the overlay cheap when closed — callbacks no-op via this ref.
  const openRef = useRef(open)
  // Bug K: per-turn AbortController so in-flight think()/speak() can be cancelled on close.
  const controllerRef = useRef<AbortController | null>(null)
  // Bug E: SpeechRecognition auto-restart loop protection.
  const restartCountRef = useRef(0)
  const lastStartRef = useRef(0)
  const manualStopRef = useRef(false)

  const setStateSafe = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  // Bug C: keep openRef in sync so guards inside callbacks read the latest value.
  useEffect(() => { openRef.current = open }, [open])

  const stopSpeaking = useCallback(() => {
    // Bug K: cancel any in-flight think()/speak() fetch.
    controllerRef.current?.abort()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} sourceRef.current = null }
  }, [])

  const stopRecognition = useCallback(() => {
    // Bug E: mark as manually stopped so onend won't auto-restart.
    manualStopRef.current = true
    if (recognitionRef.current) {
      try {
        const pulse = (recognitionRef.current as any).__pulse
        if (pulse) clearInterval(pulse)
        recognitionRef.current.onend = null
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
      setMicLevel(0)
    }
  }, [])

  /* ---------- WebAudio unlock (autoplay policy) ---------- */
  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new AudioCtx()
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
      setAudioUnlocked(true)
    } catch {}
  }, [])

  const playWebAudio = useCallback(async (arrayBuffer: ArrayBuffer): Promise<void> => {
    unlockAudio()
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') throw new Error('Audio context unavailable')
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }
    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      sourceRef.current = source
      source.onended = () => resolve()
      try { source.start() } catch { resolve() }
    })
  }, [unlockAudio])

  /* ---------- SPEAK (multi-layer TTS — Kokoro removed for latency) ---------- */
  const speak = useCallback(async (text: string): Promise<void> => {
    // Bug C: no-op when overlay closed.
    if (!openRef.current) return
    // Layer 1: Edge neural TTS via our API (server-side Microsoft neural voices)
    try {
      setStateSafe('speaking')
      const r = await safeJsonFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0 }),
        signal: controllerRef.current?.signal, // Bug K: cancel on close
      }, { timeoutMs: 30_000, label: 'Voice synthesis' })
      if (!r.ok) throw new Error(r.error || 'TTS failed')
      // r.data is { audio: base64, format } OR raw audio blob?
      // /api/tts returns audio bytes directly — re-fetch as blob if JSON.
      // Handle both: if JSON with audio field, decode; else fetch as blob.
      let arrayBuffer: ArrayBuffer
      if (r.data && typeof r.data === 'object' && r.data.audio) {
        const b64 = r.data.audio
        const byteStr = atob(b64)
        const bytes = new Uint8Array(byteStr.length)
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
        arrayBuffer = bytes.buffer
      } else {
        // Fallback: fetch as blob directly
        const blobRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0 }),
        })
        const blob = await blobRes.blob()
        arrayBuffer = await blob.arrayBuffer()
      }
      await playWebAudio(arrayBuffer)
    } catch {
      // Layer 2: browser speechSynthesis (works in restricted contexts)
      try {
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(text)
          utter.lang = lang
          utter.onend = () => resolve()
          utter.onerror = () => resolve()
          speechSynthesis.speak(utter)
          setTimeout(resolve, Math.min(30000, text.length * 100))
        })
      } catch {}
    }
  }, [ttsVoice, lang, playWebAudio, setStateSafe])

  /* ---------- THINK (one LLM turn via /api/voice/turn) ---------- */
  // Bug A: returns the full server payload so the client can play server-generated
  // TTS audio directly and skip the redundant client-side speak() pass.
  const think = useCallback(async (userText: string): Promise<{
    reply: string
    audio: string | null
    audioFormat: string
  }> => {
    // Bug C: no-op when overlay closed.
    if (!openRef.current) return { reply: '', audio: null, audioFormat: 'wav' }
    const r = await safeJsonFetch<any>('/api/voice/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        history: historyRef.current.slice(-6),
        language: lang.split('-')[0],
        voice: ttsVoice,
        audio: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      }),
      signal: controllerRef.current?.signal, // Bug K: cancel on close
    }, { timeoutMs: 60_000, label: 'AI reply' })
    if (!r.ok || !r.data?.reply) throw new Error(r.error || 'AI had trouble responding. Try again.')
    return {
      reply: r.data.reply,
      audio: r.data.audio ?? null,
      audioFormat: r.data.audioFormat ?? 'wav',
    }
  }, [lang, ttsVoice])

  /* ---------- HANDLE FINAL TRANSCRIPT ---------- */
  const handleUtterance = useCallback(async (text: string) => {
    // Bug C: no-op when overlay closed (also stops the think/speak chain).
    if (!openRef.current) return
    const clean = text.trim()
    if (!clean) return
    stopRecognition()
    setStateSafe('thinking')
    setInterim('')
    setError('')
    // Bug K: fresh AbortController for this turn so close/stop can cancel in-flight work.
    controllerRef.current = new AbortController()
    try {
      historyRef.current.push({ role: 'user', content: clean })
      // Bug A: think() returns the full { reply, audio, audioFormat } payload.
      const { reply, audio } = await think(clean)
      if (!reply) return // closed mid-flight
      historyRef.current.push({ role: 'assistant', content: reply })
      setTurns(prev => [...prev, { id: crypto.randomUUID(), user: clean, reply }])
      if (audio) {
        // Bug A: server already generated TTS audio — play it directly and SKIP speak().
        setStateSafe('speaking')
        const byteStr = atob(audio)
        const bytes = new Uint8Array(byteStr.length)
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
        await playWebAudio(bytes.buffer)
      } else {
        // No server audio — fall back to client-side TTS pipeline.
        await speak(reply)
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return // Bug K: silent cancel
      setError(e instanceof Error ? e.message : 'Something went wrong')
      toast({ title: 'Voice error', description: 'Could not get a response.', variant: 'destructive' })
    } finally {
      startListening()
    }
    // NOTE: startListening is intentionally omitted from deps — it is declared
    // below this callback (cycle: startListening → handleUtterance → startListening).
    // Matching the original pattern keeps the closure stable without reordering.
  }, [think, speak, playWebAudio, toast, setStateSafe, stopRecognition])

  /* ---------- ASR FALLBACK (record + upload) ---------- */
  const startAsrFallback = useCallback(() => {
    try {
      startAsrMode({ lang, ttsVoice, historyRef, setStateSafe, setTurns, setInterim, setError })
    } catch {
      setError('Voice is not available in this browser.')
      setStateSafe('idle')
    }
  }, [lang, ttsVoice, setStateSafe])

  /* ---------- LISTEN (Web Speech API) ---------- */
  const startListening = useCallback(() => {
    // Bug C: no-op when overlay closed.
    if (!openRef.current) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      // No Web Speech — go straight to ASR fallback
      startAsrFallback()
      return
    }
    stopSpeaking()
    const rec = new SR()
    rec.lang = lang
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
        setMicLevel(0.3) // Bug D: fixed pulse level, no Math.random() jitter
      }
      if (finalTranscript.trim()) handleUtterance(finalTranscript)
    }
    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        const inIframe = window.self !== window.top
        setError(inIframe
          ? 'This preview frame blocks the microphone. Open the app in a new tab for voice.'
          : 'Microphone blocked — allow mic access in your browser settings.')
        if (inIframe) setIframeBlocked(true)
        setStateSafe('idle')
      } else if (['audio-capture', 'service-not-allowed', 'network'].includes(event.error)) {
        stopRecognition()
        setStateSafe('idle')
        setTimeout(() => startAsrFallback(), 50)
      }
    }
    rec.onend = () => {
      // Bug E: never auto-restart after a manual stop.
      if (manualStopRef.current) return
      if (stateRef.current !== 'listening' || !recognitionRef.current) return
      // Count only consecutive IMMEDIATE restarts (gap < 1s between start and onend).
      const elapsed = performance.now() - lastStartRef.current
      if (elapsed < 1000) {
        restartCountRef.current += 1
        // After 10 immediate restarts, give up entirely.
        if (restartCountRef.current >= 10) {
          stopRecognition()
          setStateSafe('idle')
          toast({
            title: 'Voice recognition unavailable',
            description: 'Try the ASR fallback',
            variant: 'destructive',
          })
          return
        }
        // After 5 immediate restarts, switch to the proven record/upload fallback.
        if (restartCountRef.current >= 5) {
          stopRecognition()
          setStateSafe('idle')
          setTimeout(() => startAsrFallback(), 50)
          return
        }
      } else {
        restartCountRef.current = 0
      }
      try {
        recognitionRef.current.start()
        lastStartRef.current = performance.now()
      } catch {}
    }
    recognitionRef.current = rec
    restartCountRef.current = 0
    manualStopRef.current = false
    try {
      rec.start()
      lastStartRef.current = performance.now()
      setStateSafe('listening')
      setError('')
      // Bug D: throttle pulse to 500ms (was 150ms) to cut re-renders ~3.3×.
      const pulse = setInterval(() => setMicLevel(v => Math.max(0.05, v * 0.85)), 500)
      ;(rec as any).__pulse = pulse
    } catch {}
  }, [lang, handleUtterance, stopSpeaking, setStateSafe, startAsrFallback, stopRecognition, toast])

  /* ---------- CONTROLS ---------- */
  const toggle = useCallback(() => {
    // Bug C: no-op when overlay closed.
    if (!openRef.current) return
    const s = stateRef.current
    if (s === 'idle') { unlockAudio(); startListening() }
    else if (s === 'listening') { stopRecognition(); stopAsrMode(); setStateSafe('idle'); setInterim('') }
    else if (s === 'speaking') { stopSpeaking(); stopAsrMode(); startListening() }
    else { stopSpeaking(); stopRecognition(); stopAsrMode(); setStateSafe('idle') }
  }, [unlockAudio, startListening, stopRecognition, stopSpeaking, setStateSafe])

  const endConversation = useCallback(() => {
    stopRecognition(); stopAsrMode(); stopSpeaking()
    setStateSafe('idle'); setTurns([]); setInterim('')
    historyRef.current = []
  }, [stopRecognition, stopSpeaking, setStateSafe])

  /* ---------- AUTO-SCROLL TRANSCRIPT ---------- */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, interim])

  /* ---------- CLEANUP ON CLOSE ---------- */
  useEffect(() => {
    if (!open) {
      stopRecognition(); stopAsrMode(); stopSpeaking()
      // Bug K: cancel any in-flight think()/speak() fetch.
      controllerRef.current?.abort()
      setStateSafe('idle')
    }
  }, [open])

  // Bug I + Bug K: on unmount, close the AudioContext and abort any in-flight turn.
  useEffect(() => () => {
    stopRecognition(); stopSpeaking()
    audioCtxRef.current?.close?.().catch(() => {})
    audioCtxRef.current = null
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [stopRecognition, stopSpeaking])

  const stateMeta: Record<VoiceState, { label: string; sub: string }> = {
    idle: { label: 'Tap to talk', sub: 'Natural conversation — I hear you as you speak' },
    listening: { label: 'Listening…', sub: 'Speak naturally — I will respond when you pause' },
    thinking: { label: 'Thinking…', sub: 'Crafting your reply' },
    speaking: { label: 'Speaking', sub: 'Tap to interrupt' },
  }
  const meta = stateMeta[state]

  const voicesForLang = (code: string) => {
    const langPrefix = code.split('-')[0]
    const edge = EDGE_VOICES.filter(v => v.id.startsWith(langPrefix))
    return [...NEXUS_VOICES, ...edge]
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Nexus Voice Mode"
        >
          {/* Ambient gradient backdrop — Bug D: single static gradient (no blur, much cheaper) */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-rose-500/10" />
          </div>

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <div className="flex items-center gap-2">
              <Image src="/nexus-header-logo.png" alt="Nexus" width={96} height={32} className="h-7 w-auto" />
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">Voice</span>
            </div>
            <button onClick={onClose} aria-label="Close voice mode"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60 transition hover:bg-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Voice picker sheet */}
          <AnimatePresence>
            {showVoicePicker && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-x-3 top-16 z-20 mx-auto max-w-md"
              >
                <div className="omni-scroll max-h-[60vh] overflow-y-auto rounded-3xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Premium voices</p>
                    <button onClick={() => setShowVoicePicker(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">Nexus voices</p>
                      <div className="space-y-1">
                        {NEXUS_VOICES.map(v => (
                          <VoiceRow key={v.id} v={v} active={ttsVoice === v.id} onPick={() => { setTtsVoice(v.id); setShowVoicePicker(false); toast({ title: `Voice: ${v.label}`, description: v.language }) }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">Neural voices · {LANGUAGES.find(l => l.code === lang)?.label}</p>
                      <div className="space-y-1">
                        {voicesForLang(lang).filter(v => v.provider === 'edge').map(v => (
                          <VoiceRow key={v.id} v={v} active={ttsVoice === v.id} onPick={() => { setTtsVoice(v.id); setShowVoicePicker(false); toast({ title: `Voice: ${v.label}`, description: v.language }) }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Language picker sheet */}
          <AnimatePresence>
            {showLangPicker && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-x-3 top-16 z-20 mx-auto max-w-md"
              >
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Language</p>
                    <button onClick={() => setShowLangPicker(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LANGUAGES.map(l => (
                      <button key={l.code} onClick={() => { setLang(l.code); setTtsVoice(l.voice); setShowLangPicker(false) }}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${lang === l.code ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-secondary text-foreground'}`}>
                        <span>{l.label}</span>
                        {lang === l.code && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main stage */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
            {/* THE ORB */}
            <div className="relative flex items-center justify-center">
              <AnimatePresence>
                {state === 'listening' && (
                  <>
                    <motion.span key="r1" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} exit={{ opacity: 0 }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeOut' }} className="absolute h-40 w-40 rounded-full bg-primary/30" />
                    <motion.span key="r2" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 2.1], opacity: [0.4, 0] }} exit={{ opacity: 0 }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} className="absolute h-40 w-40 rounded-full bg-primary/20" />
                  </>
                )}
                {state === 'speaking' && (
                  <motion.span key="sr" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} exit={{ opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} className="absolute h-40 w-40 rounded-full bg-rose-500/30" />
                )}
                {state === 'thinking' && (
                  <motion.span key="tr" initial={{ scale: 1, opacity: 0.4 }} animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.2, 0.4] }} exit={{ opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} className="absolute h-40 w-40 rounded-full bg-primary/20" />
                )}
              </AnimatePresence>

              <motion.button
                onClick={toggle}
                whileTap={{ scale: 0.95 }}
                aria-label={meta.label}
                className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ${
                  state === 'idle'
                    ? 'size-28 bg-gradient-to-br from-primary to-rose-500 text-white shadow-2xl shadow-primary/30'
                    : state === 'listening'
                      ? 'size-36 bg-gradient-to-br from-primary to-rose-500 text-white shadow-2xl shadow-primary/40'
                      : state === 'speaking'
                        ? 'size-36 bg-gradient-to-br from-rose-500 to-primary text-white shadow-2xl shadow-rose-500/40'
                        : 'size-36 bg-gradient-to-br from-primary/80 to-rose-500/80 text-white shadow-2xl shadow-primary/30'
                }`}
                style={state === 'listening' ? { transform: `scale(${1 + Math.min(0.18, micLevel * 0.5)})` } : undefined}
              >
                {state === 'idle' && <Mic className="h-10 w-10" />}
                {state === 'listening' && (
                  <span className="flex items-end gap-1" aria-hidden>
                    {[0,1,2,3,4].map(i => (
                      <motion.span key={i} className="block w-1.5 rounded-full bg-white"
                        animate={{ height: [8, 28, 8] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                      />
                    ))}
                  </span>
                )}
                {state === 'thinking' && (
                  <span className="flex gap-1.5" aria-hidden>
                    {[0,1,2].map(i => (
                      <motion.span key={i} className="block h-2.5 w-2.5 rounded-full bg-white"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                )}
                {state === 'speaking' && (
                  <span className="flex items-end gap-1" aria-hidden>
                    {[0,1,2,3,4].map(i => (
                      <motion.span key={i} className="block w-1.5 rounded-full bg-white"
                        animate={{ height: [6, 32, 6] }}
                        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                      />
                    ))}
                  </span>
                )}
              </motion.button>
            </div>

            {/* Live interim transcript */}
            <div className="mt-8 min-h-[3.5rem] max-w-md text-center">
              <AnimatePresence mode="wait">
                {state === 'listening' && interim ? (
                  <motion.p key="interim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xl font-medium text-foreground/90">
                    {interim}
                  </motion.p>
                ) : state === 'speaking' && turns.length > 0 ? (
                  <motion.p key="reply" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-lg leading-relaxed text-foreground/80">
                    {turns[turns.length - 1].reply}
                  </motion.p>
                ) : (
                  <motion.div key="meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-base font-medium text-foreground">{meta.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{meta.sub}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>

            {/* Iframe-blocked warning */}
            {iframeBlocked && (
              <div className="mt-6 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Voice is limited in this preview</p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  The preview frame blocks microphone and audio. Open the app in a new tab for the full voice experience.
                </p>
                <a href="/" target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-700">
                  Open in New Tab
                </a>
              </div>
            )}
          </div>

          {/* Transcript ribbon */}
          {turns.length > 0 && (
            <div ref={scrollRef} className="omni-scroll relative z-10 max-h-32 overflow-y-auto border-t border-border/50 px-6 py-3">
              <div className="mx-auto flex max-w-lg flex-col gap-2.5">
                {turns.map(t => (
                  <div key={t.id} className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-primary/90">You · {t.user}</p>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{t.reply}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="relative z-10 flex items-center justify-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
            <button onClick={() => { setShowLangPicker(v => !v); setShowVoicePicker(false) }}
              aria-label="Change language"
              className="flex h-11 items-center gap-1.5 rounded-full bg-secondary/60 px-4 text-xs font-medium transition hover:bg-secondary">
              <Radio className="h-4 w-4 text-muted-foreground" />
              <span>{LANGUAGES.find(l => l.code === lang)?.label}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {state !== 'idle' && (
              <button onClick={toggle} aria-label="Stop"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary transition hover:bg-secondary/80">
                <Square className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => { setShowVoicePicker(v => !v); setShowLangPicker(false) }}
              aria-label="Change voice"
              className="flex h-11 items-center gap-1.5 rounded-full bg-secondary/60 px-4 text-xs font-medium transition hover:bg-secondary">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="max-w-[80px] truncate">{EDGE_VOICES.find(v => v.id === ttsVoice)?.label ?? NEXUS_VOICES.find(v => v.id === ttsVoice)?.label ?? 'Voice'}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {turns.length > 0 && (
              <button onClick={endConversation} aria-label="End conversation"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/60 transition hover:bg-secondary">
                <Phone className="h-5 w-5 rotate-[135deg] text-destructive" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function VoiceRow({ v, active, onPick }: { v: VoiceOption; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${active ? 'bg-primary/15 text-primary' : 'hover:bg-secondary text-foreground'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
          {v.label.slice(0, 1)}
        </span>
        <div>
          <p className="text-sm font-medium">{v.label}</p>
          <p className="text-[11px] text-muted-foreground">{v.language}</p>
        </div>
      </div>
      {active && <Check className="h-4 w-4" />}
    </button>
  )
}
