'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Phone, Settings2, Square, X, ChevronDown, Check, Volume2, Radio } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { startAsrMode, stopAsrMode } from './voice-asr-fallback'
import { kokoroSpeak } from './kokoro-voice'
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

  const setStateSafe = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} sourceRef.current = null }
  }, [])

  const stopRecognition = useCallback(() => {
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

  /* ---------- SPEAK (premium multi-layer TTS) ---------- */
  const speak = useCallback(async (text: string): Promise<void> => {
    // Layer 1: Kokoro in-browser neural voice (premium, iframe-proof)
    try {
      const kokoroResult = await kokoroSpeak(text)
      if (kokoroResult.ok && kokoroResult.blob) {
        setStateSafe('speaking')
        await playWebAudio(await kokoroResult.blob.arrayBuffer())
        return
      }
    } catch { /* continue to Edge TTS */ }

    // Layer 2: Edge neural TTS via our API
    try {
      setStateSafe('speaking')
      const r = await safeJsonFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0 }),
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
      // Layer 3: browser speechSynthesis (works in restricted contexts)
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
  const think = useCallback(async (userText: string): Promise<string> => {
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
    }, { timeoutMs: 60_000, label: 'AI reply' })
    if (!r.ok || !r.data?.reply) throw new Error(r.error || 'AI had trouble responding. Try again.')
    return r.data.reply
  }, [lang, ttsVoice])

  /* ---------- HANDLE FINAL TRANSCRIPT ---------- */
  const handleUtterance = useCallback(async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    stopRecognition()
    setStateSafe('thinking')
    setInterim('')
    setError('')
    try {
      historyRef.current.push({ role: 'user', content: clean })
      const reply = await think(clean)
      historyRef.current.push({ role: 'assistant', content: reply })
      setTurns(prev => [...prev, { id: crypto.randomUUID(), user: clean, reply }])
      await speak(reply)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      toast({ title: 'Voice error', description: 'Could not get a response.', variant: 'destructive' })
    } finally {
      startListening()
    }
  }, [think, speak, toast, setStateSafe, stopRecognition])

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
        setMicLevel(0.3 + Math.random() * 0.4)
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
      if (stateRef.current === 'listening' && recognitionRef.current) {
        try { recognitionRef.current.start() } catch {}
      }
    }
    recognitionRef.current = rec
    try {
      rec.start()
      setStateSafe('listening')
      setError('')
      const pulse = setInterval(() => setMicLevel(v => Math.max(0.05, v * 0.85)), 150)
      ;(rec as any).__pulse = pulse
    } catch {}
  }, [lang, handleUtterance, stopSpeaking, setStateSafe, startAsrFallback, stopRecognition])

  /* ---------- CONTROLS ---------- */
  const toggle = useCallback(() => {
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
      setStateSafe('idle')
    }
  }, [open])

  useEffect(() => () => { stopRecognition(); stopSpeaking() }, [stopRecognition, stopSpeaking])

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
          {/* Ambient gradient backdrop */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute left-1/2 top-1/3 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/25 via-rose-500/10 to-transparent blur-3xl" />
            <div className="absolute bottom-0 left-0 h-[40vh] w-[40vh] rounded-full bg-gradient-to-tr from-primary/10 to-transparent blur-3xl" />
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
                    <motion.span key="r1" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} exit={{ opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} className="absolute h-40 w-40 rounded-full bg-primary/30" />
                    <motion.span key="r2" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [1, 2.1], opacity: [0.4, 0] }} exit={{ opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} className="absolute h-40 w-40 rounded-full bg-primary/20" />
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
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
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
