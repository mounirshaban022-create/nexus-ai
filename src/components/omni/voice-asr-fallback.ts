'use client'

/**
 * ASR Fallback voice mode — the proven record→upload pipeline.
 * Used when Web Speech API is unavailable (headless browsers, some mobile browsers).
 */

import { arrayBufferToBase64 } from './audio-utils'

interface AsrModeOptions {
  lang: string
  ttsVoice: string
  historyRef: React.MutableRefObject<Array<{ role: string; content: string }>>
  setStateSafe: (s: 'idle' | 'listening' | 'thinking' | 'speaking') => void
  setTurns: React.Dispatch<React.SetStateAction<Array<{ user: string; reply: string }>>>
  setInterim: (t: string) => void
  setError: (e: string) => void
}

let activeController: AbortController | null = null

export function stopAsrMode() {
  if (activeController) {
    activeController.abort()
    activeController = null
  }
}

export async function startAsrMode(opts: AsrModeOptions) {
  const { lang, ttsVoice, historyRef, setStateSafe, setTurns, setInterim, setError } = opts
  const controller = new AbortController()
  activeController = controller

  try {
    // 1. Get mic (with timeout — if the device is held by another consumer, fail fast)
    let micTimeout: ReturnType<typeof setTimeout> | null = null
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true }),
      new Promise<never>((_, reject) => {
        micTimeout = setTimeout(() => reject(new Error('Microphone is busy — tap again')), 5000)
      }),
    ])
    if (micTimeout) clearTimeout(micTimeout)

    // 2. Record with VAD (silence detection)
    const AudioCtx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    recorder.start(250)

    setStateSafe('listening')
    setError('')

    // 3. VAD: wait for speech then silence
    await new Promise<void>((resolve) => {
      let speechStart: number | null = null
      let lastSound = performance.now()
      const start = performance.now()
      const THRESHOLD = 0.008
      const SILENCE_MS = 1500
      const MIN_SPEECH = 500
      const MAX_WAIT = 15000
      let raf = 0

      const loop = () => {
        if (controller.signal.aborted) {
          cancelAnimationFrame(raf)
          resolve()
          return
        }
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        const now = performance.now()

        if (rms > THRESHOLD) {
          if (speechStart === null) speechStart = now
          lastSound = now
        }

        // End of turn: silence after speech
        if (
          speechStart !== null &&
          now - lastSound > SILENCE_MS &&
          now - speechStart > MIN_SPEECH
        ) {
          cancelAnimationFrame(raf)
          resolve()
          return
        }
        // No speech timeout
        if (speechStart === null && now - start > MAX_WAIT) {
          cancelAnimationFrame(raf)
          resolve()
          return
        }
        // Max recording time
        if (speechStart !== null && now - speechStart > MAX_WAIT) {
          cancelAnimationFrame(raf)
          resolve()
          return
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })

    if (controller.signal.aborted) {
      recorder.stop()
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
      return
    }

    // 4. Stop recording, get blob
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
      recorder.stop()
    })
    stream.getTracks().forEach((t) => t.stop())
    ctx.close()

    if (blob.size < 1000) {
      setStateSafe('idle')
      return
    }

    // 5. Convert to WAV
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx2 = new AudioCtx()
    const decoded = await audioCtx2.decodeAudioData(arrayBuffer)
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
    const src2 = offline.createBufferSource()
    src2.buffer = decoded
    src2.connect(offline.destination)
    src2.start()
    const rendered = await offline.startRendering()
    audioCtx2.close()

    const samples = rendered.getChannelData(0)
    const wavBuffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(wavBuffer)
    const writeStr = (o: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true)
    view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    const base64 = arrayBufferToBase64(wavBuffer)

    // 6. Send to voice turn API
    setStateSafe('thinking')
    setInterim('')
    const res = await fetch('/api/voice/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: base64,
        voice: ttsVoice,
        language: lang.split('-')[0],
        history: historyRef.current.slice(-6),
      }),
      signal: controller.signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'failed')

    if (!data.transcript) {
      setStateSafe('idle')
      return
    }

    historyRef.current.push({ role: 'user', content: data.transcript })
    historyRef.current.push({ role: 'assistant', content: data.reply })
    setTurns((prev) => [...prev, { user: data.transcript, reply: data.reply }])

    // 7. Speak the reply
    if (data.audio) {
      setStateSafe('speaking')
      const binary = atob(data.audio)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob2 = new Blob([bytes], { type: data.audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav' })
      const url = URL.createObjectURL(blob2)
      await new Promise<void>((resolve) => {
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          resolve()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          resolve()
        }
        audio.play().catch(() => resolve())
      })
    }

    // 8. Continue conversation — restart ASR mode
    if (!controller.signal.aborted) {
      startAsrMode(opts)
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    console.error('[voice-asr] error:', e)
    setError(e instanceof Error ? e.message.slice(0, 100) : 'Voice error')
    setStateSafe('idle')
  }
}
