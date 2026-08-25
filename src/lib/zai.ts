/* ------------------------------------------------------------------ */
/* Z.ai ENGINE — the sandbox's built-in millisecond-latency gateway.   */
/*                                                                    */
/* IMPORTANT: z-ai-web-dev-sdk is INSTALLED only in the sandbox. On     */
/* Vercel the SDK is not bundled — every import is dynamic and        */
/* wrapped in try/catch so a missing/unusable SDK never crashes the     */
/* server. The smart-chat router checks `zaiConfigured()` first and    */
/* skips Z.ai when the SDK can't load (OpenRouter is the primary on    */
/* Vercel anyway).                                                    */
/* ------------------------------------------------------------------ */

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
}

const globalForZAI = globalThis as unknown as {
  zai?: ZaiSdk
  zaiInitFailed?: boolean
  zaiInitError?: string
}

/** Loads the Z.ai SDK if possible. Returns null when unavailable
 *  (missing/unusable — e.g. on Vercel). Memoized. */
async function loadZaiSdk(): Promise<ZaiSdk | null> {
  if (globalForZAI.zai) return globalForZAI.zai
  if (globalForZAI.zaiInitFailed) return null
  try {
    const mod = (await import('z-ai-web-dev-sdk')) as {
      default?: { create: () => Promise<ZaiSdk> }
      create?: () => Promise<ZaiSdk>
    }
    const factory = mod.default ?? (mod as unknown as { create: () => Promise<ZaiSdk> })
    globalForZAI.zai = await factory.create()
    return globalForZAI.zai
  } catch (err) {
    globalForZAI.zaiInitFailed = true
    globalForZAI.zaiInitError =
      err instanceof Error ? err.message : String(err)
    console.warn(
      '[zai] SDK unavailable — Z.ai engine disabled (likely on Vercel):',
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
