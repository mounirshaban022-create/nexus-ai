/* ------------------------------------------------------------------ */
/* NEXUS PREMIUM AI POOL — round-robin load balancing + failover.      */
/*                                                                    */
/* WHY: the platform owns several PAID AI accounts (OpenRouter,        */
/* Hugging Face, xAI Grok, Vercel AI Gateway, Agnes). The old chain    */
/* always drained the FIRST configured provider until it hit its      */
/* quota, then fell to the next — so one account ran dry while the     */
/* others sat idle. This pool ROUND-ROBINS every request across all    */
/* healthy providers, so usage (and quota) spreads evenly. When a      */
/* provider fails (429/402/5xx/timeout) the request instantly          */
/* fails over to the next one in the rotation — the user never sees    */
/* the failure.                                                       */
/*                                                                    */
/* Guarantees:                                                        */
/*  - Word-by-word streaming on every provider (SSE with a shared      */
/*    directive-safe consumer; Grok reasoning stays invisible).        */
/*  - First-delta watchdog: a provider that doesn't start streaming    */
/*    within `firstDeltaMs` is skipped mid-flight and the next one     */
/*    takes over (no multi-second dead air on a hung provider).        */
/*  - Circuit breaker: 3 consecutive failures benches a provider for   */
/*    5 minutes so it stops burning latency.                          */
/*  - Partial-stream safety: once a provider has emitted visible text  */
/*    it is never retried (retrying would duplicate text on screen).   */
/*                                                                    */
/* Server-side only. Plain TS module — imported by API routes.        */
/* ------------------------------------------------------------------ */

import {
  openrouterConfigured,
  openrouterStreamChatCallback,
  openrouterChatCompletion,
  type OpenRouterMessage,
} from './openrouter'
import {
  hfConfigured,
  hfStreamChatCompletion,
  hfChatCompletion,
  xaiConfigured,
  xaiStreamChatCompletion,
  xaiChatCompletion,
  type HfChatMessage,
  type AiTaskKind,
} from './hf-ai'
import {
  geminiChatConfigured,
  geminiStreamChatCompletion,
  geminiChatCompletion,
} from './gemini-chat'
import {
  groqChatConfigured,
  groqStreamChatCompletion,
  groqChatCompletion,
} from './groq-chat'
import { consumeSSEWithPeek } from './llm-stream'

export type PremiumProviderId =
  | 'openrouter'
  | 'huggingface'
  | 'grok'
  | 'vercel-gateway'
  | 'agnes'
  | 'gemini'
  | 'groq'

export type PoolMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/* ------------------------------------------------------------------ */
/* Vercel AI Gateway — OpenAI-compatible unified gateway               */
/* ------------------------------------------------------------------ */

const VERCEL_GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1'

export function vercelGatewayKey(): string {
  return (
    process.env.VERCEL_AI_GATEWAY_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    ''
  ).trim()
}

export function vercelGatewayConfigured(): boolean {
  return vercelGatewayKey().length > 0
}

/** Task → ordered Vercel AI Gateway models (fast + cheap first). */
export function vercelGatewayModelsForTask(task?: AiTaskKind): string[] {
  switch (task) {
    case 'code':
      return ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini']
    case 'reasoning':
      return ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini']
    case 'documents':
      return ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku']
    case 'voice':
    case 'fast':
      return ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct']
    default:
      return ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'x-ai/grok-3-mini']
  }
}

/* ------------------------------------------------------------------ */
/* Agnes AI — chat (OpenAI-compatible, defensive)                      */
/* ------------------------------------------------------------------ */

export function agnesChatConfigured(): boolean {
  return Boolean(
    (process.env.AGNES_API_KEY || '').trim() &&
      (process.env.AGNES_BASE_URL || '').trim()
  )
}

function agnesBaseUrl(): string {
  return (process.env.AGNES_BASE_URL || '').trim().replace(/\/$/, '')
}

/* ------------------------------------------------------------------ */
/* Generic OpenAI-compatible SSE streaming client                      */
/* (used by Vercel Gateway + Agnes; Grok/HF/OpenRouter have their own) */
/* ------------------------------------------------------------------ */

interface CompatStreamOpts {
  baseUrl: string
  apiKey: string
  model: string
  messages: PoolMessage[]
  onDelta: (delta: string) => void
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
  label: string
}

