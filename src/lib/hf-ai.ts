/**
 * Hugging Face + xAI (Grok) premium AI pool.
 *
 * WHY: the app previously depended on the Z.ai SDK (unreachable on Vercel)
 * and anonymous free gateways (rate-limited per IP). These token-backed
 * providers give NEXUS a dedicated, high-quality quota that works in EVERY
 * deployment environment:
 *
 *   - Hugging Face Inference router (HF_TOKEN):
 *       • chat    — Llama-3.3-70B, Qwen2.5-72B, DeepSeek-V3, gpt-oss-120b
 *       • code    — Qwen2.5-Coder-32B (dedicated coding specialist)
 *       • ASR     — Whisper-large-v3-turbo (the voice "hears you" fix:
 *                   server-side, works in every browser, no downloads)
 *   - xAI Grok (XAI_API_KEY / GROK_API_KEY) — grok-4-fast / grok-3-mini,
 *       strong at coding + reasoning, OpenAI-compatible API.
 *
 * All endpoints verified live with a real token (2026-08):
 *   POST https://router.huggingface.co/v1/chat/completions  (OpenAI-compatible)
 *   POST https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo
 *   POST https://api.x.ai/v1/chat/completions               (OpenAI-compatible)
 */

export type HfChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type AiTaskKind = 'chat' | 'voice' | 'code' | 'reasoning' | 'documents' | 'fast'

/* ------------------------------------------------------------------ */
/* Hugging Face — configuration                                        */
/* ------------------------------------------------------------------ */

const HF_ROUTER = 'https://router.huggingface.co'
const HF_ASR_MODEL = 'openai/whisper-large-v3-turbo'

export function hfToken(): string {
  return (
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HUGGING_FACE_TOKEN ||
    ''
  ).trim()
}

export function hfConfigured(): boolean {
  return hfToken().length > 0
}

/** Task → ordered HF chat models (best first). */
export function hfModelsForTask(task?: AiTaskKind): string[] {
  switch (task) {
    case 'code':
      // Dedicated coding specialist first, then strong general coders.
      return [
        'Qwen/Qwen2.5-Coder-32B-Instruct',
        'deepseek-ai/DeepSeek-V3',
        'meta-llama/Llama-3.3-70B-Instruct',
      ]
    case 'reasoning':
      return [
        'meta-llama/Llama-3.3-70B-Instruct',
        'deepseek-ai/DeepSeek-V3',
        'Qwen/Qwen2.5-72B-Instruct',
      ]
    case 'documents':
      // DeepSeek writes the best long-form prose of the pool.
      return [
        'deepseek-ai/DeepSeek-V3',
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
      ]
    case 'voice':
      // Small + instant — voice needs low latency above all.
      return ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct']
    case 'fast':
      return ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct']
    default:
      return [
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
        'deepseek-ai/DeepSeek-V3',
      ]
  }
}

/* ------------------------------------------------------------------ */
/* Hugging Face — chat completions (OpenAI-compatible)                 */
/* ------------------------------------------------------------------ */

interface RouterChatResponse {
  choices?: Array<{
    message?: { content?: string | null; reasoning?: string | null }
    delta?: { content?: string | null; reasoning?: string | null }
  }>
  error?: { message?: string } | string
}

/**
 * One-shot chat completion via the HF router. Tries the task's model list
 * in order until one answers. Throws when all fail.
 */
export async function hfChatCompletion(
  messages: HfChatMessage[],
  opts: { task?: AiTaskKind; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const token = hfToken()
  if (!token) throw new Error('HF_TOKEN is not configured')

  const models = hfModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 45_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${HF_ROUTER}/v1/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4000,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as RouterChatResponse
      if (!res.ok) {
        const err =
          typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(err || `HF router responded ${res.status}`)
      }
      // Reasoning models (gpt-oss) can put the answer in `reasoning`.
      const choice = data.choices?.[0]?.message
      const content = choice?.content ?? choice?.reasoning
      if (content && content.trim()) {
        return { content, model }
      }
      throw new Error(`Empty response from ${model}`)
    } catch (err) {
      lastError = err
      // try the next model in the list
    }
  }
  throw lastError instanceof Error
    ? new Error(`HF chat failed: ${lastError.message}`)
    : new Error('HF chat failed')
}

