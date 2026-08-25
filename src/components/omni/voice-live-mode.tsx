'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Phone, Settings2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { startAsrMode, stopAsrMode } from './voice-asr-fallback'
import { kokoroSpeak } from './kokoro-voice'

/**
 * NEXUS Live Voice — rebuilt from scratch on proven foundations:
 * - INPUT: Browser-native Web Speech API (SpeechRecognition)
 *   → live transcription as you speak, instant final results, no upload round-trip
 * - OUTPUT: /api/tts (Microsoft neural voices, proven working)
 * This is the same input stack Chrome's own voice search uses.
 */

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Turn {
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

export function VoiceLiveMode() {
  const { toast } = useToast()
  const [state, setState] = useState<VoiceState>('idle')
  const [iframeBlocked, setIframeBlocked] = useState(false)
  const [audioTested, setAudioTested] = useState(false)
  const [lang, setLang] = useState('en-US')
  const [ttsVoice, setTtsVoice] = useState('en-US-AriaNeural')
  const [interim, setInterim] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState('')

  const recognitionRef = useRef<any>(null)
  const historyRef = useRef<Array<{ role: string; content: string }>>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stateRef = useRef<VoiceState>('idle')

  const setStateSafe = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
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
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
      setMicLevel(0)
    }
  }, [])

  /* ---------- SPEAK (TTS via our API — returns audio blob) ---------- */
  // WebAudio context — unlocked during user tap gesture (solves autoplay policy)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  /** Unlocks WebAudio during a user gesture (MDN autoplay guide solution). */
  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new AudioCtx()
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
    } catch { /* best effort */ }
  }, [])

  /** Play audio through WebAudio (unlocked during gesture). */
  const playWebAudio = useCallback(async (arrayBuffer: ArrayBuffer): Promise<void> => {
    unlockAudio()
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') throw new Error('Audio context unavailable')
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* stopped */ }
    }

    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      sourceRef.current = source
      source.onended = () => resolve()
      try { source.start() } catch { resolve() }
    })
  }, [unlockAudio])

  const speak = useCallback(
    async (text: string): Promise<void> => {
      // LAYER 1: Kokoro neural voice (premium, in-browser, iframe-proof)
      try {
        const kokoroResult = await kokoroSpeak(text)
        if (kokoroResult.ok && kokoroResult.blob) {
          setStateSafe('speaking')
          const arrayBuffer = await kokoroResult.blob.arrayBuffer()
          await playWebAudio(arrayBuffer)
          return
        }
      } catch {
        // Kokoro not loaded yet → continue to Edge TTS
      }

      // LAYER 2: Edge TTS via API
      try {
        setStateSafe('speaking')
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: ttsVoice, speed: 1.0 }),
        })
        if (!res.ok) throw new Error('TTS failed')
        const blob = await res.blob()
        const arrayBuffer = await blob.arrayBuffer()

        await playWebAudio(arrayBuffer)
      } catch (e) {
        console.error('[voice] WebAudio failed, trying speechSynthesis:', e)
        // FALLBACK: browser built-in speechSynthesis (works in restricted contexts)
        try {
          await new Promise<void>((resolve) => {
            const utter = new SpeechSynthesisUtterance(text)
            utter.lang = lang
            utter.onend = () => resolve()
            utter.onerror = () => resolve()
            speechSynthesis.speak(utter)
            // Safety timeout
            setTimeout(resolve, Math.min(30000, text.length * 100))
          })
        } catch {
          // Last resort: no audio, conversation continues
        }
      }
    },
    [ttsVoice, unlockAudio, lang, playWebAudio]
  )

  /* ---------- THINK (LLM turn) ---------- */
  const think = useCallback(async (userText: string): Promise<string> => {
    const res = await fetch('/api/voice/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText, // use message field (the endpoint also accepts it)
        history: historyRef.current.slice(-6),
        language: lang.split('-')[0],
        voice: ttsVoice,
        // audio field is required by zod; send a tiny silent wav so validation passes
        audio: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      }),
    })
    if (!res.ok) throw new Error('AI failed to respond')
    const data = await res.json()
    return data.reply ?? 'Sorry, I did not get that.'
  }, [lang, ttsVoice])

  /* ---------- HANDLE FINAL TRANSCRIPT ---------- */
  const handleUtterance = useCallback(
    async (text: string) => {
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
        setTurns((prev) => [...prev, { user: clean, reply }])
        await speak(reply)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
        toast({ title: 'Voice error', description: 'Could not get a response.', variant: 'destructive' })
      } finally {
        // Resume listening for the next turn
        startListening()
      }
    },
    [think, speak, toast]
  )

  /* ---------- ASR FALLBACK (record + upload pipeline) ---------- */
  const startAsrFallback = useCallback(() => {
    console.log('[voice] starting ASR fallback')
    try {
      startAsrMode({
        lang,
        ttsVoice,
        historyRef,
        setStateSafe,
        setTurns,
        setInterim,
        setError,
      })
    } catch (e) {
      console.error('[voice] fallback failed to start:', e)
      setError('Voice is not available in this browser.')
      setStateSafe('idle')
    }
  }, [lang, ttsVoice, setStateSafe])

  /* ---------- LISTEN (Web Speech API) ---------- */
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Voice recognition is not supported in this browser. Try Chrome or Edge.')
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
        if (r.isFinal) {
          finalTranscript += r[0].transcript
        } else {
          interimText += r[0].transcript
        }
      }
      if (interimText) {
        setInterim(interimText)
        setMicLevel(0.3 + Math.random() * 0.4) // active speech visual
      }
      if (finalTranscript.trim()) {
        handleUtterance(finalTranscript)
      }
    }

    rec.onerror = (event: any) => {
      console.log('[voice] Web Speech error:', event.error)
      if (event.error === 'not-allowed') {
        const inIframe = window.self !== window.top
        setError(
          inIframe
            ? 'This preview frame blocks the microphone. Open the app in a new tab (button below) for voice chat.'
            : 'Microphone blocked — click the 🔒 icon in the address bar and allow mic access.'
        )
        if (inIframe) setIframeBlocked(true)
        setStateSafe('idle')
      } else if (event.error === 'audio-capture' || event.error === 'service-not-allowed' || event.error === 'network') {
        // Web Speech API can't access audio — fall back to ASR pipeline
        stopRecognition()
        setStateSafe('idle')
        // Defer so state update flushes before fallback starts
        setTimeout(() => startAsrFallback(), 50)
      } else if (event.error === 'no-speech') {
        // Normal — keep listening
      }
    }

    rec.onend = () => {
      // Auto-restart while in listening state (Chrome stops after silence)
      if (stateRef.current === 'listening' && recognitionRef.current) {
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
      // Gentle idle pulse while listening
      const pulse = setInterval(() => {
        setMicLevel((v) => Math.max(0.05, v * 0.85))
      }, 150)
      ;(rec as any).__pulse = pulse
    } catch {
      /* already started */
    }
  }, [lang, handleUtterance, stopSpeaking, setStateSafe])

  /* ---------- CONTROLS ---------- */
  const toggle = useCallback(() => {
    const s = stateRef.current
    if (s === 'idle') {
      unlockAudio() // unlock WebAudio during the tap gesture
      startListening()
    } else if (s === 'listening') {
      stopRecognition()
      stopAsrMode()
      setStateSafe('idle')
      setInterim('')
    } else if (s === 'speaking') {
      stopSpeaking()
      stopAsrMode()
      startListening() // barge-in
    } else {
      // thinking — allow cancel
      stopSpeaking()
      stopRecognition()
      stopAsrMode()
      setStateSafe('idle')
    }
  }, [startListening, stopRecognition, stopSpeaking, setStateSafe])

  const endConversation = useCallback(() => {
    stopRecognition()
    stopAsrMode()
    stopSpeaking()
    setStateSafe('idle')
    setTurns([])
    setInterim('')
    historyRef.current = []
  }, [stopRecognition, stopSpeaking, setStateSafe])

  /* ---------- IFRAME + PERMISSION DETECTION ---------- */
  useEffect(() => {
    // Detect if we're in an iframe without permissions
    const inIframe = window.self !== window.top
    if (inIframe) {
      // Test if audio can play (autoplay permission)
      const testAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')
      testAudio.muted = true
      testAudio.play().then(() => {
        testAudio.pause()
        // Autoplay OK — but mic may still be blocked
        navigator.mediaDevices?.getUserMedia({ audio: true })
          .then((stream) => {
            stream.getTracks().forEach((t) => t.stop())
            // Full voice works
          })
          .catch(() => {
            setIframeBlocked(true) // mic blocked by iframe
          })
      }).catch(() => {
        setIframeBlocked(true) // autoplay blocked by iframe
      })
    }
  }, [])

  /* ---------- TEST AUDIO BUTTON ---------- */
  const testAudio = useCallback(async () => {
    unlockAudio() // gesture!
    try {
      // Play a short TTS test via our API
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Voice test. If you can hear this, audio works.', voice: 'en-US-AriaNeural' }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const ctx = audioCtxRef.current
      if (ctx && ctx.state !== 'closed') {
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
        const buffer = await ctx.decodeAudioData(arrayBuffer)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start()
        setAudioTested(true)
        toast({ title: '🔊 Playing test audio...', description: 'If you hear nothing, open the app in a new tab (iframe may block audio).' })
      } else {
        throw new Error('Audio context unavailable')
      }
    } catch (e) {
      toast({ title: 'Audio blocked', description: 'This iframe blocks audio. Click "Open in New Tab" below for full voice.', variant: 'destructive', duration: 8000 })
    }
  }, [toast])

  /* ---------- CLEANUP ---------- */
  useEffect(() => {
    return () => {
      stopRecognition()
      stopSpeaking()
    }
  }, [stopRecognition, stopSpeaking])

  const stateMeta: Record<VoiceState, { label: string; color: string }> = {
    idle: { label: 'Tap to talk', color: 'bg-secondary' },
    listening: { label: 'Listening…', color: 'bg-primary' },
    thinking: { label: 'Thinking…', color: 'bg-primary' },
    speaking: { label: 'Speaking — tap to interrupt', color: 'bg-primary' },
  }
  const meta = stateMeta[state]

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Settings popover */}
        {showSettings && (
          <div className="omni-scroll mb-6 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Language
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code)
                    setTtsVoice(l.voice)
                    setShowSettings(false)
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    lang === l.code ? 'bg-primary/15 text-primary' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* THE ORB */}
        <div className="relative flex items-center justify-center">
          {state === 'listening' && (
            <>
              <span className="voice-ring voice-ring-1" aria-hidden />
              <span className="voice-ring voice-ring-2" aria-hidden />
            </>
          )}
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.96 }}
            aria-label={meta.label}
            className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ${
              state === 'idle' ? 'bg-secondary hover:bg-secondary/80 size-32' : `${meta.color} voice-orb-listen size-40 sm:size-44`
            }`}
            style={
              state === 'listening'
                ? { transform: `scale(${1 + Math.min(0.25, micLevel * 0.6)})` }
                : state === 'speaking'
                  ? { transform: 'scale(1.06)' }
                  : undefined
            }
          >
            {state === 'idle' && <Mic className="h-11 w-11 text-muted-foreground" aria-hidden />}
            {state === 'listening' && (
              <span className="flex items-end gap-1.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="voice-bar" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
            )}
            {state === 'thinking' && (
              <span className="flex gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="omni-dot h-2.5 w-2.5 rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            )}
            {state === 'speaking' && (
              <span className="flex items-end gap-1.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="voice-bar" style={{ animationDelay: `${i * 0.1}s`, height: `${16 + (i % 4) * 10}px` }} />
                ))}
              </span>
            )}
          </motion.button>
        </div>

        {/* Live interim text — shows words as you speak */}
        {state === 'listening' && interim && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 max-w-md text-center text-lg font-medium text-foreground/80"
          >
            {interim}
          </motion.p>
        )}

        {/* Status */}
        <p className="mt-6 text-base font-medium">{meta.label}</p>
        {error ? (
          <p className="mt-1.5 max-w-sm text-center text-sm text-destructive">{error}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {state === 'idle' ? 'Natural conversation — I hear you as you speak' : ''}
          </p>
        )}

        {/* IFRAME WARNING — the likely cause of "no voice" */}
        {iframeBlocked && (
          <div className="mt-6 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-semibold text-amber-900">⚠️ Voice is limited in this preview</p>
            <p className="mt-1 text-xs text-amber-800">
              The preview panel blocks microphone and audio in embedded frames.
              For full voice chat, open the app in a new tab.
            </p>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-700"
            >
              ↗ Open in New Tab for full voice
            </a>
          </div>
        )}

        {/* Test audio button — proves whether sound works */}
        {!iframeBlocked && !audioTested && (
          <button
            onClick={testAudio}
            className="mt-4 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Test audio output
          </button>
        )}

        {/* Controls */}
        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-label="Language settings"
            className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-secondary/60"
          >
            <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          </button>
          {state !== 'idle' && (
            <button
              onClick={toggle}
              aria-label="Stop"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary transition hover:bg-secondary/80"
            >
              <Square className="h-4 w-4 text-foreground" aria-hidden />
            </button>
          )}
          {turns.length > 0 && (
            <button
              onClick={endConversation}
              aria-label="End conversation"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary transition hover:bg-secondary/80"
            >
              <Phone className="h-5 w-5 rotate-[135deg] text-destructive" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Transcript */}
      {turns.length > 0 && (
        <div className="omni-scroll max-h-44 overflow-y-auto border-t border-border/50 px-6 py-4">
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {turns.map((t, i) => (
              <div key={i} className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground/90">{t.user}</p>
                <p className="text-[13px] text-muted-foreground">{t.reply}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
