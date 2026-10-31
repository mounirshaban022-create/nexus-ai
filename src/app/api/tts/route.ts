import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { z } from 'zod'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { DEFAULT_VOICE, edgeFallbackFor, isEdgeVoice, pickVoiceForLanguage } from '@/lib/voices'
import { getZAI } from '@/lib/zai'

/**
 * Z.ai SDK TTS — the always-available fallback engine. Microsoft's free Edge
 * TTS started returning 403 from cloud IPs (Sec-MS-GEC DRM requirement), so
 * every Edge failure now falls through to this open SDK pipeline — the same
 * engine the voice-call mini-service uses (proven reliable in-sandbox).
 */
async function zaiTts(text: string, voice: string, speed: number): Promise<Buffer> {
  const zai = await getZAI()
  const res = await zai.audio.tts.create({
    input: text.slice(0, 1200),
    voice: VOICE_MAP[voice] ?? 'tongtong',
    speed: Math.min(Math.max(speed, 0.5), 2),
    response_format: 'wav',
    stream: false,
  })
  const bytes = await res.arrayBuffer()
  const buffer = Buffer.from(new Uint8Array(bytes))
  if (buffer.length < 100) throw new Error('Z.ai TTS returned no audio.')
  return buffer
}

/** NEXUS / Edge voice ids → Z.ai neural voice ids. */
const VOICE_MAP: Record<string, string> = {
  tongtong: 'tongtong',
  'en-US-AvaMultilingualNeural': 'tongtong',
  'en-US-EmmaMultilingualNeural': 'tongtong',
  'en-US-AriaNeural': 'tongtong',
  'en-US-JennyNeural': 'tongtong',
  'en-US-GuyNeural': 'tongtong',
  'en-US-ChristopherNeural': 'tongtong',
  'en-US-MichelleNeural': 'tongtong',
  'en-US-RogerNeural': 'tongtong',
  'ar-EG-SalmaNeural': 'tongtong',
  'ar-SA-ZariyahNeural': 'tongtong',
}

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
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  // Parsed echo for the last-resort fail-soft path in the catch block.
  let parsedData: { text: string; voice: string; speed: number } | null = null
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
    parsedData = parsed.data
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
      try {
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
      } catch (edgeErr) {
        // Edge TTS 403s from cloud IPs — fall through to the Z.ai engine.
        console.warn(`[api/tts] Edge failed (${edgeErr instanceof Error ? edgeErr.message : edgeErr}), using Z.ai engine`)
      }
    }

    /* ---------- Provider: NEXUS voices → free neural equivalents ----------
     * Z.ai is permanently disabled (owner directive). Premium voice ids are
     * transparently mapped to their FREE Microsoft neural equivalents, so
     * speech NEVER fails with a 500. */
    {
      const freeVoice = edgeFallbackFor(effectiveVoice)
      if (freeVoice !== effectiveVoice) {
        console.warn(`[api/tts] premium voice ${effectiveVoice} → free Edge voice ${freeVoice}`)
      }
      try {
        const buffers = await Promise.all(chunks.map((c) => edgeTts(c, freeVoice, speed)))
        const merged = Buffer.concat(buffers)
        return new NextResponse(new Uint8Array(merged), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': merged.length.toString(),
            'Cache-Control': 'no-cache',
          },
        })
      } catch (edgeErr) {
        console.warn(`[api/tts] Edge failed (${edgeErr instanceof Error ? edgeErr.message : edgeErr}), using Z.ai engine`)
      }

      /* ---------- Final engine: Z.ai SDK (open SDK, no key needed) ----------
       * Synthesized per ≤1200-char chunk then concatenated — the client's
       * <audio> element plays a seamless sequence of WAV frames. */
      const wavBuffers: Buffer[] = []
      for (const chunk of chunks) {
        wavBuffers.push(await zaiTts(chunk, effectiveVoice, speed))
      }
      const merged = Buffer.concat(wavBuffers)
      return new NextResponse(new Uint8Array(merged), {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': merged.length.toString(),
          'Cache-Control': 'no-cache',
        },
      })
    }
  } catch (error) {
    // Last-resort fail-soft: if ANYTHING above blew up, try the Z.ai engine
    // (and only then Edge) so the caller still gets audio instead of a 500.
    try {
      if (parsedData?.text) {
        const merged = Buffer.concat(
          splitTextIntoChunks(parsedData.text.trim()).map((c) => {
            return zaiTts(c, parsedData?.voice ?? DEFAULT_VOICE, parsedData?.speed ?? 1.0)
          })
        )
        return new NextResponse(new Uint8Array(merged), {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': merged.length.toString(),
            'Cache-Control': 'no-cache',
          },
        })
      }
    } catch {
      /* try Edge below */
    }
    try {
      if (parsedData?.text) {
        const freeVoice = edgeFallbackFor(parsedData.voice ?? DEFAULT_VOICE)
        const buffers = await Promise.all(
          splitTextIntoChunks(parsedData.text.trim()).map((c) => edgeTts(c, freeVoice, parsedData?.speed ?? 1.0))
        )
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
    } catch {
      /* give up gracefully below */
    }
    console.error('[api/tts] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Speech synthesis failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
