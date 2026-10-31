/* ------------------------------------------------------------------ */
/* NEXUS — real-time AI voice call service (standalone socket.io).     */
/*                                                                     */
/* A "phone call with the AI": the client streams one utterance per    */
/* `call:segment` (base64 webm/opus from MediaRecorder VAD) and this   */
/* service runs the turn pipeline ASR → LLM → sentence-chunked TTS,    */
/* emitting transcript captions, phase updates and sequential audio    */
/* chunks back over the socket so playback can start before the whole  */
/* reply is synthesized. Text input (`call:text`) takes the same       */
/* pipeline minus ASR (captions-only mode / typed fallback).           */
/*                                                                     */
/* Standalone bun process — NO `@/` imports; the small helpers         */
/* (system prompt, markdown stripping, sentence chunking) are          */
/* self-contained copies of the patterns in src/app/api/voice/turn.    */
/* ------------------------------------------------------------------ */

import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'

const PORT = 3003 // fixed — the Caddy gateway routes /?XTransformPort=3003 here
const HISTORY_LIMIT = 16 // conversation turns kept per call (user+assistant msgs)
const GUARD_MS = 20_000 // hard timeout for every ASR / LLM / TTS call
const DEFAULT_VOICE = 'tongtong' // premium Z.ai neural voice

type ChatRole = 'system' | 'user' | 'assistant'
interface ChatMsg {
  role: ChatRole
  content: string
}

/* ------------------------------------------------------------------ */
/* Z.ai SDK — structural types mirroring src/lib/zai.ts. Loaded lazy   */
/* and memoized: `.z-ai-config` is resolvable from the sandbox homedir. */
/* ------------------------------------------------------------------ */

type ZaiTtsResponse = Response & { arrayBuffer: () => Promise<ArrayBuffer> }
type ZaiSdk = {
  chat: {
    completions: {
      create: (args: {
        messages: ChatMsg[]
        max_tokens?: number
        temperature?: number
        stream?: boolean
      }) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>
    }
  }
  audio: {
    tts: {
      create: (args: {
        input: string
        voice?: string
        speed?: number
        response_format?: string
        stream?: boolean
      }) => Promise<ZaiTtsResponse>
    }
    asr: {
      create: (args: { file_base64?: string; stream?: boolean }) => Promise<{
        text?: string
      }>
    }
  }
}

let zaiPromise: Promise<ZaiSdk> | null = null

/** Lazy SDK singleton — first turn initializes, later turns reuse it. */
function getZAI(): Promise<ZaiSdk> {
  if (!zaiPromise) {
    zaiPromise = (async () => {
      const mod = await import('z-ai-web-dev-sdk')
      const ZAI = ((mod as { default?: unknown }).default ?? mod) as {
        create: () => Promise<ZaiSdk>
      }
      const sdk = await ZAI.create()
      console.log('[voice-call] Z.ai SDK ready')
      return sdk
    })().catch((err) => {
      // Allow a retry on the NEXT turn instead of caching the failure forever.
      zaiPromise = null
      throw err
    })
  }
  return zaiPromise
}

/* ------------------------------------------------------------------ */
/* Guards — a hung ASR/LLM/TTS call must never stall the socket.       */
/* Every remote call races a hard timeout AND the turn's AbortController*/
/* so `call:interrupt` rejects pending awaits promptly.                */
/* ------------------------------------------------------------------ */

function guard<T>(
  p: Promise<T>,
  ac: AbortController | null,
  label: string,
  ms: number = GUARD_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let onAbort: (() => void) | null = null
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (onAbort && ac) ac.signal.removeEventListener('abort', onAbort)
      fn()
    }
    if (ac) {
      if (ac.signal.aborted) {
        settle(() => reject(new Error(`${label} aborted`)))
        return
      }
      onAbort = () => settle(() => reject(new Error(`${label} aborted`)))
      ac.signal.addEventListener('abort', onAbort, { once: true })
    }
    timer = setTimeout(
      () => settle(() => reject(new Error(`${label} timed out after ${ms}ms`))),
      ms
    )
    p.then(
      (v) => settle(() => resolve(v)),
      (e) => settle(() => reject(e instanceof Error ? e : new Error(String(e))))
    )
  })
}

/* ------------------------------------------------------------------ */
/* Per-socket conversation state.                                      */
/* ------------------------------------------------------------------ */

interface CallState {
  voice: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  abort: AbortController | null
  interrupted: boolean
  busy: boolean
  /** Bumped on start/end/interrupt so a stale turn's cleanup can't clobber a newer turn. */
  turnId: number
}

