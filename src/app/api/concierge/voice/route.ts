import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getZAI } from '@/lib/zai'

/**
 * Concierge voice — speaks the official website assistant's replies aloud.
 *
 * Unlike /api/tts (account-gated), this one is intentionally open to
 * VISITORS so the website can talk with them. Hard caps keep it safe:
 * ≤400 chars per call, 10 calls/min/IP, single fixed neural voice.
 *
 * Engine chain: free Microsoft neural voice (msedge-tts) → Z.ai SDK WAV.
 */

const requestSchema = z.object({
  text: z.string().min(1).max(400),
})

const CONCIERGE_VOICE = 'en-US-AvaMultilingualNeural'

async function edgeTts(text: string, voice: string): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text, { rate: '0%' })
  const chunks: Buffer[] = []
  for await (const chunk of audioStream) {
    chunks.push(chunk as Buffer)
  }
  const buffer = Buffer.concat(chunks)
  if (buffer.length < 100) throw new Error('Voice synthesis returned no audio.')
  return buffer
}

async function zaiTts(text: string): Promise<Buffer> {
  const zai = await getZAI()
  const res = await zai.audio.tts.create({
    input: text.slice(0, 400),
    voice: 'tongtong',
    speed: 1.0,
    response_format: 'wav',
    stream: false,
  })
  const bytes = await res.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(bytes))
  if (buffer.length < 100) throw new Error('Z.ai TTS returned no audio.')
  return buffer
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(`concierge-voice:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Voice limit reached. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  let text = ''
  try {
    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Text is required (max 400 chars).' }, { status: 400 })
    }
    text = parsed.data.text.trim()
    if (!text) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 })
    }

    // Engine 1: free Microsoft neural voice.
    try {
      const audio = await edgeTts(text, CONCIERGE_VOICE)
      return new NextResponse(new Uint8Array(audio), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audio.length.toString(),
          'Cache-Control': 'no-cache',
        },
      })
    } catch (edgeErr) {
      console.warn(`[api/concierge/voice] Edge failed (${edgeErr instanceof Error ? edgeErr.message : edgeErr}), falling back to Z.ai`)
    }

    // Engine 2: Z.ai SDK (open SDK, always configured in-sandbox).
    const audio = await zaiTts(text)
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audio.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[api/concierge/voice] POST error:', error)
    return NextResponse.json({ error: 'Speech synthesis failed.' }, { status: 500 })
  }
}
