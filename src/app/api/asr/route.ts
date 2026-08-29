import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { z } from 'zod'
import { hfAsr, hfConfigured } from '@/lib/hf-ai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  audio: z.string().min(64).max(20_000_000),
  language: z.string().max(10).optional(),
})

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

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
        console.warn('[api/asr] HF Whisper failed, trying Groq Whisper:', hfErr instanceof Error ? hfErr.message : hfErr)
      }
    }

    // Fallback 1 — Groq Whisper-large-v3 (OpenAI-compatible, fast + cheap).
    if (process.env.GROQ_API_KEY?.trim()) {
      try {
        const bytes = Buffer.from(base64Audio, 'base64')
        const form = new FormData()
        form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/webm' }), 'audio.webm')
        form.append('model', 'whisper-large-v3')
        if (parsed.data.language) form.append('language', parsed.data.language)
        const gres = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}` },
          body: form,
          signal: AbortSignal.timeout(55_000),
        })
        if (gres.ok) {
          const gdata = (await gres.json()) as { text?: string }
          const gtext = gdata.text?.trim() ?? ''
          if (gtext) return NextResponse.json({ transcript: gtext, engine: 'groq-whisper' })
          return NextResponse.json({ transcript: '', note: 'No speech detected in this audio.', engine: 'groq-whisper' })
        }
        console.warn('[api/asr] Groq Whisper HTTP', gres.status, (await gres.text()).slice(0, 160))
      } catch (gErr) {
        console.warn('[api/asr] Groq Whisper failed:', gErr instanceof Error ? gErr.message : gErr)
      }
    }

    // All engines exhausted — honest engine failure (NOT silence).
    return NextResponse.json(
      { error: 'Speech recognition is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    )
  } catch (error) {
    console.error('[api/asr] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Transcription failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
