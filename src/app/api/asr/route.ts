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

    // Fallback — the platform's Z.ai ASR (sandbox/dev environments).
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
