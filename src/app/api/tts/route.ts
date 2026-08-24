import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { DEFAULT_VOICE, isEdgeVoice, pickVoiceForLanguage } from '@/lib/voices'

const requestSchema = z.object({
  text: z.string().min(1).max(6000),
  // Default voice is now a high-quality FREE Microsoft neural voice (was `tongtong`).
  // The route still accepts any voice id, including the legacy ZAI voices.
  voice: z.string().min(2).max(60).default(DEFAULT_VOICE),
  speed: z.number().min(0.5).max(2.0).default(1.0),
})

/** Validates and normalizes the `lang` query param (?lang=en|ar). Defaults to 'en'. */
function readLangParam(req: NextRequest): 'en' | 'ar' {
  const raw = req.nextUrl.searchParams.get('lang') ?? 'en'
  return raw.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

/**
 * Splits long text into <=1000-char chunks on sentence boundaries
 * (TTS APIs accept limited characters per request).
 */
function splitTextIntoChunks(text: string, maxLength = 1000): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current.trim()) chunks.push(current.trim())
      for (let i = 0; i < sentence.length; i += maxLength) {
        chunks.push(sentence.slice(i, i + maxLength).trim())
      }
      current = ''
      continue
    }
    if ((current + sentence).length <= maxLength) {
      current += sentence
    } else {
      if (current.trim()) chunks.push(current.trim())
      current = sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

function wavHeader(dataLength: number, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28)
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  return header
}

/** Synthesizes with FREE Microsoft neural voices (msedge-tts, no API key). */
async function edgeTts(text: string, voice: string, speed: number): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  // 96kbit/s MP3 — msedge-tts only exposes 24kHz MP3 + WebM/Opus formats.
  // 96kbit/s nearly doubles the bitrate vs the old 48kbit/s default for
  // audibly clearer speech (same sample rate, but fewer compression artifacts).
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)

  // Rate: convert 0.5-2.0 speed multiplier to percentage string
  const rate = `${Math.round((speed - 1) * 100)}%`
  const { audioStream } = tts.toStream(text, { rate })
  const chunks: Buffer[] = []
  for await (const chunk of audioStream) {
    chunks.push(chunk as Buffer)
  }
  const buffer = Buffer.concat(chunks)
  if (buffer.length < 100) throw new Error('Voice synthesis returned no audio. Try another voice.')
  return buffer
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`tts:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Speech limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Text is required (max 6000 chars); speed must be 0.5–2.0.' },
        { status: 400 }
      )
    }

    const { text, voice, speed } = parsed.data
    const lang = readLangParam(req)

    // Language override: if the caller asks for Arabic (?lang=ar) but
    // sent a non-Arabic voice id (e.g. legacy default or an English voice),
    // swap to a high-quality Arabic neural voice so the audio matches the
    // UI language. Arabic voice ids start with "ar-".
    const effectiveVoice =
      lang === 'ar' && !voice.toLowerCase().startsWith('ar-')
        ? pickVoiceForLanguage('ar')
        : voice

    const chunks = splitTextIntoChunks(text.trim())
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 })
    }

    /* ---------- Provider: free Microsoft neural voices ---------- */
    if (isEdgeVoice(effectiveVoice)) {
      // Bug G: synthesize every chunk in parallel (was sequential for-loop).
      const buffers = await Promise.all(chunks.map((c) => edgeTts(c, effectiveVoice, speed)))
      const merged = Buffer.concat(buffers)
      return new NextResponse(new Uint8Array(merged), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': merged.length.toString(),
          'Cache-Control': 'no-cache',
        },
      })
    }

    /* ---------- Provider: NEXUS voices (bundled SDK) ---------- */
    const zai = await getZAI()
    // Bug G: synthesize every chunk in parallel (was sequential for-loop).
    const audioBuffers = await Promise.all(
      chunks.map(async (chunk) => {
        const response = await zai.audio.tts.create({
          input: chunk,
          voice: effectiveVoice,
          speed,
          response_format: 'wav',
          stream: false,
        })
        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(new Uint8Array(arrayBuffer))
      })
    )

    // Merge: strip the 44-byte WAV header from every chunk,
    // then rebuild a single valid WAV header for the concatenated PCM data.
    const pcmParts = audioBuffers.map((buf) => buf.subarray(44))
    const pcmLength = pcmParts.reduce((sum, part) => sum + part.length, 0)
    const merged = Buffer.concat([wavHeader(pcmLength), ...pcmParts])

    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': merged.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[api/tts] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Speech synthesis failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
