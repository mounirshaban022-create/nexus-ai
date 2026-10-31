/* ------------------------------------------------------------------ */
/* Z.ai ENGINE — the platform's built-in millisecond-latency gateway.  */
/*                                                                    */
/* IMPORTANT: z-ai-web-dev-sdk is shipped as a runtime dependency.      */
/* The SDK's factory `ZAI.create()` reads `.z-ai-config` from          */
/* process.cwd() / homedir / /etc — a file that exists in the sandbox  */
/* but NOT on Vercel. So on Vercel we bypass the file lookup and       */
/* construct the SDK directly from environment variables. Credentials  */
/* are NEVER hardcoded here: without ZAI_BASE_URL / ZAI_API_KEY the    */
/* Z.ai engine simply stays disabled (callers fall back to other      */
/* engines), which keeps the repo free of embedded secrets.            */
/* ------------------------------------------------------------------ */

type ZaiConfig = {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

type ZaiTtsResponse = Response & { arrayBuffer: () => Promise<ArrayBuffer> }

type ZaiVisionContentItem = {
  type: 'text' | 'image_url' | 'video_url' | 'file_url'
  text?: string
  image_url?: { url: string }
  video_url?: { url: string }
  file_url?: { url: string }
}

type ZaiImageGenResponse = {
  created?: number
  data?: Array<{ base64?: string }>
  content_filter?: Array<{ role: string; level: number }>
}

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
      /** Multimodal understanding — images, VIDEO (video_url), files. */
      createVision: (args: {
        model: string
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ZaiVisionContentItem[] }>
        stream?: boolean
        thinking?: { type: 'enabled' | 'disabled' }
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
        volume?: number
      }) => Promise<ZaiTtsResponse>
    }
    asr: {
      create: (args: { file_base64?: string; file?: string; stream?: boolean }) => Promise<{
        text?: string
      }>
    }
  }
  images: {
    generations: {
      create: (args: {
        model?: string
        prompt: string
        size?: string
      }) => Promise<ZaiImageGenResponse>
      /** Instruction-based AI photo editing — needs a prompt + source image.
       *  NOTE: the gateway's actual wire format is `images: [{ url }]`
       *  (array of {url} objects) even though older SDK typings say `image`.
       *  Both are accepted by this signature — the route passes `images`. */
      edit: (args: {
        model?: string
        prompt: string
        image?: string
        images?: Array<{ url: string }>
        size?: string
      }) => Promise<ZaiImageGenResponse>
    }
    /** Web-wide stock photo search with source attribution. */
    search: {
      create: (args: {
        query: string
        count?: number
        gl?: string
        rank?: boolean
      }) => Promise<{
        success: boolean
        query: string
        count: number
        ranked: boolean
        results: Array<{
          original_url: string
          caption?: string
          source?: string
          original_width?: string
          original_height?: string
        }>
        error?: string
      }>
    }
  }
}

const globalForZAI = globalThis as unknown as {
  zai?: ZaiSdk
  zaiInitFailed?: boolean
  zaiInitError?: string
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

/**
 * Sandbox detection — .z-ai-config only exists on the Z.ai dev sandbox
 * (process.cwd() / homedir / /etc). On Vercel none of these exist, so we
 * return null IMMEDIATELY without ever attempting a network call — this
 * keeps the original owner directive intact ("Z.ai doesn't work on
 * Vercel") while unlocking the millisecond engine + free multimodal
 * tools (AI photo edit, stock image search, video understanding) in
 * sandboxes where the platform gateway is genuinely available.
 */
function sandboxConfigFileExists(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as { existsSync: (p: string) => boolean }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as { join: (...p: string[]) => string }
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const candidates = [
      path.join(process.cwd(), '.z-ai-config'),
      home ? path.join(home, '.z-ai-config') : '',
      path.join('/etc', '.z-ai-config'),
    ].filter(Boolean)
    return candidates.some((p) => fs.existsSync(p))
  } catch {
    return false
  }
}

/** Loads the Z.ai SDK if possible. Returns null when neither the
 *  file-based config (sandbox) nor env vars (Vercel) are available.
 *  Memoized. Vercel-safe: zero network attempts when no config is found. */
async function loadZaiSdk(): Promise<ZaiSdk | null> {
  if (globalForZAI.zai) return globalForZAI.zai
  if (globalForZAI.zaiInitFailed) return null

  const envConfig = configFromEnv()
  if (!envConfig && !sandboxConfigFileExists()) {
    // Vercel / plain hosting: no Z.ai gateway → premium engines take over.
    globalForZAI.zaiInitFailed = true
    globalForZAI.zaiInitError = 'Z.ai gateway not present (no env config, no .z-ai-config file) — premium engines handle all AI workloads'
    return null
  }

  try {
    const mod = (await import('z-ai-web-dev-sdk')) as unknown as {
      default: { create: () => Promise<ZaiSdk> }
      create?: () => Promise<ZaiSdk>
    }
    const ZAI = mod.default ?? mod
    const sdk = (await (ZAI as { create: () => Promise<ZaiSdk> }).create()) as ZaiSdk
    if (sdk?.chat?.completions) {
      globalForZAI.zai = sdk
      console.log('[zai] SDK loaded — sandbox gateway active (chat/tts/asr/images/vision)')
      return sdk
    }
    globalForZAI.zaiInitFailed = true
    globalForZAI.zaiInitError = 'Z.ai SDK shape unexpected'
    return null
  } catch (e) {
    globalForZAI.zaiInitFailed = true
    globalForZAI.zaiInitError = e instanceof Error ? e.message : String(e)
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