function newCallState(): CallState {
  return { voice: DEFAULT_VOICE, history: [], abort: null, interrupted: false, busy: false, turnId: 0 }
}

/* ------------------------------------------------------------------ */
/* Speech helpers (self-contained mirrors of /api/voice/turn logic).   */
/* ------------------------------------------------------------------ */

/** Warm, concise phone-companion persona — rebuilt per turn so the
 *  injected clock is always fresh (same reasoning as Bug J in /voice/turn). */
function buildSystemPrompt(): string {
  return [
    'You are NEXUS, a warm, intelligent AI companion created by Mounir Shaaban, on a live real-time voice call.',
    'RULES (your reply is spoken aloud over a phone):',
    '1. SHORT: 1-3 sentences, max ~50 words, unless the user explicitly asks for detail.',
    '2. Natural spoken style: contractions, no markdown, no lists, no emoji, no stage directions.',
    '3. Direct and warm — never waffle, never repeat the question back.',
    '4. LANGUAGE: reply in the SAME language the user just spoke.',
    `5. CURRENT TIME: it is ${new Date().toISOString()}. Use it for any time or date question.`,
  ].join('\n')
}

/** Strips markdown syntax so TTS speaks naturally. */
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Splits a reply into sentence chunks (~2 sentences each, delimiters kept)
 *  so TTS starts streaming after the first couple of sentences instead of
 *  waiting for the whole reply. CJK/Arabic sentence enders included. */
