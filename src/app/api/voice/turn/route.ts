import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getZAI } from '@/lib/zai'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { DEFAULT_VOICE, isEdgeVoice, pickVoiceForLanguage } from '@/lib/voices'

export const maxDuration = 90

/**
 * One turn of a live voice conversation:
 * audio (base64) -> ASR -> (optional thinking) -> LLM -> TTS wav (base64)
 * Everything the client needs to keep the conversation flowing, in one round-trip.
 */

const requestSchema = z.object({
  audio: z.string().optional(), // base64 audio (ASR path)
  message: z.string().max(4000).optional(), // direct transcript (Web Speech API path)
  sessionId: z.string().max(64).optional().nullable(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .optional()
    .default([]),
  voice: z.string().min(2).max(60).default(DEFAULT_VOICE),
  language: z.string().min(2).max(30).optional().default('auto'),
  // UI language: 'en' | 'ar'. When 'ar' and the chosen voice isn't Arabic,
  // we override to a high-quality Arabic neural voice so TTS matches the UI.
  lang: z.enum(['en', 'ar']).optional().default('en'),
})

/** Voice persona: natural, warm, concise — designed for spoken conversation. */
// Bug J: built per-request so the CURRENT TIME is always fresh (was stale at module load).
function buildVoiceSystemPrompt(): string {
  return [
    'You are NEXUS, created by Mounir Shaaban (the creator of NEXUS AI). You are a warm, intelligent voice companion in a real-time spoken conversation.',
    'RULES (your reply is spoken aloud):',
    '1. SHORT: 1-3 sentences, max ~50 words, unless detail is explicitly requested.',
    '2. Natural spoken style: contractions, no markdown, no lists, no emoji.',
    '3. Direct and warm — never waffle.',
    '4. LANGUAGE: reply in the SAME language the user just spoke.',
    '5. CURRENT TIME: it is ' + new Date().toISOString() + '. Use this for any time/date questions.',
  ].join('\n')
}

/** Strips markdown syntax so TTS speaks naturally. */
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\(([^)]*)\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

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
    if ((current + sentence).length <= maxLength) current += sentence
    else {
      if (current.trim()) chunks.push(current.trim())
      current = sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

function wavHeader(dataLength: number, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  return header
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`voice-turn:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Voice limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request: audio is required.' }, { status: 400 })
    }

    const { audio, message, voice, lang } = parsed.data

    // Language override (mirrors /api/tts): if the caller is in Arabic UI
    // mode but the chosen voice isn't Arabic, swap to an Arabic neural voice
    // so the spoken reply matches the UI language.
    const effectiveVoice =
      lang === 'ar' && !voice.toLowerCase().startsWith('ar-')
        ? pickVoiceForLanguage('ar')
        : voice

    // ---------- 1. Transcribe (skip if transcript provided via Web Speech API) ----------
    // Bug 8-A (voice mode Vercel): getZAI() used to be called eagerly here,
    // before we knew whether ASR was actually needed. On Vercel the SDK
    // failed to load (no .z-ai-config) so EVERY voice turn 500'd — even
    // text input + Edge TTS that didn't need the SDK at all. Now we load
    // the SDK lazily: only when the audio-ASR path is taken OR when the
    // chosen TTS voice is a Z.ai voice (the Edge TTS path doesn't need
    // the SDK). Combined with the loader fix in src/lib/zai.ts, this
    // makes voice mode work end-to-end on Vercel with the premium voice.
    let zai: Awaited<ReturnType<typeof getZAI>> | null = null
    let transcript = ''
    if (message && message.trim()) {
      transcript = message.trim()
    } else if (audio && audio.length > 64) {
      const base64Audio = audio.includes(',') && audio.startsWith('data:')
        ? audio.split(',')[1]
        : audio
      if (!base64Audio) {
        return NextResponse.json({ error: 'Audio is empty.' }, { status: 400 })
      }
      try {
        zai = await getZAI()
      } catch (e) {
        console.error('[api/voice/turn] Z.ai SDK unavailable for ASR:', e)
        return NextResponse.json(
          { error: 'Voice recognition is unavailable right now. Try typing your message instead.' },
          { status: 503 }
        )
      }
      const asr = await zai.audio.asr.create({ file_base64: base64Audio })
      transcript = asr.text?.trim() ?? ''
    } else {
      return NextResponse.json({ error: 'Either audio or message is required.' }, { status: 400 })
    }
    if (!transcript) {
      return NextResponse.json({
        transcript: '',
        reply: '',
        thinking: '',
        audio: null,
        note: 'no-speech',
      })
    }

    // ---------- 2. Persist session ----------
    let session = parsed.data.sessionId
      ? await db.chatSession.findFirst({ where: { id: parsed.data.sessionId, kind: 'voice' } })
      : null
    if (!session) {
      session = await db.chatSession.create({
        data: {
          kind: 'voice',
          title: `Voice · ${transcript.slice(0, 50)}`,
        },
      })
    }
    await db.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: transcript },
    })

    // ---------- 3. Reply (single fast call, no separate thinking phase) ----------
    // Bug V2 (Voice speed): reduce maxTokens from 300 to 200 so the LLM
    // produces shorter, faster replies (voice replies should be 1-3 sentences).
    // Combined with the 15s per-model timeout in smart-chat.ts, this keeps
    // each voice turn well under 5s end-to-end.
    const historyMessages = parsed.data.history.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const languageHint =
      parsed.data.language && parsed.data.language !== 'auto'
        ? `\n[Reply in this language: ${parsed.data.language}]`
        : ''
    const reply = (await smartChat(
      [
        { role: 'assistant', content: buildVoiceSystemPrompt() + languageHint },
        ...historyMessages,
        { role: 'user', content: transcript },
      ],
      { maxTokens: 200, task: 'voice' }
    )).trim()
    if (!reply) {
      return NextResponse.json({ error: 'The assistant had nothing to say. Try again.' }, { status: 500 })
    }

    await db.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: reply },
    })

    // ---------- 5. Speak (TTS — NEXUS or free Microsoft neural voices) ----------
    let audioBase64: string | null = null
    let audioFormat = 'wav'
    try {
      const speechText = stripMarkdownForSpeech(reply).slice(0, 3000)

      if (isEdgeVoice(effectiveVoice)) {
        const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
        const tts = new MsEdgeTTS()
        // 96kbit/s MP3 — 2× bitrate vs the old 48kbit/s default for clearer speech.
        await tts.setMetadata(effectiveVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
        const { audioStream } = tts.toStream(speechText)
        const chunks: Buffer[] = []
        for await (const chunk of audioStream) {
          chunks.push(chunk as Buffer)
        }
        const mp3 = Buffer.concat(chunks)
        if (mp3.length > 100) {
          audioBase64 = mp3.toString('base64')
          audioFormat = 'mp3'
        }
      } else {
        // Premium Z.ai voice (tongtong / jam / xiaochen / ...). Load the
        // SDK lazily here — only needed for the non-Edge TTS path. If
        // ASR already loaded it above, reuse the same instance.
        if (!zai) {
          try {
            zai = await getZAI()
          } catch (e) {
            console.error('[api/voice/turn] Z.ai SDK unavailable for TTS:', e)
            // Reply text still usable — client will fall back to its
            // own TTS chain (server /api/tts → browser speechSynthesis).
            zai = null
          }
        }
        if (!zai) throw new Error('Z.ai TTS unavailable — falling back to client chain')
        const chunks = splitTextIntoChunks(speechText)
        // Bug G: synthesise every chunk in parallel (was sequential for-loop).
        const buffers = await Promise.all(
          chunks.map(async (chunk) => {
            const ttsRes = await zai!.audio.tts.create({
              input: chunk,
              voice: effectiveVoice,
              speed: 1.0,
              response_format: 'wav',
              stream: false,
            })
            const arrayBuffer = await ttsRes.arrayBuffer()
            return Buffer.from(new Uint8Array(arrayBuffer))
          })
        )
        if (buffers.length > 0) {
          const pcmParts = buffers.map((b) => b.subarray(44))
          const pcmLength = pcmParts.reduce((sum, p) => sum + p.length, 0)
          const merged = Buffer.concat([wavHeader(pcmLength), ...pcmParts])
          audioBase64 = merged.toString('base64')
        }
      }
    } catch (err) {
      console.error('[api/voice/turn] TTS failed:', err)
      // Reply text still usable — client will show it silently
    }

    return NextResponse.json({
      sessionId: session.id,
      transcript,
      reply,
      audio: audioBase64,
      audioFormat,
    })
  } catch (error) {
    console.error('[api/voice/turn] POST error:', error)
    const message = error instanceof Error ? error.message : 'Voice turn failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