/**
 * STREAMING chat completion via the HF router (SSE, token-by-token).
 * Falls back to the non-streaming call when the router rejects stream:true.
 */
export async function hfStreamChatCompletion(
  messages: HfChatMessage[],
  onDelta: (delta: string) => void,
  opts: { task?: AiTaskKind; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const token = hfToken()
  if (!token) throw new Error('HF_TOKEN is not configured')

  const models = hfModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 60_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${HF_ROUTER}/v1/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
        const body = (await res.json().catch(() => ({}))) as RouterChatResponse
        const err = typeof body.error === 'string' ? body.error : body.error?.message
        throw new Error(err || `HF router responded ${res.status}`)
      }
      // Minimal SSE parse — data: {json} lines, [DONE] terminator.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      let sawAny = false
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
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload) as RouterChatResponse
            const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.delta?.reasoning
            if (delta) {
              sawAny = true
              full += delta
              onDelta(delta)
            }
          } catch {
            /* keep-alive / partial line — ignore */
          }
        }
      }
      if (full.trim()) return { content: full, model }
      if (sawAny) throw new Error(`Empty stream from ${model}`)
      throw new Error(`Stream produced nothing from ${model}`)
    } catch (err) {
      lastError = err
      // try the next model
    }
  }
  // Last resort: non-streaming (some router endpoints dislike SSE).
  try {
    return await hfChatCompletion(messages, opts)
  } catch {
    throw lastError instanceof Error
      ? new Error(`HF stream failed: ${lastError.message}`)
      : new Error('HF stream failed')
  }
}

/* ------------------------------------------------------------------ */
/* Hugging Face — server-side Whisper ASR (the "voice hears you" fix)  */
/* ------------------------------------------------------------------ */

/**
 * Transcribes a base64 audio clip with Whisper-large-v3-turbo on the HF
 * inference router. Server-side → works in EVERY browser (no Web Speech,
 * no downloads, no iframes limitations) and on every deployment target
 * (unlike the Z.ai SDK). Returns '' when nothing intelligible was said.
 */