function sentenceChunks(text: string, per = 2): string[] {
  const parts =
    text.match(/[^.!?…؟。！？]+[.!?…؟。！？]*["'”’)\]]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ??
    [text]
  const chunks: string[] = []
  for (let i = 0; i < parts.length; i += per) {
    chunks.push(parts.slice(i, i + per).join(' ').trim().slice(0, 600))
  }
  return chunks.filter(Boolean)
}

/** Accepts raw base64 or a `data:` URL (tolerant like /api/voice/turn). */
function base64Audio(raw: string): string {
  if (raw.startsWith('data:')) {
    const idx = raw.indexOf(',')
    if (idx >= 0) return raw.slice(idx + 1)
  }
  return raw
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.startsWith('asr')) return 'I could not hear that clearly — try speaking again.'
  if (msg.includes('timed out')) return 'That took too long — let’s try again.'
  return 'Something went wrong on the line — try again.'
}

/* ------------------------------------------------------------------ */
/* The turn pipeline: transcript → LLM → sentence-chunked TTS stream.  */
/* ------------------------------------------------------------------ */

async function runTurn(
  socket: Socket,
  state: CallState,
  input: { audio?: string; text?: string }
): Promise<void> {
  if (state.busy) {
    // The client never sends segments while the assistant is speaking
    // (its VAD is paused / barge-in discards), so this is just a safety net.
    console.warn(`[voice-call] turn skipped for ${socket.id} — previous turn still running`)
    return
  }
  const turn = ++state.turnId
  state.busy = true
  state.interrupted = false
  const ac = new AbortController()
  state.abort = ac
  try {
    const zai = await getZAI()

    /* ---- 1. Transcript: ASR for audio segments, direct for typed text ---- */
    let transcript = ''
    if (typeof input.text === 'string' && input.text.trim()) {
      transcript = input.text.trim().slice(0, 4000)
    } else if (typeof input.audio === 'string' && input.audio.length > 64) {
      socket.emit('call:state', { phase: 'transcribing' })
      const asr = await guard(
        zai.audio.asr.create({ file_base64: base64Audio(input.audio) }),
        ac,
        'asr'
      )
      transcript = (asr?.text ?? '').trim().slice(0, 4000)
    }
    if (state.turnId !== turn) return // call ended / restarted mid-turn
    if (!transcript) {
      // Pure silence / unreadable audio → quietly keep listening.
      socket.emit('call:state', { phase: 'listening' })
      return
    }

    /* ---- 2. LLM reply (short, spoken-style) ---- */
    socket.emit('call:transcript', { role: 'user', text: transcript })
    socket.emit('call:state', { phase: 'thinking' })
    state.history.push({ role: 'user', content: transcript })
    if (state.history.length > HISTORY_LIMIT) {
      state.history.splice(0, state.history.length - HISTORY_LIMIT)
    }

    const completion = await guard(
      zai.chat.completions.create({
        messages: [{ role: 'system', content: buildSystemPrompt() }, ...state.history],
        max_tokens: 300,
        temperature: 0.7,
      }),
      ac,
      'llm'
    )
    if (state.turnId !== turn || state.interrupted) return
    const reply = stripMarkdownForSpeech(completion?.choices?.[0]?.message?.content ?? '')
    if (!reply) {
      socket.emit('call:error', { message: 'I did not catch a reply — try again.' })
      socket.emit('call:state', { phase: 'listening' })
      return
    }

    /* ---- 3. Captions first, then spoken chunks ---- */
    socket.emit('call:transcript', { role: 'assistant', text: reply })
    socket.emit('call:state', { phase: 'speaking' })

    /* The exchange already "happened" — remember it even if the audio gets
     * interrupted halfway through speaking. */
    state.history.push({ role: 'assistant', content: reply })
    if (state.history.length > HISTORY_LIMIT) {
      state.history.splice(0, state.history.length - HISTORY_LIMIT)
    }

    /* ---- 4. Streamed TTS: sentence chunks, in order, interruptible ---- */
    const chunks = sentenceChunks(reply)
    let seq = 0
    for (const chunk of chunks) {
      if (state.interrupted || ac.signal.aborted || state.turnId !== turn) return
      try {
        const res = await guard(
          zai.audio.tts.create({
            input: chunk,
            voice: state.voice,
            speed: 1.0,
            response_format: 'wav',
            stream: false,
          }),
          ac,
          'tts'
        )
        const bytes = await guard(res.arrayBuffer(), ac, 'tts-body')
        if (state.interrupted || ac.signal.aborted || state.turnId !== turn) return
        socket.emit('call:audio', {
          seq,
          b64: Buffer.from(new Uint8Array(bytes)).toString('base64'),
        })
        seq += 1
      } catch (err) {
        if (state.interrupted || ac.signal.aborted) return
        // One failed chunk must not kill the whole spoken reply.
        console.warn(`[voice-call] tts chunk ${seq} failed:`, err instanceof Error ? err.message : err)
      }
    }

    socket.emit('call:state', { phase: 'listening' })
  } catch (err) {
    if (state.interrupted || ac.signal.aborted) return // user interrupted — handled
    console.error('[voice-call] turn failed:', err instanceof Error ? err.message : err)
    socket.emit('call:error', { message: friendlyError(err) })
    socket.emit('call:state', { phase: 'listening' })
  } finally {
    if (state.turnId === turn) {
      state.busy = false
      state.abort = null
    }
  }
}

/* ------------------------------------------------------------------ */
/* Socket.io server (path '/' is required by the Caddy gateway).       */
/* ------------------------------------------------------------------ */

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

io.on('connection', (socket: Socket) => {
  const state = newCallState()
  console.log(`[voice-call] connected: ${socket.id}`)

  socket.on('call:start', (raw: unknown) => {
    const voiceRaw = (raw as { voice?: unknown } | undefined)?.voice
    state.voice =
      typeof voiceRaw === 'string' && voiceRaw.trim() && voiceRaw.length <= 60
        ? voiceRaw.trim()
        : DEFAULT_VOICE
    state.history = []
    state.turnId += 1
    state.busy = false
    state.interrupted = false
    state.abort?.abort()
    state.abort = null
    socket.emit('call:ready', { ok: true, voice: state.voice })
    console.log(`[voice-call] call started ${socket.id} (voice=${state.voice})`)
  })

  socket.on('call:segment', (raw: unknown) => {
    const audio = (raw as { audio?: unknown } | undefined)?.audio
    if (typeof audio !== 'string' || audio.length < 64 || audio.length > 12_000_000) {
      socket.emit('call:error', { message: 'That audio segment was unreadable — try again.' })
      return
    }
    void runTurn(socket, state, { audio })
  })

  socket.on('call:text', (raw: unknown) => {
    const text = (raw as { text?: unknown } | undefined)?.text
    if (typeof text !== 'string' || !text.trim()) return
    void runTurn(socket, state, { text: text.slice(0, 4000) })
  })

  socket.on('call:interrupt', () => {
    state.interrupted = true
    state.abort?.abort() // rejects any in-flight ASR/LLM/TTS await via guard()
    socket.emit('call:state', { phase: 'listening' })
    console.log(`[voice-call] interrupted: ${socket.id}`)
  })

  socket.on('call:end', () => {
    state.turnId += 1 // invalidates any in-flight turn's finally-cleanup
    state.interrupted = true
    state.abort?.abort()
    state.abort = null
    state.busy = false
    state.history = []
    console.log(`[voice-call] call ended: ${socket.id}`)
  })

  socket.on('disconnect', () => {
    state.turnId += 1
    state.interrupted = true
    state.abort?.abort()
    console.log(`[voice-call] disconnected: ${socket.id}`)
  })

  socket.on('error', (err: unknown) => {
    console.error(`[voice-call] socket error (${socket.id}):`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[voice-call] socket.io service listening on port ${PORT} (path '/')`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
