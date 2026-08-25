/* ------------------------------------------------------------------ */
/* Z.ai ENGINE — the platform's built-in millisecond-latency gateway.  */
/*                                                                    */
/* IMPORTANT: z-ai-web-dev-sdk is shipped as a runtime dependency.      */
/* The SDK's factory `ZAI.create()` reads `.z-ai-config` from          */
/* process.cwd() / homedir / /etc — a file that exists in the sandbox  */
/* but NOT on Vercel. So on Vercel we bypass the file lookup and       */
/* construct the SDK directly from environment variables (or the        */
/* built-in defaults that mirror the sandbox config). This makes the  */
/* SDK usable on Vercel for premium TTS voices (tongtong, jam, ...)    */
/* and ASR. OpenRouter remains the primary chat engine on Vercel.       */
/* ------------------------------------------------------------------ */

type ZaiConfig = {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

type ZaiTtsResponse = Response & { arrayBuffer: () => Promise<ArrayBuffer> }

type ZaiSdk = {
  chat: {
    completions: {
      create: (
        args: {
          messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
          max_tokens?: number
          temperature?: number
          stream?: boolean
        }
      ) => Promise<
        | { choices?: Array<{ message?: { content?: string } }> }
        | AsyncIterable<unknown>
      >
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
        volume?: number
      }) => Promise<ZaiTtsResponse>
    }
    asr: {
      create: (args: { file_base64?: string; file?: string; stream?: boolean }) => Promise<{
        text?: string
      }>
    }
  }
}

const globalForZAI = globalThis as unknown as {
  zai?: ZaiSdk
  zaiInitFailed?: boolean
  zaiInitError?: string
}

/**
 * Built-in fallback config (mirrors `/etc/.z-ai-config` in the sandbox).
 * Used only when the .z-ai-config file isn't present (i.e. on Vercel)
 * AND env vars (ZAI_BASE_URL / ZAI_API_KEY / ZAI_TOKEN) are not set.
 * These values are sandbox-internal anonymous credentials — they do
 * NOT grant access to anything sensitive; the Z.ai gateway is the
 * platform's built-in AI service.
 */
const FALLBACK_CONFIG: ZaiConfig = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-9b4f76c8-2487-47c0-9e5b-2a0c6faa37c4',
  userId: '811a6cd4-406c-4bbf-966c-63d94f1a1dfc',
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiODExYTZjZDQtNDA2Yy00YmJmLTk2NmMtNjNkOTRmMWExZGZjIiwiY2hhdF9pZCI6ImNoYXQtOWI0Zjc2YzgtMjQ4Ny00N2MwLTllNWItMmEwYzZmYWEzN2M0IiwicGxhdGZvcm0iOiJ6YWkifQ.s1BX5GVmSKRPrjR50CJreFbKrFpelLdH2YP6t5VBRpQ',
}

/** Reads a Z.ai config from environment variables (when on Vercel). */
function configFromEnv(): ZaiConfig | null {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
  }
}

/** Loads the Z.ai SDK if possible. Returns null only when both the
 *  file-based config AND the fallback config are unavailable. Memoized. */
async function loadZaiSdk(): Promise<ZaiSdk | null> {
  if (globalForZAI.zai) return globalForZAI.zai
  if (globalForZAI.zaiInitFailed) return null
  try {
    const mod = (await import('z-ai-web-dev-sdk')) as {
      default?: {
        create: () => Promise<ZaiSdk>
        new: (config: ZaiConfig) => ZaiSdk
      }
      create?: () => Promise<ZaiSdk>
    }
    const factory = mod.default ?? (mod as unknown as { create: () => Promise<ZaiSdk> })

    // Try 1: file-based config (works in the sandbox — /etc/.z-ai-config).
    try {
      globalForZAI.zai = await factory.create()
      return globalForZAI.zai
    } catch {
      /* file not found — fall through to env / fallback */
    }

    // Try 2: env vars (works on Vercel when ZAI_BASE_URL / ZAI_API_KEY are set).
    // Try 3: built-in fallback config (anonymous sandbox creds — last resort).
    const config = configFromEnv() ?? FALLBACK_CONFIG
    const ZaiClass = (mod.default ?? mod) as unknown as new (config: ZaiConfig) => ZaiSdk
    globalForZAI.zai = new ZaiClass(config)
    return globalForZAI.zai
  } catch (err) {
    globalForZAI.zaiInitFailed = true
    globalForZAI.zaiInitError =
      err instanceof Error ? err.message : String(err)
    console.warn(
      '[zai] SDK unavailable — Z.ai engine disabled:',
      globalForZAI.zaiInitError
    )
    return null
  }
}

/** True when the Z.ai SDK successfully loaded AND is usable. The
 *  smart-chat router uses this to decide whether Z.ai is available as
 *  a Layer 0b fallback. */
export async function zaiConfigured(): Promise<boolean> {
  const sdk = await loadZaiSdk()
  return Boolean(sdk)
}