export async function hfAsr(
  base64Audio: string,
  opts: { language?: string; timeoutMs?: number } = {}
): Promise<string> {
  const token = hfToken()
  if (!token) throw new Error('HF_TOKEN is not configured')

  let mime = 'audio/webm'
  if (base64Audio.startsWith('data:')) {
    const header = base64Audio.slice(0, 64)
    const m = header.match(/^data:([^;,]+)[;,]/)
    if (m) mime = m[1]
    base64Audio = base64Audio.slice(base64Audio.indexOf(',') + 1)
  } else if (base64Audio.length > 200) {
    // Sniff common containers from the magic bytes.
    const head = Buffer.from(base64Audio.slice(0, 24), 'base64').toString('hex')
    if (head.startsWith('52494646')) mime = 'audio/wav' // RIFF
    else if (head.startsWith('fff3') || head.startsWith('fffb') || head.startsWith('fff2')) mime = 'audio/mpeg'
    else if (head.startsWith('494433')) mime = 'audio/mpeg' // ID3
    else if (head.startsWith('4f676753')) mime = 'audio/ogg'
  }

  const bytes = Buffer.from(base64Audio, 'base64')
  if (bytes.length < 512) return ''

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)
  try {
    const res = await fetch(`${HF_ROUTER}/hf-inference/models/${HF_ASR_MODEL}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mime,
      },
      body: bytes,
    })
    const text = (await res.text())
    if (!res.ok) {
      throw new Error(`HF ASR responded ${res.status}: ${text.slice(0, 200)}`)
    }
    try {
      const json = JSON.parse(text) as { text?: string; error?: string }
      if (json.error) throw new Error(String(json.error).slice(0, 200))
      return (json.text ?? '').trim()
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error(`HF ASR returned non-JSON: ${text.slice(0, 120)}`)
      }
      throw parseErr
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/* xAI Grok                                                            */
/* ------------------------------------------------------------------ */

const XAI_BASE = 'https://api.x.ai/v1'

export function xaiKey(): string {
  return (process.env.XAI_API_KEY || process.env.GROK_API_KEY || '').trim()
}

export function xaiConfigured(): boolean {
  return xaiKey().length > 0
}

/** Task → ordered Grok models. grok-4-fast leads (fast + very strong). */
export function xaiModelsForTask(task?: AiTaskKind): string[] {
  switch (task) {
    case 'code':
      return ['grok-4-fast', 'grok-3-mini']
    case 'reasoning':
      return ['grok-4-fast', 'grok-3-mini']
    case 'voice':
      return ['grok-3-mini'] // lowest latency
    default:
      return ['grok-4-fast', 'grok-3-mini']
  }
}

export async function xaiChatCompletion(
  messages: HfChatMessage[],
  opts: { task?: AiTaskKind; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = xaiKey()
  if (!key) throw new Error('XAI_API_KEY is not configured')

  const models = xaiModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 45_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${XAI_BASE}/chat/completions`, {
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
      const data = (await res.json().catch(() => ({}))) as RouterChatResponse & { code?: string; error?: { message?: string } | string }
      if (!res.ok) {
        const err = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(err || `xAI responded ${res.status}`)
      }
      const choice = data.choices?.[0]?.message
      const content = choice?.content ?? choice?.reasoning
      if (content && content.trim()) return { content, model }
      throw new Error(`Empty response from ${model}`)
    } catch (err) {
      lastError = err
      // try the next model
    }
  }
  throw lastError instanceof Error
    ? new Error(`Grok failed: ${lastError.message}`)
    : new Error('Grok failed')
}

/**
 * STREAMING chat completion via xAI (SSE, token-by-token, word-by-word).
 * Mirrors hfStreamChatCompletion's contract: emits deltas through onDelta
 * as they arrive, returns the full text. Grok reasoning models emit
 * `delta.reasoning` separately from `delta.content` — reasoning is
 * collected silently and used only as a fallback when no content
 * was produced (the user never sees raw reasoning).
 */
export async function xaiStreamChatCompletion(
  messages: HfChatMessage[],
  onDelta: (delta: string) => void,
  opts: { task?: AiTaskKind; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string }> {
  const key = xaiKey()
  if (!key) throw new Error('XAI_API_KEY is not configured')

  const models = xaiModelsForTask(opts.task)
  const timeoutMs = opts.timeoutMs ?? 60_000
  let lastError: unknown = null

  for (const model of models) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
    try {
      const res = await fetch(`${XAI_BASE}/chat/completions`, {
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
        const body = (await res.json().catch(() => ({}))) as RouterChatResponse
        const err = typeof body.error === 'string' ? body.error : body.error?.message
        throw new Error(err || `xAI responded ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      let reasoningBuf = ''
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
            const json = JSON.parse(payload) as RouterChatResponse
            const delta = json.choices?.[0]?.delta
            const text = delta?.content
            if (text) {
              full += text
              onDelta(text)
            }
            if (delta?.reasoning) reasoningBuf += delta.reasoning
          } catch {
            /* keep-alive / partial line — ignore */
          }
        }
      }
      if (full.trim()) return { content: full, model }
      if (reasoningBuf.trim()) return { content: reasoningBuf, model }
      throw new Error(`Stream produced nothing from ${model}`)
    } catch (err) {
      lastError = err
      // try the next model
    }
  }
  // Last resort: non-streaming completion (some proxies dislike SSE).
  try {
    return await xaiChatCompletion(messages, opts)
  } catch {
    throw lastError instanceof Error
      ? new Error(`Grok stream failed: ${lastError.message}`)
      : new Error('Grok stream failed')
  }
}