async function openAiCompatStream(o: CompatStreamOpts): Promise<string> {
  const timeoutMs = o.timeoutMs ?? 60_000
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = o.signal
    ? AbortSignal.any([o.signal, timeoutSignal])
    : timeoutSignal

  const res = await fetch(`${o.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${o.apiKey}`,
    },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      stream: true,
      temperature: o.temperature ?? 0.7,
      max_tokens: o.maxTokens ?? 4000,
    }),
  })
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string } | string
    }
    const err =
      typeof body.error === 'string' ? body.error : body.error?.message
    throw new Error(err || `${o.label} responded ${res.status}`)
  }
  // Directive-safe token-by-token consumption (TOOL_CALL /
  // ARTIFACT_PATCH never become visible deltas).
  return consumeSSEWithPeek(res.body.getReader(), o.onDelta)
}

interface CompatCompleteOpts {
  baseUrl: string
  apiKey: string
  model: string
  messages: PoolMessage[]
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  label: string
}

async function openAiCompatComplete(o: CompatCompleteOpts): Promise<string> {
  const timeoutMs = o.timeoutMs ?? 60_000
  const res = await fetch(`${o.baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${o.apiKey}`,
    },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      temperature: o.temperature ?? 0.7,
      max_tokens: o.maxTokens ?? 4000,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>
    error?: { message?: string } | string
  }
  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : data.error?.message
    throw new Error(err || `${o.label} responded ${res.status}`)
  }
  const choice = data.choices?.[0]?.message
  const content = choice?.content ?? choice?.reasoning
  if (!content || !content.trim()) throw new Error(`Empty response from ${o.label}`)
  return content
}

/* ------------------------------------------------------------------ */
/* Task → model lists for the pool's OpenRouter entry                  */
/* ------------------------------------------------------------------ */

function openrouterPoolModels(task?: AiTaskKind): string[] {
  const fallback = process.env.OPENROUTER_DEFAULT_MODEL?.trim() || 'deepseek/deepseek-chat'
  switch (task) {
    case 'code':
      return [fallback, 'qwen/qwen-2.5-72b-instruct']
    case 'voice':
    case 'fast':
      return [fallback, 'liquid/lfm-2.5-2.6b:free']
    default:
      return [fallback, 'qwen/qwen-2.5-72b-instruct']
  }
}

/* ------------------------------------------------------------------ */
/* Quality-first task ordering                                         */
/*                                                                     */
/* The old blind round-robin sent chats to WHATEVER provider's turn it */
/* was — weak free-pool models answered real questions half the time   */
/* ("the AI is dumb and irrelevant"). Now each task maps to a priority */
/* list with the SMARTEST engines first; rotation only swaps the top-2 */
/* slots (quota spread among equals), everything else is strict order. */
/* ------------------------------------------------------------------ */

const TASK_PROVIDER_PRIORITY: Record<AiTaskKind, PremiumProviderId[]> = {
  chat: ['gemini', 'groq', 'grok', 'openrouter', 'huggingface', 'agnes', 'vercel-gateway'],
  reasoning: ['gemini', 'grok', 'openrouter', 'groq', 'huggingface', 'agnes', 'vercel-gateway'],
  documents: ['gemini', 'groq', 'openrouter', 'grok', 'huggingface', 'agnes', 'vercel-gateway'],
  code: ['grok', 'gemini', 'groq', 'openrouter', 'huggingface', 'agnes', 'vercel-gateway'],
  voice: ['groq', 'gemini', 'huggingface', 'grok', 'openrouter', 'agnes', 'vercel-gateway'],
  fast: ['groq', 'gemini', 'huggingface', 'grok', 'openrouter', 'agnes', 'vercel-gateway'],
}

/* ------------------------------------------------------------------ */
/* Pool registry                                                       */
/* ------------------------------------------------------------------ */

export interface PoolStreamResult {
  content: string
  model: string
  providerId: PremiumProviderId
}

