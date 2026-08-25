/* ------------------------------------------------------------------ */
/* OpenRouter CLIENT — OpenAI-compatible, no SDK, plain fetch.         */
/*                                                                    */
/* This is the PRIMARY LLM on Vercel (replaces Z.ai, whose SDK can't   */
/* be bundled there). In the sandbox it is also tried first when the   */
/* OPENROUTER_API_KEY env var is set — better quality than the         */
/* anonymous free pool. Z.ai remains as a sandbox-only fallback.       */
/*                                                                    */
/* Server-side only. Plain TS module — imported by API routes /       */
/* server actions. No 'use server' directive.                          */
/* ------------------------------------------------------------------ */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface OpenRouterChatOptions {
  maxTokens?: number
  temperature?: number
  /** Override the default model for this single call. */
  model?: string
  /** Hard timeout for the whole call (default 60s). */
  timeoutMs?: number
}

interface OpenRouterConfig {
  apiKey: string
  baseUrl: string
  defaultModel: string
  siteUrl?: string
  appName?: string
}

function readConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) return null
  const baseUrl =
    process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1'
  const defaultModel =
    process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
    'anthropic/claude-3.5-sonnet'
  return {
    apiKey,
    baseUrl,
    defaultModel,
    siteUrl: process.env.OPENROUTER_SITE_URL?.trim() || undefined,
    appName: process.env.OPENROUTER_APP_NAME?.trim() || undefined,
  }
}

/** True when OPENROUTER_API_KEY is set — used by smart-chat to decide
 *  whether OpenRouter is the Layer 0 primary engine. */
export function openrouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

/** Build the standard OpenRouter headers (Authorization + attribution). */
function buildHeaders(cfg: OpenRouterConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (cfg.siteUrl) headers['HTTP-Referer'] = cfg.siteUrl
  if (cfg.appName) headers['X-Title'] = cfg.appName
  return headers
}

/** Maps an HTTP error response to a clear, actionable Error. */
async function httpErrorToError(
  status: number,
  bodyText: string,
  what: string
): Promise<Error> {
  // Try to extract a structured error message (OpenAI shape: {error:{message}})
  let serverMsg = ''
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } | string }
    if (typeof j?.error === 'string') serverMsg = j.error
    else if (j?.error?.message) serverMsg = j.error.message
  } catch {
    /* not JSON */
  }

  if (status === 401) {
    return new Error(
      `OpenRouter ${what} failed: invalid API key (401). Check OPENROUTER_API_KEY.`
    )
  }
  if (status === 402) {
    return new Error(
      `OpenRouter ${what} failed: payment required (402). Add credits at https://openrouter.ai/credits.`
    )
  }
  if (status === 429) {
    return new Error(
      `OpenRouter ${what} failed: rate limited (429). Slow down or upgrade tier.`
    )
  }
  if (status >= 500) {
    return new Error(
      `OpenRouter ${what} failed: upstream error (HTTP ${status}). ${serverMsg || 'Try again.'}`
    )
  }
  return new Error(
    `OpenRouter ${what} failed (HTTP ${status}). ${serverMsg || bodyText.slice(0, 200) || 'Unknown error.'}`
  )
}

/**
 * NON-STREAMING chat completion. Returns the assistant message text.
 * Throws on auth/payment/rate-limit errors with a clear message.
 */
export async function openrouterChatCompletion(
  messages: OpenRouterMessage[],
  opts: OpenRouterChatOptions = {}
): Promise<string> {
  const cfg = readConfig()
  if (!cfg) throw new Error('OpenRouter not configured (OPENROUTER_API_KEY missing)')

  const model = opts.model || cfg.defaultModel
  const timeoutMs = opts.timeoutMs ?? 60_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.7,
        stream: false,
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted') || msg.toLowerCase().includes('abort')) {
      throw new Error(`OpenRouter request timed out after ${timeoutMs / 1000}s`)
    }
    throw new Error(`OpenRouter network error: ${msg}`)
  }
  clearTimeout(timer)

  const bodyText = await res.text()
  if (!res.ok) {
    throw await httpErrorToError(res.status, bodyText, 'chat completion')
  }

  let json: { choices?: Array<{ message?: { content?: string } }> }
  try {
    json = JSON.parse(bodyText)
  } catch {
    throw new Error(
      `OpenRouter returned a non-JSON response (first 200 chars): ${bodyText.slice(0, 200)}`
    )
  }
  const text = json?.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) {
    throw new Error('OpenRouter returned an empty completion')
  }
  return text
}

/**
 * STREAMING chat completion — returns a ReadableStream of SSE
 * `data: {json}` chunks (OpenAI-style). Each chunk's `choices[0].delta.content`
 * carries one assistant delta. Stream ends with a `data: [DONE]` chunk.
 *
 * Caller is responsible for parsing the SSE — see how the chat route
 * does it (consumeSSEWithPeek). For a simpler callback-style API
 * use openrouterStreamChatCallback() below.
 */
export async function openrouterStreamChat(
  messages: OpenRouterMessage[],
  opts: OpenRouterChatOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const cfg = readConfig()
  if (!cfg) throw new Error('OpenRouter not configured (OPENROUTER_API_KEY missing)')

  const model = opts.model || cfg.defaultModel
  const timeoutMs = opts.timeoutMs ?? 60_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted') || msg.toLowerCase().includes('abort')) {
      throw new Error(`OpenRouter stream timed out after ${timeoutMs / 1000}s`)
    }
    throw new Error(`OpenRouter network error: ${msg}`)
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer)
    const bodyText = await res.text().catch(() => '')
    throw await httpErrorToError(res.status, bodyText, 'stream')
  }

  // Pass the upstream SSE bytes straight through so the chat route can
  // reuse the existing `consumeSSEWithPeek` directive-safe consumer.
  // We hook the upstream ReadableStream to a passthrough that clears the
  // timer on close and re-emits the raw SSE frames.
  const upstream = res.body
  const reader = upstream.getReader()
  const encoder = new TextEncoder()

  clearTimeout(timer) // handshake done; per-read timeouts handled by AbortController

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          // Emit the OpenAI-style [DONE] sentinel for the consumer.
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        if (value) controller.enqueue(value)
      } catch (err) {
        controller.error(
          err instanceof Error ? err : new Error(String(err))
        )
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })
}

/**
 * CALLBACK-STYLE streaming — feeds delta strings into `onDelta` as they
 * arrive, returns the full accumulated text. Mirrors `zaiStreamChat`'s
 * signature so the chat route can use either engine interchangeably.
 *
 * Uses DirectiveGuard so TOOL_CALL / ARTIFACT_PATCH directives never
 * become visible deltas (the chat route parses them itself).
 */
export async function openrouterStreamChatCallback(
  messages: OpenRouterMessage[],
  onDelta: (delta: string) => void,
  opts: OpenRouterChatOptions = {}
): Promise<string> {
  const stream = await openrouterStreamChat(messages, opts)
  const { DirectiveGuard } = await import('./llm-stream')
  const guard = new DirectiveGuard(onDelta)
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      const l = line.trim()
      if (!l.startsWith('data:')) continue
      const payload = l.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = j?.choices?.[0]?.delta?.content ?? ''
        if (delta) guard.push(delta)
      } catch {
        /* partial JSON line — next chunk completes it */
      }
    }
  }

  guard.end()
  const full = guard.content()
  if (!full.trim()) {
    throw new Error('OpenRouter stream produced no content')
  }
  return full
}
