import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  audio: z.string().min(64).max(20_000_000),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`asr:${clientKey(req)}`, 20, 60_000)
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