interface PoolEntry {
  id: PremiumProviderId
  label: string
  configured: () => boolean
  stream: (
    messages: PoolMessage[],
    onDelta: (delta: string) => void,
    opts: {
      task?: AiTaskKind
      maxTokens?: number
      temperature?: number
      timeoutMs?: number
      signal?: AbortSignal
    }
  ) => Promise<{ content: string; model: string }>
  complete: (
    messages: PoolMessage[],
    opts: {
      task?: AiTaskKind
      maxTokens?: number
      temperature?: number
      timeoutMs?: number
    }
  ) => Promise<{ content: string; model: string }>
}

const POOL_ENTRIES: PoolEntry[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    configured: () => openrouterConfigured(),
    stream: async (messages, onDelta, opts) => {
      const models = openrouterPoolModels(opts.task)
      let lastErr: unknown = null
      for (const model of models) {
        try {
          const content = await openrouterStreamChatCallback(
            messages as OpenRouterMessage[],
            onDelta,
            { model, maxTokens: opts.maxTokens, temperature: opts.temperature, timeoutMs: opts.timeoutMs, signal: opts.signal }
          )
          if (content.trim()) return { content, model }
        } catch (err) {
          lastErr = err
          const msg = err instanceof Error ? err.message : ''
          if (/429|402|403|rate|budget|credit/i.test(msg)) continue // quota → next model
          throw err // anything else → let the pool fail over
        }
      }
      throw lastErr ?? new Error('OpenRouter produced no content')
    },
    complete: async (messages, opts) => {
      const models = openrouterPoolModels(opts.task)
      let lastErr: unknown = null
      for (const model of models) {
        try {
          const content = await openrouterChatCompletion(messages as OpenRouterMessage[], {
            model,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            timeoutMs: opts.timeoutMs,
          })
          return { content, model }
        } catch (err) {
          lastErr = err
          const msg = err instanceof Error ? err.message : ''
          if (/429|402|403|rate|budget|credit/i.test(msg)) continue
          throw err
        }
      }
      throw lastErr ?? new Error('OpenRouter produced no content')
    },
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    configured: () => hfConfigured(),
    stream: (messages, onDelta, opts) =>
      hfStreamChatCompletion(messages as HfChatMessage[], onDelta, opts),
    complete: (messages, opts) =>
      hfChatCompletion(messages as HfChatMessage[], opts),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    configured: () => geminiChatConfigured(),
    stream: (messages, onDelta, opts) =>
      geminiStreamChatCompletion(messages as HfChatMessage[], onDelta, opts),
    complete: (messages, opts) =>
      geminiChatCompletion(messages as HfChatMessage[], opts),
  },
  {
    id: 'groq',
    label: 'Groq (Llama 3.3 70B)',
    configured: () => groqChatConfigured(),
    stream: (messages, onDelta, opts) =>
      groqStreamChatCompletion(messages as HfChatMessage[], onDelta, opts),
    complete: (messages, opts) =>
      groqChatCompletion(messages as HfChatMessage[], opts),
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    configured: () => xaiConfigured(),
    stream: (messages, onDelta, opts) =>
      xaiStreamChatCompletion(messages as HfChatMessage[], onDelta, opts),
    complete: (messages, opts) =>
      xaiChatCompletion(messages as HfChatMessage[], opts),
  },
  {
    id: 'vercel-gateway',
    label: 'Vercel AI Gateway',
    configured: () => vercelGatewayConfigured(),
    stream: async (messages, onDelta, opts) => {
      const models = vercelGatewayModelsForTask(opts.task)
      let lastErr: unknown = null
      for (const model of models) {
        try {
          const content = await openAiCompatStream({
            baseUrl: VERCEL_GATEWAY_BASE,
            apiKey: vercelGatewayKey(),
            model,
            messages,
            onDelta,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            timeoutMs: opts.timeoutMs,
            signal: opts.signal,
            label: 'Vercel AI Gateway',
          })
          if (content.trim()) return { content, model }
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr ?? new Error('Vercel AI Gateway produced no content')
    },
    complete: async (messages, opts) => {
      const models = vercelGatewayModelsForTask(opts.task)
      let lastErr: unknown = null
      for (const model of models) {
        try {
          const content = await openAiCompatComplete({
            baseUrl: VERCEL_GATEWAY_BASE,
            apiKey: vercelGatewayKey(),
            model,
            messages,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            timeoutMs: opts.timeoutMs,
            label: 'Vercel AI Gateway',
          })
          return { content, model }
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr ?? new Error('Vercel AI Gateway produced no content')
    },
  },
  {
    id: 'agnes',
    label: 'Agnes AI',
    configured: () => agnesChatConfigured(),
    stream: async (messages, onDelta, opts) => {
      const model = process.env.AGNES_CHAT_MODEL?.trim() || 'default'
      const content = await openAiCompatStream({
        baseUrl: agnesBaseUrl(),
        apiKey: (process.env.AGNES_API_KEY || '').trim(),
        model,
        messages,
        onDelta,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
        label: 'Agnes AI',
      })
      if (!content.trim()) throw new Error('Empty response from Agnes AI')
      return { content, model }
    },
    complete: async (messages, opts) => {
      const model = process.env.AGNES_CHAT_MODEL?.trim() || 'default'
      const content = await openAiCompatComplete({
        baseUrl: agnesBaseUrl(),
        apiKey: (process.env.AGNES_API_KEY || '').trim(),
        model,
        messages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
        label: 'Agnes AI',
      })
      return { content, model }
    },
  },
]

/* ------------------------------------------------------------------ */
/* Round-robin rotation + circuit breaker (per server instance)        */
/* ------------------------------------------------------------------ */

interface PoolState {
  /** Monotonic counter — each request starts the rotation one slot further. */
  rr: number
  /** Consecutive failures per provider. */
  fails: Partial<Record<PremiumProviderId, number>>
  /** Timestamp (ms) until which a provider is benched. */
  benchedUntil: Partial<Record<PremiumProviderId, number>>
}

const globalForPool = globalThis as unknown as { __nexusPremiumPool?: PoolState }

function poolState(): PoolState {
  if (!globalForPool.__nexusPremiumPool) {
    globalForPool.__nexusPremiumPool = { rr: 0, fails: {}, benchedUntil: {} }
  }
  return globalForPool.__nexusPremiumPool
}

const BENCH_AFTER_FAILS = 3
const BENCH_MS = 5 * 60_000

function markPoolFailure(id: PremiumProviderId): void {
  const st = poolState()
  const fails = (st.fails[id] ?? 0) + 1
  st.fails[id] = fails
  if (fails >= BENCH_AFTER_FAILS) {
    st.benchedUntil[id] = Date.now() + BENCH_MS
    console.warn(
      `[premium-pool] ${id} benched for ${BENCH_MS / 1000}s after ${fails} consecutive failures`
    )
  }
}

function markPoolSuccess(id: PremiumProviderId): void {
  const st = poolState()
  st.fails[id] = 0
  st.benchedUntil[id] = 0
}

/**
 * Healthy, configured providers for this request — QUALITY-FIRST order.
 * Providers are sorted by the task's priority list (smartest engines
 * first); rotation swaps only the top-2 slots so quota spreads between
 * equals without ever leading with a weak model.
 */
export function premiumPoolOrder(task?: AiTaskKind): PoolEntry[] {
  const st = poolState()
  const up = POOL_ENTRIES.filter((p) => {
    if (!p.configured()) return false
    const until = st.benchedUntil[p.id] ?? 0
    if (Date.now() < until) return false
    return true
  })
  if (up.length === 0) return []

  const priority = TASK_PROVIDER_PRIORITY[task ?? 'chat']
  const rank = (id: PremiumProviderId): number => {
    const idx = priority.indexOf(id)
    return idx === -1 ? priority.length : idx
  }
  const ordered = [...up].sort((a, b) => rank(a.id) - rank(b.id))

  // Rotate only the top-2 (equals) — quota spread without quality loss.
  if (ordered.length >= 2 && st.rr % 2 === 1) {
    const tmp = ordered[0]
    ordered[0] = ordered[1]
    ordered[1] = tmp
  }
  st.rr += 1
  return ordered
}

/** Which engines are currently configured (for the health endpoint). */
export function premiumEngineStatus(): Record<string, boolean> {
  return {
    openrouter: openrouterConfigured(),
    huggingface: hfConfigured(),
    grok: xaiConfigured(),
    vercelGateway: vercelGatewayConfigured(),
    agnes: agnesChatConfigured(),
    gemini: geminiChatConfigured(),
    groq: groqChatConfigured(),
  }
}

/* ------------------------------------------------------------------ */
/* Public API — streaming + non-streaming, round-robin + failover      */
/* ------------------------------------------------------------------ */

export interface PremiumStreamOpts {
  task?: AiTaskKind
  maxTokens?: number
  temperature?: number
  /** Whole-call timeout per provider attempt. */
  timeoutMs?: number
  /** Max ms to wait for the FIRST visible delta before failing over. */
  firstDeltaMs?: number
}

/**
 * STREAMING completion across the premium pool. Providers are tried in
 * round-robin order; the first one to stream wins. A provider that
 * produces no first delta within `firstDeltaMs` (default 14s) is
 * aborted mid-flight and the next one takes over seamlessly.
 *
 * Throws when every provider failed. If a provider fails AFTER emitting
 * visible deltas, the error propagates immediately (the caller keeps
 * the partial text — retrying would duplicate it on screen).
 */
export async function premiumStreamChat(
  messages: PoolMessage[],
  onDelta: (delta: string) => void,
  opts: PremiumStreamOpts = {}
): Promise<PoolStreamResult> {
  const order = premiumPoolOrder(opts.task)
  if (order.length === 0) {
    throw new Error('premium pool empty — no providers configured')
  }
  const firstDeltaMs = opts.firstDeltaMs ?? 9_000
  let lastError: unknown = null

  for (const entry of order) {
    /** Gate: closed the moment we give up on this provider. */
    let active = true
    let firstDelta = false
    const ctrl = new AbortController()
    const watchdog = setTimeout(() => {
      if (!firstDelta) {
        active = false
        ctrl.abort()
      }
    }, firstDeltaMs)

    const wrappedDelta = (d: string) => {
      if (!active || !d) return
      if (!firstDelta) {
        firstDelta = true
        clearTimeout(watchdog)
      }
      onDelta(d)
    }

    try {
      const r = await entry.stream(messages, wrappedDelta, {
        task: opts.task,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
        signal: ctrl.signal,
      })
      clearTimeout(watchdog)
      if (!active) {
        // We already failed over — this zombie result is discarded.
        throw new Error(`${entry.id} resolved after watchdog failover`)
      }
      if (r.content.trim()) {
        markPoolSuccess(entry.id)
        return { content: r.content, model: r.model, providerId: entry.id }
      }
      markPoolFailure(entry.id)
      lastError = new Error(`Empty response from ${entry.id}`)
    } catch (err) {
      clearTimeout(watchdog)
      if (!active) {
        // Watchdog fired — silent failover to the next provider.
        lastError = new Error(`${entry.id} produced no first delta in ${firstDeltaMs}ms`)
        markPoolFailure(entry.id)
        continue
      }
      if (firstDelta) {
        // Visible text was already emitted → NEVER retry (would
        // duplicate on screen). Propagate so the caller keeps partial.
        markPoolFailure(entry.id)
        throw err
      }
      markPoolFailure(entry.id)
      lastError = err
      // Hard provider errors (bad key, quota, 5xx) → next provider.
      continue
    }
  }
  throw lastError instanceof Error
    ? new Error(`premium pool exhausted: ${lastError.message}`)
    : new Error('premium pool exhausted')
}

/**
 * NON-STREAMING completion across the premium pool (round-robin +
 * failover). Used by voice turns, tool/skill execution and routing —
 * anywhere the caller needs the full text.
 */
export async function premiumChatCompletion(
  messages: PoolMessage[],
  opts: {
    task?: AiTaskKind
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
  } = {}
): Promise<PoolStreamResult> {
  const order = premiumPoolOrder(opts.task)
  if (order.length === 0) {
    throw new Error('premium pool empty — no providers configured')
  }
  let lastError: unknown = null
  for (const entry of order) {
    try {
      const r = await entry.complete(messages, {
        task: opts.task,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
      })
      if (r.content.trim()) {
        markPoolSuccess(entry.id)
        return { content: r.content, model: r.model, providerId: entry.id }
      }
      markPoolFailure(entry.id)
      lastError = new Error(`Empty response from ${entry.id}`)
    } catch (err) {
      markPoolFailure(entry.id)
      lastError = err
      continue
    }
  }
  throw lastError instanceof Error
    ? new Error(`premium pool exhausted: ${lastError.message}`)
    : new Error('premium pool exhausted')
}
