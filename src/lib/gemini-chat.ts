/**
 * GOOGLE GEMINI chat engine — premium pool entry.
 *
 * WHY: the app's strongest available key (GEMINI_API_KEY) was only used for
 * image generation and vision — never for CHAT. Gemini flash is markedly
 * smarter than the rotating free-pool models (Mistral-7B, Qwen-9B, LFM-2.6B)
 * with sub-second first tokens and native streaming via the OpenAI-compatible
 * endpoint.
 *
 * MODEL GENERATIONS (the "dumb AI" root cause, fixed 2026-08):
 *   Google RETIRED gemini-2.5-flash for NEW API keys ("no longer available to
 *   new users" — HTTP 404). The production key is new, so EVERY chat silently
 *   404'd, fell over to weaker engines after the first-delta watchdog, and
 *   Gemini benched itself — leaving the weakest free models to answer.
 *   Current generation for new keys: gemini-3.6-flash. Old 2.5 models stay at
 *   the tail so legacy keys keep working.
 *
 * Endpoint (OpenAI-compatible, documented, streaming-capable):
 *   POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 */

/** Multimodal content part — lets the model SEE images (OpenAI-compat format). */
export type GeminiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type GeminiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | GeminiContentPart[]
}

const GEMINI_OPENAI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'

export function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()
}

export function geminiChatConfigured(): boolean {
  return geminiKey().length > 0
}

/** Task → ordered Gemini models (current generation first, legacy tail). */
export function geminiModelsForTask(task?: string): string[] {
  switch (task) {
    case 'code':
    case 'reasoning':
    case 'documents':
      return ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']
    case 'voice':
    case 'fast':
      return ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash-lite']
    default:
      return ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
  }
}

/**
 * THINKING CONTROL — Gemini 2.5/3.x flash models think BY DEFAULT (dynamic
 * budget). Hidden thinking burns 5-25s before the first visible token, which
 * made every simple question feel like it was "thinking forever" and tripped
 * the pool's first-delta failover. Map task → reasoning_effort:
 *   chat/fast/voice → 'none'  (instant answers)
 *   code/documents  → 'low'
 *   reasoning       → 'medium'/'high' on pro.
 * SAFETY: if the API ever rejects the param (400), the engine retries the
 * same model WITHOUT it — the knob must never break the engine.
 */
export function geminiReasoningEffort(model: string, task?: string): string | undefined {
  const isPro = model.includes('pro')
  switch (task) {
    case 'reasoning':
      return isPro ? 'high' : 'medium'
    case 'code':
    case 'documents':
      return 'low'
    default:
      return isPro ? 'low' : 'none'
  }
}

interface GeminiSseChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null }
    message?: { content?: string | null; reasoning?: string | null }
  }>
  error?: { message?: string } | string
}

/** Read an SSE body, funnelling deltas. Returns the full text. */
async function readGeminiSse(
  res: Response,
  onDelta: (delta: string) => void
): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as GeminiSseChunk
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        /* keep-alive / partial line — ignore */
      }
    }
  }
  return full
}

function buildBody(
  model: string,
  messages: GeminiChatMessage[],
  opts: { task?: string; maxTokens?: number; temperature?: number },
  stream: boolean,
  withEffort: boolean
): string {
  const effort = withEffort ? geminiReasoningEffort(model, opts.task) : undefined
  return JSON.stringify({
    model,
    messages,
    ...(stream ? { stream: true } : {}),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4000,
    ...(effort ? { reasoning_effort: effort } : {}),
  })
}

/** STREAMING chat completion (SSE, token-by-token) via the OpenAI-compatible API. */
export async function geminiStreamChatCompletion(
  messages: GeminiChatMessage[],
  onDelta: (delta: string) => void,
  opts: { task?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = geminiKey()
  if (!key) throw new Error('GEMINI_API_KEY is not configured')

  const models = geminiModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 60_000
  let lastError: unknown = null

  for (const model of models) {
    // Attempt ladder: with reasoning_effort → without it (if the API
    // rejects the param, the 400 retry keeps the engine alive).
    for (const withEffort of [true, false]) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
      try {
        const res = await fetch(`${GEMINI_OPENAI_BASE}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: buildBody(model, messages, opts, true, withEffort),
        })
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as GeminiSseChunk
          const err = typeof body.error === 'string' ? body.error : body.error?.message
          const e = new Error(err || `Gemini responded ${res.status}`)
          // 400 with effort → retry the same model without the knob.
          if (res.status === 400 && withEffort) { lastError = e; continue }
          throw e
        }
        const full = await readGeminiSse(res, onDelta)
        if (full.trim()) return { content: full, model }
        throw new Error(`Gemini stream produced nothing from ${model}`)
      } catch (err) {
        lastError = err
        if (!withEffort) break // real failure — next model
        // If the error is NOT a request-shape 400, don't bother retrying
        // without the knob — but we can't always introspect, so fall through
        // to the no-effort attempt once (cheap, same model).
        continue
      }
    }
  }
  throw lastError instanceof Error
    ? new Error(`Gemini stream failed: ${lastError.message}`)
    : new Error('Gemini stream failed')
}

/** One-shot (non-streaming) chat completion. */
export async function geminiChatCompletion(
  messages: GeminiChatMessage[],
  opts: { task?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = geminiKey()
  if (!key) throw new Error('GEMINI_API_KEY is not configured')

  const models = geminiModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 45_000
  let lastError: unknown = null

  for (const model of models) {
    for (const withEffort of [true, false]) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
      try {
        const res = await fetch(`${GEMINI_OPENAI_BASE}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: buildBody(model, messages, opts, false, withEffort),
        })
        const data = (await res.json().catch(() => ({}))) as GeminiSseChunk
        if (!res.ok) {
          const err = typeof data.error === 'string' ? data.error : data.error?.message
          const e = new Error(err || `Gemini responded ${res.status}`)
          if (res.status === 400 && withEffort) { lastError = e; continue }
          throw e
        }
        const choice = data.choices?.[0]?.message
        const content = choice?.content ?? choice?.reasoning
        if (content && content.trim()) return { content, model }
        throw new Error(`Empty response from ${model}`)
      } catch (err) {
        lastError = err
        if (!withEffort) break
        continue
      }
    }
  }
  throw lastError instanceof Error
    ? new Error(`Gemini chat failed: ${lastError.message}`)
    : new Error('Gemini chat failed')
}
