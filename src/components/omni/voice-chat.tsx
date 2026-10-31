'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2, Volume2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Real voice chat: mic → /api/asr → /api/chat → /api/tts → audio playback.
 * Drop-in replacement for the placeholder Mic button in the composer.
 *
 * Usage:
 *   <VoiceChatButton onTranscript={(text) => setInput(text)} />
 *
 * Or for full conversational mode, use useVoiceChat() directly.
 */

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error'

export function useVoiceChat(
  onUserMessage: (text: string) => void,
  onAssistantReply: (text: string, audioBlob?: Blob) => void,
) {
  const [state, setState] = useState<VoiceState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    chunksRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startRecording = useCallback(async () => {
    setErrorMsg(null)
    setState('recording')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // Convert to base64
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
          try {
            // 1. Transcribe
            setState('transcribing')
            const asrRes = await fetch('/api/asr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64 }),
            })
            const asrData = await asrRes.json()
            if (!asrRes.ok) throw new Error(asrData.error || 'Transcription failed.')
            const transcript = (asrData.transcript || '').trim()
            if (!transcript) {
              setState('idle')
              setErrorMsg('No speech detected. Try again.')
              return
            }
            onUserMessage(transcript)

            // 2. Chat — stream the assistant reply
            setState('thinking')
            const chatRes = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: transcript }),
            })
            if (!chatRes.body) throw new Error('Chat stream failed.')
            const reader2 = chatRes.body.getReader()
            const decoder = new TextDecoder()
            let buf = ''
            let fullReply = ''
            for (;;) {
              const { done, value } = await reader2.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              const lines = buf.split('\n')
              buf = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.trim()) continue
                try {
                  const e = JSON.parse(line)
                  if (e.type === 'assistant' && e.content) {
                    fullReply += e.content
                  }
                } catch {}
              }
            }
            if (!fullReply) throw new Error('No reply received.')
            onAssistantReply(fullReply, undefined)

            // 3. TTS the reply
            if (fullReply.length > 0 && fullReply.length < 6000) {
              setState('speaking')
              const ttsRes = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: fullReply, voice: 'en-US-AriaNeural', speed: 1.0 }),
              })
              if (ttsRes.ok) {
                const audioBlob = await ttsRes.blob()
                const url = URL.createObjectURL(audioBlob)
                const audio = new Audio(url)
                audioElRef.current = audio
                audio.onended = () => setState('idle')
                audio.onerror = () => setState('idle')
                await audio.play().catch(() => setState('idle'))
              } else {
                setState('idle')
              }
            } else {
              setState('idle')
            }
          } catch (err: any) {
            setState('error')
            setErrorMsg(err.message || 'Voice chat failed.')
            setTimeout(() => setState('idle'), 3000)
          }
        }
        reader.readAsDataURL(blob)
      }
      mr.start()
    } catch (err: any) {
      setState('error')
      setErrorMsg(err.message || 'Microphone access denied.')
      setTimeout(() => setState('idle'), 3000)
    }
  }, [onUserMessage, onAssistantReply])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const stop = useCallback(() => {
    cleanup()
    setState('idle')
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current = null
    }
  }, [cleanup])

  return {
    state,
    errorMsg,
    startRecording,
    stopRecording,
    stop,
  }
}

/** Visual indicator dot for the various voice states */
export function VoiceStateIndicator({ state }: { state: VoiceState }) {
  if (state === 'idle') return null
  const label = state === 'recording' ? 'Listening…'
    : state === 'transcribing' ? 'Transcribing…'
    : state === 'thinking' ? 'Thinking…'
    : state === 'speaking' ? 'Speaking…'
    : state === 'error' ? 'Error'
    : ''
  const color = state === 'recording' ? 'bg-rose-500'
    : state === 'error' ? 'bg-destructive'
    : 'bg-primary'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-1.5"
    >
      {state === 'recording' ? (
        <span className={`h-2 w-2 rounded-full ${color} animate-pulse`} />
      ) : (
        <Loader2 className={`h-2.5 w-2.5 ${color.replace('bg-', 'text-')} animate-spin`} />
      )}
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </motion.div>
  )
}

/** Press-and-hold mic button. Tap = start, tap again = stop. */
export function VoiceChatButton({
  onUserMessage,
  onAssistantReply,
}: {
  onUserMessage: (text: string) => void
  onAssistantReply: (text: string, audioBlob?: Blob) => void
}) {
  const { state, errorMsg, startRecording, stopRecording, stop } = useVoiceChat(onUserMessage, onAssistantReply)
  const isActive = state !== 'idle'

  const handleToggle = () => {
    if (state === 'recording') stopRecording()
    else if (state === 'speaking') stop()
    else if (state === 'idle') startRecording()
    // else: do nothing while transcribing/thinking
  }

  return (
    <div className="flex items-center gap-2">
      <VoiceStateIndicator state={state} />
      <button
        type="button"
        onClick={handleToggle}
        disabled={state === 'transcribing' || state === 'thinking'}
        aria-label={isActive ? 'Stop voice chat' : 'Start voice chat'}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
          isActive
            ? 'bg-rose-500 text-white'
            : 'text-muted-foreground hover:text-foreground'
        } disabled:opacity-30`}
      >
        {state === 'recording' ? (
          <Square className="h-3.5 w-3.5" />
        ) : state === 'speaking' ? (
          <Volume2 className="h-4 w-4" />
        ) : state === 'transcribing' || state === 'thinking' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {errorMsg && (
        <span className="text-[10px] text-destructive">{errorMsg}</span>
      )}
    </div>
  )
}