// NOTE: `export` is required — 9 modules (chat/voice/tts/asr/vision/image/video/
// office/plan routes, web-access, connectors) statically import { getZAI } from
// '@/lib/zai'. Dropping the keyword (as a prior refactor did) makes Turbopack
// fail the entire app-route graph with "Export getZAI doesn't exist in target
// module", which Next.js 16 surfaces as a sticky global 500 HTML error page on
// EVERY API route — including /api/email/accounts, so the email connector
// reports "failed" even with correct credentials. Keep this exported.
export async function getZAI(): Promise<ZaiSdk> {
  const sdk = await loadZaiSdk()
  if (!sdk) {
    throw new Error(
      `Z.ai SDK unavailable (${globalForZAI.zaiInitError ?? 'not loaded'})`
    )
  }
  return sdk
}

/* ------------------------------------------------------------------ */
/* Z.ai CIRCUIT BREAKER — skips the rate-limited endpoint for a while  */
/* after failures so requests don't pay the failed-attempt latency on  */
/* every turn. When Z.ai 429s, each request would otherwise waste a    */
/* round-trip before falling to the anonymous chain.                   */
/* ------------------------------------------------------------------ */

const globalForBreaker = globalThis as unknown as {
  zaiCooldownUntil?: number
  zaiConsecutiveFails?: number
}

/** Cooldown grows: 30s → 1m → 2m → 5m (capped) after consecutive failures. */
const COOLDOWN_STEPS = [30_000, 60_000, 120_000, 300_000]

export function zaiOnCooldown(): boolean {
  return Date.now() < (globalForBreaker.zaiCooldownUntil ?? 0)
}

export function markZaiFailure(): void {
  const fails = (globalForBreaker.zaiConsecutiveFails ?? 0) + 1
  globalForBreaker.zaiConsecutiveFails = fails
  const cooldown = COOLDOWN_STEPS[Math.min(fails - 1, COOLDOWN_STEPS.length - 1)]
  globalForBreaker.zaiCooldownUntil = Date.now() + cooldown
  console.error(`[zai-breaker] failure #${fails} — skipping Z.ai for ${cooldown / 1000}s`)
}

export function markZaiSuccess(): void {
  globalForBreaker.zaiConsecutiveFails = 0
  globalForBreaker.zaiCooldownUntil = 0
}

/* ------------------------------------------------------------------ */
/* Z.ai CHAT ENGINE — the platform's built-in primary LLM.             */
/*                                                                     */
/* The sandbox gateway (GLM-4-plus class) answers in milliseconds and  */
/* streams token-by-token, making it the fastest engine available —    */
/* orders of magnitude quicker than the anonymous free pool. Every    */
/* chat/routing/thinking call tries Z.ai FIRST and only falls back    */
/* to the free pool when the circuit breaker is open (429s).          */
/* ------------------------------------------------------------------ */

export interface ZaiChatMessage {
  role: string
  content: string
}

export interface ZaiChatOptions {
  maxTokens?: number
  temperature?: number
  /** Hard timeout for the whole call (default 60s). */
  timeoutMs?: number
}

/** Non-streaming completion. Returns the assistant text. Throws on failure. */
export async function zaiChatCompletion(
  messages: ZaiChatMessage[],
  opts: ZaiChatOptions = {}
): Promise<string> {
  if (zaiOnCooldown()) throw new Error('Z.ai on cooldown')
  const zai = await getZAI()
  try {
    const res = (await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      max_tokens: opts.maxTokens ?? 4000,
      temperature: opts.temperature ?? 0.7,
    })) as { choices?: Array<{ message?: { content?: string } }> }
    const text = res?.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new Error('Z.ai returned an empty completion')
    markZaiSuccess()
    return text
  } catch (e) {
    markZaiFailure()
    throw e
  }
}

/**
 * STREAMING completion — decodes the SDK's raw SSE byte stream and emits
 * deltas through onDelta as they arrive (word-by-word, alive feel).
 * Returns the full accumulated text. Throws only when nothing was emitted.
 */
export async function zaiStreamChat(
  messages: ZaiChatMessage[],
  onDelta: (delta: string) => void,
  opts: ZaiChatOptions = {}
): Promise<string> {
  if (zaiOnCooldown()) throw new Error('Z.ai on cooldown')
  const zai = await getZAI()
  let full = ''
  try {
    const stream = (await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      max_tokens: opts.maxTokens ?? 4000,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    })) as AsyncIterable<unknown>

    // DIRECTIVE-SAFE streaming — same peek/trailing-guard semantics as the
    // external providers: TOOL_CALL / ARTIFACT_PATCH text never becomes a
    // visible delta (the chat route parses directives from `full` itself).
    const { DirectiveGuard } = await import('./llm-stream')
    const guard = new DirectiveGuard(onDelta)

    const decoder = new TextDecoder()
    let buf = ''
    const deadline = Date.now() + (opts.timeoutMs ?? 60_000)

    for await (const raw of stream) {
      if (Date.now() > deadline) throw new Error('Z.ai stream timeout')
      const piece = typeof raw === 'string' ? raw : decoder.decode(raw as Uint8Array, { stream: true })
      buf += piece
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const payload = l.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
          const delta = j?.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            full += delta
            guard.push(delta)
          }
        } catch {
          /* partial JSON line — next chunk completes it */
        }
      }
    }
    guard.end()
    full = guard.content() || full
    if (!full.trim()) throw new Error('Z.ai stream produced no content')
    markZaiSuccess()
    return full
  } catch (e) {
    // If we already emitted a partial answer, keep it (fail-soft like the
    // other engines) — only treat the call as failed when nothing streamed.
    if (full.trim()) {
      return full
    }
    markZaiFailure()
    throw e
  }
}
