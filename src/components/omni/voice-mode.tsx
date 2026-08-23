'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AudioLines,
  CircleStop,
  Download,
  Mic,
  Play,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { blobToWavBase64, formatDuration } from './audio-utils'
import { NEXUS_VOICES, EDGE_VOICES } from '@/lib/voices'
import { useToast } from '@/hooks/use-toast'

const VOICES = NEXUS_VOICES.map((v) => ({ value: v.id, label: v.label, hint: v.language }))
const NEURAL_VOICES = EDGE_VOICES.map((v) => ({ value: v.id, label: v.label, hint: v.language }))

export function VoiceMode() {
  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <AudioLines className="h-5 w-5 text-amber-600" aria-hidden /> Voice Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two superpowers: give your words a voice, and give your audio a transcript.
          </p>
        </header>

        <Tabs defaultValue="tts" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl bg-card/70 p-1">
            <TabsTrigger value="tts" className="gap-2 rounded-lg text-sm">
              <Volume2 className="h-4 w-4" /> Text → Speech
            </TabsTrigger>
            <TabsTrigger value="asr" className="gap-2 rounded-lg text-sm">
              <Mic className="h-4 w-4" /> Speech → Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tts" className="mt-5">
            <TextToSpeech />
          </TabsContent>
          <TabsContent value="asr" className="mt-5">
            <SpeechToText />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Text → Speech                                                       */
/* ------------------------------------------------------------------ */

function TextToSpeech() {
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('tongtong')
  const [speed, setSpeed] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const synthesize = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, voice, speed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Speech synthesis failed.')
      }
      const blob = await res.blob()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(URL.createObjectURL(blob))
    } catch (error) {
      toast({
        title: 'Synthesis failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [text, voice, speed, loading, audioUrl, toast])

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
        <label htmlFor="tts-text" className="text-xs font-semibold uppercase tracking-wider text-amber-600">
          Text to speak
        </label>
        <Textarea
          id="tts-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Welcome to OMNI AI — your words, beautifully spoken…"
          rows={5}
          maxLength={6000}
          className="mt-2 resize-none border-border/70 bg-background/60 focus-visible:ring-amber-500/50"
        />
        <p className="mt-1.5 text-right text-[11px] text-muted-foreground">
          {text.length} / 6000 characters
        </p>

        <div className="mt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voice — NEXUS collection
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {VOICES.map((v) => (
              <button
                key={v.value}
                onClick={() => setVoice(v.value)}
                aria-pressed={voice === v.value}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  voice === v.value
                    ? 'border-border bg-secondary'
                    : 'border-border bg-card hover:bg-secondary/70'
                }`}
              >
                <span className={`block text-sm font-medium ${voice === v.value ? 'text-foreground' : ''}`}>
                  {v.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">{v.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Free neural voices · 33 languages & accents · no API key
          </span>
          <div className="mt-2 grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
            {NEURAL_VOICES.map((v) => (
              <button
                key={v.value}
                onClick={() => setVoice(v.value)}
                aria-pressed={voice === v.value}
                className={`rounded-lg border px-2.5 py-1.5 text-left transition ${
                  voice === v.value
                    ? 'border-border bg-secondary'
                    : 'border-border/70 bg-background/40 hover:border-border'
                }`}
              >
                <span className={`block truncate text-xs font-medium ${voice === v.value ? 'text-foreground' : ''}`}>
                  {v.label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">{v.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Speed
            </span>
            <Badge variant="secondary" className="text-[11px]">{speed.toFixed(1)}×</Badge>
          </div>
          <Slider
            value={[speed]}
            min={0.5}
            max={2}
            step={0.1}
            onValueChange={(vals) => setSpeed(vals[0] ?? 1)}
            aria-label="Speech speed"
            className="mt-2"
          />
        </div>

        <Button
          onClick={synthesize}
          disabled={!text.trim() || loading}
          className="mt-5 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? 'Synthesizing…' : 'Generate speech'}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Audio output
        </span>
        {loading ? (
          <div className="mt-6 flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-4 flex items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="omni-dot w-1.5 rounded-full bg-amber-400"
                  style={{ height: `${14 + (i % 3) * 12}px`, animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Composing your audio…</p>
          </div>
        ) : audioUrl ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-col gap-4"
          >
            <audio controls src={audioUrl} className="w-full" aria-label="Generated speech audio" />
            <Button asChild variant="outline" className="gap-2 rounded-xl">
              <a href={audioUrl} download="nexus-speech.audio">
                <Download className="h-4 w-4" /> Download WAV
              </a>
            </Button>
          </motion.div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center py-14 text-center">
            <Volume2 className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="max-w-xs text-sm text-muted-foreground">
              Pick a voice, type some text, and press <em>Generate speech</em> — your audio will
              play right here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Speech → Text                                                       */
/* ------------------------------------------------------------------ */

type RecordingState = 'idle' | 'recording' | 'processing'

function SpeechToText() {
  const { toast } = useToast()
  const [state, setState] = useState<RecordingState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    }
  }, [audioPreviewUrl])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => processBlob(new Blob(chunksRef.current, { type: recorder.mimeType }))
      recorder.start(250)
      mediaRecorderRef.current = recorder
      setTranscript('')
      setElapsed(0)
      setState('recording')
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000)
    } catch {
      toast({
        title: 'Microphone unavailable',
        description: 'Please allow microphone access, or upload an audio file instead.',
        variant: 'destructive',
      })
    }
  }, [toast])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (timerRef.current) clearInterval(timerRef.current)
    setState('processing')
  }, [])

  const processBlob = useCallback(
    async (blob: Blob) => {
      try {
        setAudioPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
        const base64 = await blobToWavBase64(blob)
        const res = await fetch('/api/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64 }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Transcription failed.')
        setTranscript(data.transcript || data.note || 'No speech detected.')
      } catch (error) {
        toast({
          title: 'Transcription failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setState('idle')
      }
    },
    [toast]
  )

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Please use audio under 15MB.', variant: 'destructive' })
        return
      }
      setState('processing')
      setTranscript('')
      try {
        setAudioPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(file)
        })
        // ASR requires WAV/WebM — convert any audio format (mp3, m4a, ogg…)
        // to 16kHz mono WAV client-side before sending.
        const base64 = await blobToWavBase64(file)
        const res = await fetch('/api/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64 }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Transcription failed.')
        setTranscript(data.transcript || data.note || 'No speech detected.')
      } catch (error) {
        toast({
          title: 'Transcription failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setState('idle')
      }
    },
    [toast]
  )

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
          Record or upload
        </span>

        <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 px-6 py-10">
          <button
            onClick={state === 'recording' ? stopRecording : state === 'idle' ? startRecording : undefined}
            disabled={state === 'processing'}
            aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
            className={`flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 disabled:opacity-50 ${
              state === 'recording'
                ? 'animate-pulse bg-red-500 text-white shadow-lg shadow-red-950/40'
                : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-950/30 hover:scale-105'
            }`}
          >
            {state === 'recording' ? (
              <CircleStop className="h-8 w-8" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </button>
          <p className="mt-4 text-sm font-medium">
            {state === 'recording'
              ? `Recording… ${formatDuration(elapsed)} — tap to stop`
              : state === 'processing'
                ? 'Transcribing…'
                : 'Tap the mic and start speaking'}
          </p>
          {state === 'recording' && (
            <div className="mt-3 flex items-end gap-1" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="omni-dot w-1.5 rounded-full bg-red-400"
                  style={{ height: `${10 + (i % 4) * 8}px`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Have an audio file?</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={state !== 'idle'}
            className="gap-2 rounded-lg"
          >
            <Upload className="h-3.5 w-3.5" /> Upload audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {audioPreviewUrl && (
          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Your audio
            </span>
            <audio controls src={audioPreviewUrl} className="mt-1.5 w-full" aria-label="Recorded audio preview" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Transcript
          </span>
          {transcript && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 rounded-md text-xs text-muted-foreground"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(transcript)
                  .then(() => toast({ title: 'Transcript copied to clipboard' }))
                  .catch(() => toast({ title: 'Copy failed', variant: 'destructive' }))
              }}
            >
              Copy
            </Button>
          )}
        </div>
        {state === 'processing' ? (
          <div className="mt-6 flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-4 flex items-center gap-1.5">
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-orange-400" />
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-amber-300" />
            </div>
            <p className="text-sm text-muted-foreground">Listening closely…</p>
          </div>
        ) : transcript ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-relaxed"
          >
            {transcript}
          </motion.div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center py-14 text-center">
            <Play className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="max-w-xs text-sm text-muted-foreground">
              Record your voice or upload an audio file — the transcript appears here, ready to
              copy.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
