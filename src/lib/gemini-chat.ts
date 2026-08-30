/**
 * GOOGLE GEMINI chat engine — premium pool entry.
 *
 * WHY: the app's strongest available key (GEMINI_API_KEY) was only used for
 * image generation and vision — never for CHAT. Gemini 2.5 Flash is markedly
 * smarter than the rotating free-pool models (Mistral-7B, Qwen-9B, LFM-2.6B)
 * that used to answer most chats, with sub-second first tokens and native
 * streaming via the OpenAI-compatible endpoint.
 *
 * Endpoint (OpenAI-compatible, documented, streaming-capable):
 *   POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 */

export type GeminiChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const GEMINI_OPENAI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'

export function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()
}

export function geminiChatConfigured(): boolean {
  return geminiKey().length > 0
}

/** Task → ordered Gemini models (best balance first). */
export function geminiModelsForTask(task?: string): string[] {
  switch (task) {
    case 'code':
      return ['gemini-2.5-flash', 'gemini-2.5-pro']
    case 'reasoning':
      return ['gemini-2.5-flash', 'gemini-2.5-pro']
    case 'documents':
      return ['gemini-2.5-flash', 'gemini-2.5-pro']
    case 'voice':
    case 'fast':
      return ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
    default:
      return ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
  }
}

interface GeminiSseChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null }
    message?: { content?: string | null; reasoning?: string | null }
  }>
  error?: { message?: string } | string
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
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4000,
        }),
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as GeminiSseChunk
        const err = typeof body.error === 'string' ? body.error : body.error?.message
        throw new Error(err || `Gemini responded ${res.status}`)
      }
      const reader = res.body.getReader()
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
      if (full.trim()) return { content: full, model }
      throw new Error(`Gemini stream produced nothing from ${model}`)
    } catch (err) {
      lastError = err
      // try the next model in the list
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
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4000,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as GeminiSseChunk
      if (!res.ok) {
        const err = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(err || `Gemini responded ${res.status}`)
      }
      const choice = data.choices?.[0]?.message
      const content = choice?.content ?? choice?.reasoning
      if (content && content.trim()) return { content, model }
      throw new Error(`Empty response from ${model}`)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? new Error(`Gemini chat failed: ${lastError.message}`)
    : new Error('Gemini chat failed')
}
