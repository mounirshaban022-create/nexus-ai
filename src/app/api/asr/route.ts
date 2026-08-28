import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { hfAsr, hfConfigured } from '@/lib/hf-ai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  audio: z.string().min(64).max(20_000_000),
  language: z.string().max(10).optional(),
})

export const maxDuration = 60

/* ------------------------------------------------------------------ */
/* Groq Whisper — OpenAI-compatible transcription endpoint. Accepts   */
/* webm/opus, mp4/aac, ogg, wav and mp3 directly (no transcode step), */
/* so it works on Vercel serverless where ffmpeg is unavailable.      */
/* ------------------------------------------------------------------ */
function groqAsrConfigured(): boolean {
  return (process.env.GROQ_API_KEY || '').trim().length > 0
}

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'mp4'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('wav')) return 'wav'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('flac')) return 'flac'
  return 'webm'
}

async function groqAsr(base64Audio: string, language?: string): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY || '').trim()

  // Recover the container mime from the data URL when present; MediaRecorder
  // produces audio/webm (Chrome/Android/Firefox) or audio/mp4 (Safari/iOS).
  let mime = 'audio/webm'
  if (base64Audio.startsWith('data:') && base64Audio.includes(',')) {
    const header = base64Audio.slice(5, base64Audio.indexOf(','))
    if (header.includes('audio') || header.includes('video')) mime = header.split(';')[0]
  }

  const bytes = Buffer.from(base64Audio, 'base64')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), `speech.${mimeToExt(mime)}`)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'json')
  if (language) form.append('language', language)

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Groq ASR ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { text?: string }
  return (json.text ?? '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`asr:${clientKey(req)}`, 30, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A base64-encoded audio file is required (max ~15MB).' },
        { status: 400 }
      )
    }

    const audio = parsed.data.audio

    // Accept both raw base64 and data URLs
    const base64Audio = audio.includes(',') && audio.startsWith('data:')
      ? audio.split(',')[1]
      : audio

    if (!base64Audio) {
      return NextResponse.json({ error: 'Audio is missing or invalid.' }, { status: 400 })
    }

    /* PRIMARY — server-side Whisper-large-v3-turbo via the Hugging Face
     * inference router. Works on EVERY deployment (Vercel included — the
     * Z.ai SDK is unreachable there), in every browser, no client
     * downloads. Falls back to the Z.ai ASR when HF is unconfigured. */
    if (hfConfigured()) {
      try {
        const transcript = await hfAsr(base64Audio, {
          language: parsed.data.language,
        })
        if (transcript) return NextResponse.json({ transcript, engine: 'hf-whisper' })
        return NextResponse.json({
          transcript: '',
          note: 'No speech detected in this audio.',
          engine: 'hf-whisper',
        })
      } catch (hfErr) {
        console.warn('[api/asr] HF Whisper failed, trying Z.ai ASR:', hfErr instanceof Error ? hfErr.message : hfErr)
      }
    }

    // Fallback 1 — Groq Whisper (configured via GROQ_API_KEY). Runs on
    // Vercel serverless, no ffmpeg needed, and doubles the transcription
    // capacity when HF is rate-limited or down.
    if (groqAsrConfigured()) {
      try {
        const transcript = await groqAsr(base64Audio, parsed.data.language)
        if (transcript) return NextResponse.json({ transcript, engine: 'groq-whisper' })
        return NextResponse.json({
          transcript: '',
          note: 'No speech detected in this audio.',
          engine: 'groq-whisper',
        })
      } catch (groqErr) {
        console.warn('[api/asr] Groq Whisper failed, trying Z.ai ASR:', groqErr instanceof Error ? groqErr.message : groqErr)
      }
    }

    // Fallback 2 — the platform's Z.ai ASR (sandbox/dev environments).
    const zai = await getZAI()
    const response = await zai.audio.asr.create({
      file_base64: base64Audio,
    })

    const transcript = response.text?.trim()
    if (!transcript) {
      return NextResponse.json({
        transcript: '',
        note: 'No speech detected in this audio.',
      })
    }

    return NextResponse.json({ transcript })
  } catch (error) {
    console.error('[api/asr] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Transcription failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
