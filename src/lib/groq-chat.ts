/**
 * GROQ chat engine — premium pool entry.
 *
 * WHY: GROQ_API_KEY ships with the deployment but was never wired into the
 * chat stack. Groq's LPU inference serves Llama-3.3-70B at 300+ tokens/sec —
 * the fastest first-token + streaming of ANY provider in the pool — which
 * directly fixes the "slow, glitchy streaming" complaint.
 *
 * Endpoint (OpenAI-compatible): POST https://api.groq.com/openai/v1/chat/completions
 */

export type GroqChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const GROQ_BASE = 'https://api.groq.com/openai/v1'

export function groqKey(): string {
  return (process.env.GROQ_API_KEY || '').trim()
}

export function groqChatConfigured(): boolean {
  return groqKey().length > 0
}

/** Task → ordered Groq models. All are OpenAI-compatible chat models on Groq. */
export function groqModelsForTask(task?: string): string[] {
  switch (task) {
    case 'code':
      return ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']
    case 'reasoning':
      return ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']
    case 'documents':
      return ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']
    case 'voice':
    case 'fast':
      return ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']
    default:
      return ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']
  }
}

interface GroqSseChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null }
    message?: { content?: string | null; reasoning?: string | null }
  }>
  error?: { message?: string } | string
}

/** STREAMING chat completion (SSE, token-by-token). */
export async function groqStreamChatCompletion(
  messages: GroqChatMessage[],
  onDelta: (delta: string) => void,
  opts: { task?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = groqKey()
  if (!key) throw new Error('GROQ_API_KEY is not configured')

  const models = groqModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 60_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
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
        const body = (await res.json().catch(() => ({}))) as GroqSseChunk
        const err = typeof body.error === 'string' ? body.error : body.error?.message
        throw new Error(err || `Groq responded ${res.status}`)
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
            const json = JSON.parse(payload) as GroqSseChunk
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
      throw new Error(`Groq stream produced nothing from ${model}`)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? new Error(`Groq stream failed: ${lastError.message}`)
    : new Error('Groq stream failed')
}

/** One-shot (non-streaming) chat completion. */
export async function groqChatCompletion(
  messages: GroqChatMessage[],
  opts: { task?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = groqKey()
  if (!key) throw new Error('GROQ_API_KEY is not configured')

  const models = groqModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 45_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
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
      const data = (await res.json().catch(() => ({}))) as GroqSseChunk
      if (!res.ok) {
        const err = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(err || `Groq responded ${res.status}`)
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
    ? new Error(`Groq chat failed: ${lastError.message}`)
    : new Error('Groq chat failed')
}
