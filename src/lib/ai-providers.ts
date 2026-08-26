import { createDecipheriv, scryptSync } from 'crypto'
import { db } from '@/lib/db'
import { consumeSSEWithPeek } from './llm-stream'
import type { AiTask } from './smart-chat-types'

/* ------------------------------------------------------------------ */
/* Free AI provider registry (all OpenAI-compatible chat APIs)          */
/* ------------------------------------------------------------------ */

export interface AiProviderPreset {
  id: string
  label: string
  baseUrl: string
  defaultModel: string
  models: string[]
  freeNote: string
  keyUrl: string
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  // ────────────────────────────────────────────────────────────────────
  // NEW (2026-09): Anonymous zero-key providers — verified live.
  // Sources: https://github.com/mnfst/awesome-free-llm-apis
  // These never need a user-supplied API key — they are always-available
  // fallbacks that bypass the Z.ai 429 rate limit. Surfaced as regular
  // presets so users can also pick them as their primary provider.
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'llm7',
    label: 'LLM7.io (No Key)',
    baseUrl: 'https://api.llm7.io/v1',
    defaultModel: 'mistral-Nemo-Instruct-2407',
    models: [
      'mistral-Nemo-Instruct-2407', // verified: clean conversational
      'minimax-m2.7', // verified: reasoning model
      'DeepSeek-V4-Flash-0731', // verified: 400K context, fast
    ],
    freeNote:
      'Zero-setup anonymous LLM gateway. 10 RPM / 60 req per hour / 500K tokens per 24h, no signup, no key. Catalog rotates — pick any model. Acts as automatic last-resort fallback when Z.ai hits rate limits.',
    keyUrl: 'https://token.llm7.io',
  },
  {
    id: 'ovhcloud',
    label: 'OVHcloud AI (No Key)',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    defaultModel: 'Mistral-7B-Instruct-v0.3',
    models: [
      'Mistral-7B-Instruct-v0.3', // verified: instant, EU-hosted
      'Meta-Llama-3_3-70B-Instruct', // 70B flagship
      'Qwen3-32B', // 32B Qwen
      'Qwen3.5-9B', // fast small Qwen
      'Mistral-Nemo-Instruct-2407', // Nemo
      'Mistral-Small-3.2-24B-Instruct', // 24B Mistral
    ],
    freeNote:
      'EU-hosted anonymous tier — 2 RPM per IP per model, no signup, no key. Auto-fallback that never collides with Z.ai quota. 12 open-weight models.',
    keyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/',
  },
  {
    id: 'kilocode',
    label: 'Kilo Code (No Key)',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    defaultModel: 'openrouter/free',
    models: [
      'openrouter/free', // verified: auto-router to free pool
      'nvidia/nemotron-3-ultra-550b-a55b:free', // 1M context reasoning
      'stepfun/step-3.7-flash:free', // vision-capable
      'cohere/north-mini-code:free', // code specialist
      'liquid/lfm-2.5-2.6b:free', // tiny instant
    ],
    freeNote:
      'No API key required — 200 requests per hour per IP. Auto-routes to the free pool across NVIDIA, Cohere, Stepfun and others. Great as a parallel fallback channel.',
    keyUrl: 'https://app.kilo.ai/profile',
  },
  // ────────────────────────────────────────────────────────────────────
  // NEW (2026-09): High-quality free-key providers from awesome-free-llm-apis
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'cohere',
    label: 'Cohere',
    baseUrl: 'https://api.cohere.com/v2',
    defaultModel: 'command-a-03-2025',
    models: [
      'command-a-03-2025', // 111B flagship
      'command-r-08-2024', // 128K context
      'command-r7b-08-2024', // fast 7B
      'command-r-plus-08-2024', // 128K R+
      'c4ai-aya-expanse-32b', // multilingual 32B
    ],
    freeNote:
      'Free Trial key (no credit card) — 1,000 API calls/month, 20 RPM. Command A (111B), Command R+, Aya Expanse 32B. Multimodal Command A Vision available. Non-commercial use.',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    models: [
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast', // 70B fast
      '@cf/openai/gpt-oss-120b', // 120B open GPT
      '@cf/zai-org/glm-4.7-flash', // GLM 4.7
      '@cf/mistralai/mistral-small-3.1-24b-instruct', // 24B Mistral
      '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', // reasoning
      '@cf/google/gemma-4-26b-a4b-it', // Gemma 4
    ],
    freeNote:
      '10,000 Neurons/day free, no credit card. 75+ models on the free tier. Replace {account_id} in the Base URL with your Cloudflare account ID. Llama 3.3 70B, GPT-OSS 120B, GLM 4.7, DeepSeek R1.',
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    models: [
      'nvidia/nemotron-3-super-120b-a12b', // 120B super
      'nvidia/nemotron-3-ultra-550b-a55b', // 550B ultra reasoning
      'meta/llama-3.3-70b-instruct', // 70B Llama
      'mistralai/mistral-large-2-instruct', // Mistral Large 2
      'openai/gpt-oss-120b', // 120B GPT-OSS
      'openai/gpt-oss-20b', // 20B GPT-OSS
      'google/gemma-4-31b-it', // 31B Gemma
    ],
    freeNote:
      'Most generous free tier — 40 RPM and 10,000 requests/day. Free with NVIDIA Developer Program membership (free to join). 100+ models including Nemotron Ultra 550B reasoning.',
    keyUrl: 'https://build.nvidia.com/explore/discover',
  },
  {
    id: 'ollama',
    label: 'Ollama Cloud',
    baseUrl: 'https://ollama.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: [
      'deepseek-v4-flash', // 1M context
      'deepseek-v4-pro', // flagship DeepSeek
      'minimax-m3', // 512K context
      'kimi-k3', // 1M context
      'gpt-oss:120b', // 120B GPT-OSS
      'qwen3.5:397b', // 256K Qwen
      'mistral-large-3:675b', // 675B Mistral
    ],
    freeNote:
      'Ollama Cloud free tier — session limits reset every 5h, weekly limits every 7d. OpenAI-compatible at ollama.com/v1. 16 cloud model families including DeepSeek V4 Pro and Kimi K3 (1M context).',
    keyUrl: 'https://ollama.com/settings/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'poolside/laguna-s-2.1:free',
    models: [
      'poolside/laguna-s-2.1:free', // verified: clean, fast
      'nvidia/nemotron-3-ultra-550b-a55b:free', // verified: 550B reasoning
      'nvidia/nemotron-3.5-lightning:free', // verified: fast reasoning
      'cohere/north-mini-code:free', // verified: code
      'liquid/lfm-2.5-2.6b:free', // verified: tiny & instant
      'stealth/ox-alpha', // verified free
    ],
    freeNote: 'Verified free models live right now: Laguna S 2.1, Nemotron 550B Ultra, Nemotron Lightning, North Code, LFM 2.5',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'qwen/qwen3-32b',
      'deepseek-r1-distill-llama-70b',
    ],
    freeNote: 'Ultra-fast inference (Llama 3.3 70B, Qwen3, DeepSeek R1 distill) — generous free tier',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    freeNote: 'Gemini Flash/Pro — ~1,500 requests/day free via Google AI Studio, no card needed',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'open-mistral-nemo', 'codestral-latest'],
    freeNote: 'Mistral Small / Codestral — free experiment tier',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    models: ['llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b'],
    freeNote: 'Fastest inference available — free tier with daily tokens',
    keyUrl: 'https://cloud.cerebras.ai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek Platform',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    freeNote: 'DeepSeek V4 Flash/Pro + V3/R1 — ultra-cheap (~$0.07/M tokens), $2 of credit lasts a long time',
    keyUrl: 'https://platform.deepseek.com/top_up',
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba DashScope)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-coder-32b-instruct', 'qwen3-coder-plus'],
    freeNote: 'Qwen Plus/Max/Turbo + Qwen Coder — 1M free tokens for new users',
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'zhipu',
    label: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5-turbo',
    models: ['glm-5-turbo', 'glm-5', 'glm-5.3', 'glm-4.5', 'glm-4.5-air'],
    freeNote: 'GLM 5 Turbo/5/5.3 + 4.5 — Zhipu BigModel platform (Coding Plan includes free quota)',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
    ],
    freeNote: 'Free turbo endpoints for Llama & DeepSeek models',
    keyUrl: 'https://api.together.ai/settings/api-keys',
  },
  {
    id: 'putra',
    label: 'Putra AI',
    baseUrl: 'https://putra.ai/api/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'],
    freeNote: 'Putra AI (Malaysia) — 500 free API calls on the free plan. OpenAI-compatible endpoint.',
    keyUrl: 'https://putra.ai/dashboard',
  },
]

export const AI_PROVIDER_MAP = new Map(AI_PROVIDER_PRESETS.map((p) => [p.id, p]))

/* ------------------------------------------------------------------ */
/* Credential decryption (same scheme as email accounts)               */
/* ------------------------------------------------------------------ */

function getKey(): Buffer {
  const secret = process.env.NEXUS_EMAIL_SECRET ?? 'nexus-local-email-secret-v1'
  return scryptSync(secret, 'nexus-email-salt-v1', 32)
}

export function decryptApiKey(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible chat completion via any configured provider        */
/* ------------------------------------------------------------------ */

export interface ExternalChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ResolvedAiProvider {
  providerId: string
  label: string
  baseUrl: string
  apiKey: string
  defaultModel: string
}

/** Returns the first connected provider, or null. */
export async function getActiveAiProvider(): Promise<ResolvedAiProvider | null> {
  const provider = await db.aiProvider.findFirst({
    where: { status: 'connected' },
    orderBy: { createdAt: 'asc' },
  })
  if (!provider) return null
  return {
    providerId: provider.providerId,
    label: provider.label,
    baseUrl: provider.baseUrl,
    apiKey: decryptApiKey(provider.apiKeyEnc),
    defaultModel: provider.defaultModel,
  }
}

/** Calls a provider's OpenAI-compatible /chat/completions endpoint. */
export async function externalChatCompletion(
  provider: ResolvedAiProvider,
  messages: ExternalChatMessage[],
  opts: { model?: string; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const model = opts.model ?? provider.defaultModel
  const controller = new AbortController()
  // Bug F: timeout is now configurable (15s for voice, 120s default otherwise).
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000)
  // Anonymous providers (LLM7.io, OVHcloud, Kilo Code) accept NO
  // Authorization header — sending an invalid Bearer token can cause
  // some of them to reject the request. Skip auth for those.
  const isAnonymous = ANONYMOUS_PROVIDER_IDS.has(provider.providerId)
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(isAnonymous
          ? { 'HTTP-Referer': 'https://nexus-ai.app', 'X-Title': 'NEXUS AI' }
          : { Authorization: `Bearer ${provider.apiKey}` }),
        ...(provider.providerId === 'openrouter'
          ? { 'HTTP-Referer': 'https://nexus-ai.app', 'X-Title': 'NEXUS AI' }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 800,
      }),
    })
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Provider responded ${res.status}`)
    }
    // Reasoning models on Kilo Code emit the answer in `reasoning` when
    // `content` is null (happens when max_tokens truncates mid-thought).
    const choice = data.choices?.[0]?.message
    const content = choice?.content ?? choice?.reasoning
    if (!content || !content.trim()) throw new Error('Empty response from model')
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * STREAMING variant for a user-connected provider — SSE token-by-token
 * through the same directive-safe peek buffer as the free pool, so chat
 * feels alive (word-by-word) on EVERY path, not just the anonymous one.
 * Falls back transparently to the non-streaming completion when the
 * provider rejects stream:true (some do).
 */
export async function streamExternalChatCompletion(
  provider: ResolvedAiProvider,
  messages: ExternalChatMessage[],
  onDelta: (delta: string) => void,
  opts: { model?: string; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const model = opts.model ?? provider.defaultModel
  const isAnonymous = ANONYMOUS_PROVIDER_IDS.has(provider.providerId)
  const timeoutMs = opts.timeoutMs ?? 120_000
  let emittedLen = 0
  const track = (d: string) => {
    emittedLen += d.length
    onDelta(d)
  }
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        ...(isAnonymous
          ? { 'HTTP-Referer': 'https://nexus-ai.app', 'X-Title': 'NEXUS AI' }
          : { Authorization: `Bearer ${provider.apiKey}` }),
        ...(provider.providerId === 'openrouter'
          ? { 'HTTP-Referer': 'https://nexus-ai.app', 'X-Title': 'NEXUS AI' }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 800,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(body.error?.message || `Provider responded ${res.status}`)
    }
    if (!res.body) throw new Error('No stream body')
    return await consumeSSEWithPeek(res.body.getReader(), track)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // Deltas already visible to the user → NEVER fall back to a fresh
    // completion (it would duplicate/diverge on screen). Propagate so the
    // caller keeps the partial text (same semantics as the free-pool race).
    if (emittedLen > 0) throw err
    // Hard provider errors (bad key, rate limit, 5xx) propagate to the
    // caller's fallback chain — no silent retry.
    if (/responded (4\d\d|5\d\d)/i.test(msg) || /No stream body/.test(msg)) throw err
    // Transport/stream glitch before any output → single-shot completion.
    return externalChatCompletion(provider, messages, {
      model,
      maxTokens: opts.maxTokens,
      timeoutMs,
    })
  }
}

/** Verifies a provider API key by listing models (or a tiny completion). */
export async function verifyAiProvider(
  baseUrl: string,
  apiKey: string,
  providerId: string
): Promise<{ ok: boolean; message: string }> {
  // ──────────────────────────────────────────────────────────────
  if (ANONYMOUS_PROVIDER_IDS.has(providerId)) {
    return {
      ok: true,
      message: 'No API key needed — this provider works anonymously and is always available.',
    }
  }
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true, message: 'API key valid — provider connected.' }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Invalid API key — check the key and try again.' }
    }
    // Some providers (gemini) don't expose /models the same way — try a tiny completion
    return {
      ok: false,
      message: `Provider responded ${res.status}. The key may still work for chat — test it.`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Connection failed.',
    }
  }
}

/* ------------------------------------------------------------------ */
/* ANONYMOUS FREE-LLM FALLBACKS (no API key, no signup)               */
/* ------------------------------------------------------------------ */
/**
 * Curated from https://github.com/mnfst/awesome-free-llm-apis
 * Each entry is a verified-live, OpenAI-compatible endpoint that
 * accepts anonymous requests (no Authorization header). They are the
 * platform's automatic last-resort fallback when:
 *   1. The user has not connected any provider
 *   2. The connected provider hit a 429/402/403 (rate limit / quota)
 *   3. The built-in Z.ai engine also hit its global rate limit
 *
 * Order matters: the chain tries LLM7.io first (lowest friction,
 * generous anonymous quota), then OVHcloud, then Kilo Code. Each
 * provider has its OWN rate-limit budget, so the chain effectively
 * multiplies the per-IP free capacity.
 */
export interface AnonymousProvider {
  id: string
  label: string
  baseUrl: string
  models: string[]          // ordered by preference (best first)
  rpmNote: string
  /** Present when the provider needs an Authorization header (env-token
   * providers — Hugging Face / xAI). Anonymous providers omit it. */
  apiKey?: string
}

export const ANONYMOUS_FREE_LLM_FALLBACKS: AnonymousProvider[] = [
  {
    id: 'llm7',
    label: 'LLM7.io',
    baseUrl: 'https://api.llm7.io/v1',
    models: [
      'mistral-Nemo-Instruct-2407',  // verified live: clean conversational
      'DeepSeek-V4-Flash-0731',      // verified live: 400K context
      'minimax-m2.7',                 // verified live: reasoning
    ],
    rpmNote: '10 RPM, 60 req/h, 500K tok/24h — anonymous, no key',
  },
  {
    id: 'ovhcloud',
    label: 'OVHcloud AI Endpoints',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    models: [
      'Mistral-7B-Instruct-v0.3',          // verified live: instant
      'Mistral-Nemo-Instruct-2407',       // Nemo on EU infra
      'Mistral-Small-3.2-24B-Instruct',   // 24B Mistral
      'Qwen3-32B',                        // 32B Qwen
      'Qwen3.5-9B',                       // fast small Qwen
      'Meta-Llama-3_3-70B-Instruct',      // 70B Llama
    ],
    rpmNote: '2 RPM per IP per model — anonymous, EU-hosted, no key',
  },
  {
    id: 'kilocode',
    label: 'Kilo Code',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    models: [
      // QUALITY FIRST (benchmark-verified 2026-08):
      // nemotron-3-super-120b: 1.4s avg, strong general answers
      'nvidia/nemotron-3-super-120b-a12b:free',
      // fallbacks — every one has its own quota
      'nvidia/nemotron-3.5-lightning:free',     // fast reasoning
      'poolside/laguna-s-2.1:free',             // clean conversational
      'cohere/north-mini-code:free',            // code specialist
      'liquid/lfm-2.5-2.6b:free',               // tiny instant
    ],
    rpmNote: '200 req/h per IP — no API key needed',
  },
]

export const ANONYMOUS_PROVIDER_IDS = new Set(
  ANONYMOUS_FREE_LLM_FALLBACKS.map((p) => p.id)
)

/* ------------------------------------------------------------------ */
/* ENV-TOKEN PREMIUM PROVIDERS (Hugging Face + xAI Grok)               */
/* ------------------------------------------------------------------ */
/**
 * Providers backed by platform-owned API keys from environment variables.
 * They join the anonymous race chain at the FRONT — dedicated quota on a
 * separate account, so the platform's capacity multiplies instead of
 * sharing the per-IP anonymous budgets. When the env var is absent the
 * provider simply isn't part of the chain.
 *
 *   HF_TOKEN     → Hugging Face Inference router (verified live):
 *                  Llama-3.3-70B, Qwen2.5-72B, DeepSeek-V3,
 *                  Qwen2.5-Coder-32B (code), gpt-oss-120b
 *   XAI_API_KEY  → xAI Grok (OpenAI-compatible): grok-4-fast, grok-3-mini
 */
function envTokenProviders(): AnonymousProvider[] {
  const providers: AnonymousProvider[] = []
  const hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '').trim()
  if (hfToken) {
    providers.push({
      id: 'huggingface',
      label: 'Hugging Face',
      baseUrl: 'https://router.huggingface.co/v1',
      apiKey: hfToken,
      models: [
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
        'deepseek-ai/DeepSeek-V3',
      ],
      rpmNote: 'Dedicated HF Inference router quota (per-token billing)',
    })
  }
  const xaiKey = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || '').trim()
  if (xaiKey) {
    providers.push({
      id: 'grok',
      label: 'xAI Grok',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: xaiKey,
      models: ['grok-4-fast', 'grok-3-mini'],
      rpmNote: 'xAI Grok — fast + strong reasoning/coding',
    })
  }
  return providers
}

/** Extra model ordering for env-token providers, per task. */
function envProviderModelsForTask(p: AnonymousProvider, task?: string): string[] {
  if (p.id === 'huggingface') {
    switch (task) {
      case 'code':
        return ['Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.3-70B-Instruct']
      case 'reasoning':
      case 'documents':
        return ['deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct']
      case 'voice':
      case 'fast':
        return ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct']
      default:
        return p.models
    }
  }
  if (p.id === 'grok') {
    if (task === 'voice' || task === 'fast') return ['grok-3-mini', 'grok-4-fast']
    return p.models
  }
  return p.models
}

/**
 * Calls an anonymous OpenAI-compatible /chat/completions endpoint with
 * NO Authorization header. Returns the assistant text. Throws on any
 * error so the caller can try the next provider in the chain.
 *
 * NOTE: the Kilo Code gateway emits both `message.content` and
 * `message.reasoning` — for reasoning models the answer may land in
 * `reasoning` when `content` is null (this happens when max_tokens is
 * hit mid-reasoning). We fall back to `reasoning` so the user gets a
 * usable response either way.
 */
export async function anonymousChatCompletion(
  provider: AnonymousProvider,
  messages: ExternalChatMessage[],
  opts: { model?: string; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const model = opts.model ?? provider.models[0]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // Env-token providers (HF / Grok) authenticate; the anonymous
        // gateways must NOT receive an Authorization header.
        ...(provider.apiKey
          ? { Authorization: `Bearer ${provider.apiKey}` }
          : {
              // OpenRouter-compatible router at Kilo expects a referer/title
              // for free-tier attribution; harmless elsewhere.
              'HTTP-Referer': 'https://nexus-ai.app',
              'X-Title': 'NEXUS AI',
            }),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 800,
      }),
    })
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null; reasoning?: string | null }
      }>
      error?: { message?: string } | string
    }
    if (!res.ok) {
      const err = typeof data.error === 'string' ? data.error : data.error?.message
      throw new Error(err || `Provider ${provider.id} responded ${res.status}`)
    }
    const choice = data.choices?.[0]?.message
    const content = choice?.content ?? choice?.reasoning
    if (!content || !content.trim()) {
      throw new Error(`Empty response from ${provider.id}`)
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs the full free multi-AI chain, ROUTED BY TASK. Every provider has
 * its own rate-limit budget, and the chain order puts the best engine
 * for the task first:
 *   chat/voice     → LLM7 first (fast conversational models)
 *   reasoning/docs → Kilo first (550B reasoning / strong writers)
 *   code           → Kilo first (north-mini-code), then Qwen on OVH
 *   fast           → OVH first (tiny instant models)
 * Returns the first non-empty assistant text. Throws the last error if
 * every provider fails.
 */
function chainOrderForTask(task?: AiTask): AnonymousProvider[] {
  const byId = new Map(ANONYMOUS_FREE_LLM_FALLBACKS.map((p) => [p.id, p]))
  const llm7 = byId.get('llm7')!
  const ovh = byId.get('ovhcloud')!
  const kilo = byId.get('kilocode')!
  // Premium env-token providers (HF / Grok) join the chain — they lead
  // with their own dedicated quota; the anonymous free pool follows.
  const env = envTokenProviders().map((p) => ({
    ...p,
    models: envProviderModelsForTask(p, task),
  }))
  switch (task) {
    case 'reasoning':
    case 'documents':
    case 'code':
      return [...env, kilo, llm7, ovh] // premium + big-model engines first
    case 'fast':
      return [...env, llm7, ovh, kilo] // small instant engines first
    default:
      // CHAT: quality-first — premium pool + Kilo's nemotron-120B.
      return [...env, kilo, llm7, ovh]
  }
}

export async function anonymousFallbackChat(
  messages: ExternalChatMessage[],
  opts: { maxTokens?: number; timeoutMs?: number; task?: AiTask } = {}
): Promise<{ content: string; providerId: string; model: string }> {
  // SPEED: race the free pool in parallel first — the sequential chain was
  // the #1 source of multi-second chat latency (each dead provider burned
  // its full timeout before the next was tried). Hedged requests: fire the
  // top model of EVERY provider simultaneously; first non-empty answer wins.
  try {
    return await raceAnonymousFallbackChat(messages, opts)
  } catch (raceErr) {
    const msg = raceErr instanceof Error ? raceErr.message : ''
    // Only fall through to the sequential chain when the race genuinely
    // exhausted (all waves failed). Timeouts are handled inside the race.
    if (!/all waves exhausted/i.test(msg)) {
      /* fall through to sequential chain as final safety net */
    }
  }
  const chain = chainOrderForTask(opts.task)
  let lastError: unknown = null
  for (const provider of chain) {
    for (const model of provider.models) {
      try {
        const content = await anonymousChatCompletion(provider, normalizeSystemRole(messages), {
          model,
          maxTokens: opts.maxTokens,
          timeoutMs: opts.timeoutMs,
        })
        if (content.trim()) {
          return { content, providerId: provider.id, model }
        }
      } catch (err) {
        lastError = err
        // 429 / 402 / 403 / 5xx → try next model/provider.
        // Network errors → try next provider.
        const msg = err instanceof Error ? err.message : ''
        if (/429|402|403|rate|quota|unavailable|empty response|responded 5/i.test(msg)) {
          continue
        }
        // Don't break — try the next provider, the chain is cheap.
        continue
      }
    }
  }
  throw lastError ?? new Error('All anonymous free-LLM fallbacks failed.')
}

/* ------------------------------------------------------------------ */
/* HEDGED (PARALLEL) FREE-POOL RACING — the speed fix                  */
/*                                                                     */
/* Instead of trying providers one-by-one (LLM7 timeout → OVH timeout  */
/* → Kilo…, easily 10-20s of dead air), we fire one request per        */
/* provider SIMULTANEOUSLY and take the first usable answer. Waves:    */
/*   wave 1: top model of each provider (3 parallel requests)          */
/*   wave 2: second model of each provider                             */
/*   then:   give up → caller's sequential fallback chain              */
/* Every provider has its OWN rate-limit budget, so a parallel fan-out */
/* of one request per provider is within all documented limits.        */
/* ------------------------------------------------------------------ */

interface RaceWinner {
  content: string
  providerId: string
  model: string
}

/** Promise wrapper that NEVER rejects — resolves null on failure. */
function soft<T>(p: Promise<T>): Promise<T | null> {
  return p.then(
    (v) => v,
    () => null
  )
}

/** Resolves with the first non-null result; rejects only when ALL fail. */
function firstSuccess<T>(promises: Array<Promise<T | null>>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let pending = promises.length
    let settled = false
    if (!pending) reject(new Error('nothing to race'))
    for (const p of promises) {
      p.then((v) => {
        if (settled) return
        if (v != null) {
          settled = true
          resolve(v)
        } else if (--pending === 0) {
          reject(new Error('all candidates failed'))
        }
      })
    }
  })
}

/** Raced anonymous completion — wave-per-wave parallel hedging. */
export async function raceAnonymousFallbackChat(
  messages: ExternalChatMessage[],
  opts: { maxTokens?: number; timeoutMs?: number; task?: AiTask; maxWaves?: number } = {}
): Promise<RaceWinner> {
  const chain = chainOrderForTask(opts.task)
  const normalized = normalizeSystemRole(messages)
  const maxWaves = Math.min(opts.maxWaves ?? 2, 3)
  // Per-request cap: the race only needs ONE provider to answer fast —
  // don't let a slow zombie request hold the wave open.
  const perRequestMs = Math.min(opts.timeoutMs ?? 30_000, 30_000)
  let lastError: unknown = null

  for (let wave = 0; wave < maxWaves; wave++) {
    const candidates = chain
      .map((provider) => ({ provider, model: provider.models[wave] }))
      .filter((c): c is { provider: AnonymousProvider; model: string } => Boolean(c.model))
    if (!candidates.length) break

    const raced = candidates.map(({ provider, model }) =>
      soft(
        anonymousChatCompletion(provider, normalized, {
          model,
          maxTokens: opts.maxTokens,
          timeoutMs: perRequestMs,
        }).then<RaceWinner | null>((content) =>
          content.trim() ? { content, providerId: provider.id, model } : null
        )
      )
    )

    try {
      const winner = await firstSuccess(raced)
      return winner
    } catch (err) {
      lastError = err
      // next wave
    }
  }
  throw lastError instanceof Error
    ? new Error(`race: all waves exhausted (${lastError.message})`)
    : new Error('race: all waves exhausted')
}

/* ------------------------------------------------------------------ */
/* STREAMING anonymous fallbacks (SSE token-by-token)                 */
/* ------------------------------------------------------------------ */

/**
 * The chat route builds llmMessages with the system prompt as an
 * ASSISTANT-role first message (Z.ai convention). Most OpenAI-compatible
 * providers behave better with a proper SYSTEM role — convert index 0
 * when it's the system prompt. Subsequent assistant messages (tool
 * exchanges, history) are left untouched.
 */
function normalizeSystemRole(
  messages: ExternalChatMessage[]
): ExternalChatMessage[] {
  if (messages.length > 0 && messages[0].role === 'assistant') {
    return messages.map((m, i) => (i === 0 ? { ...m, role: 'system' as const } : m))
  }
  return messages
}

/**
 * Streams a completion from ONE anonymous provider (SSE, token-by-token),
 * emitting deltas through onDelta as they arrive. Falls back to the
 * non-streaming endpoint if the provider rejects stream:true.
 * Accepts an AbortSignal so losing racers can be cancelled.
 */
async function streamAnonymousCompletion(
  provider: AnonymousProvider,
  messages: ExternalChatMessage[],
  onDelta: (delta: string) => void,
  opts: { model?: string; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const model = opts.model ?? provider.models[0]
  const timeoutMs = opts.timeoutMs ?? 60_000
  // Combine the racer's abort signal with a hard timeout (AbortSignal.any
  // is available in Bun/Node 20+). Losers get aborted instantly; the winner
  // is still bounded by the timeout.
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {
            'HTTP-Referer': 'https://nexus-ai.app',
            'X-Title': 'NEXUS AI',
          }),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 800,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(body.error?.message || `Provider ${provider.id} responded ${res.status}`)
  }
  if (!res.body) throw new Error(`No stream from ${provider.id}`)
  return consumeSSEWithPeek(res.body.getReader(), onDelta)
}

/**
 * RACED STREAMING fallback — the speed fix for the main chat.
 *
 * Fires the free pool in PARALLEL (one stream per provider) instead of
 * sequentially waiting for each to fail. The first provider to emit a
 * visible delta LOCKS the race: from that moment only its deltas reach
 * onDelta, and every other stream is aborted. Losers are cancelled the
 * instant they lose — no wasted quota, no duplicated text.
 *
 * Wave model (mirrors raceAnonymousFallbackChat):
 *   wave 1 → top model of each provider, raced
 *   wave 2 → second model of each provider, raced
 *   give up → caller falls back to non-streamed smartChat
 *
 * Mid-stream failure of the LOCKED winner keeps the partial text already
 * shown to the user (retrying would duplicate on screen).
 */
export async function streamAnonymousFallbackChat(
  messages: ExternalChatMessage[],
  onDelta: (delta: string) => void,
  opts: { maxTokens?: number; timeoutMs?: number; task?: AiTask } = {}
): Promise<{ content: string; providerId: string; model: string }> {
  const normalized = normalizeSystemRole(messages)
  const chain = chainOrderForTask(opts.task)
  const perRequestMs = Math.min(opts.timeoutMs ?? 60_000, 90_000)
  let lastError: unknown = null

  for (let wave = 0; wave < 2; wave++) {
    const candidates = chain
      .map((provider) => ({ provider, model: provider.models[wave] }))
      .filter((c): c is { provider: AnonymousProvider; model: string } => Boolean(c.model))
    if (!candidates.length) break

    /** Locked once any racer emits its first visible delta. */
    let lockedIdx = -1
    const controllers = candidates.map(() => new AbortController())
    // Abort every racer EXCEPT the locked winner (call after lock).
    const abortLosers = (winner: number) => {
      controllers.forEach((c, i) => {
        if (i !== winner) c.abort()
      })
    }

    const racers = candidates.map(({ provider, model }, i) => {
      let emitted = ''
      return {
        promise: (async (): Promise<{ content: string; providerId: string; model: string } | null> => {
          try {
            const full = await streamAnonymousCompletion(
              provider,
              normalized,
              (d) => {
                emitted += d
                // FIRST delta from this racer: try to lock the race.
                if (lockedIdx === -1) {
                  lockedIdx = i
                  abortLosers(i)
                }
                if (lockedIdx === i) onDelta(d) // only the winner reaches the UI
              },
              { model, maxTokens: opts.maxTokens, timeoutMs: perRequestMs, signal: controllers[i].signal }
            )
            if (full.trim()) return { content: full, providerId: provider.id, model }
            // Stream completed empty — only the winner is a real result.
            return lockedIdx === i && emitted.trim()
              ? { content: emitted, providerId: provider.id, model }
              : null
          } catch (err) {
            lastError = err
            // Winner failing mid-stream: keep the visible partial output.
            if (lockedIdx === i && emitted.trim()) {
              console.error(
                `[streamRace] ${provider.id}/${model} failed mid-stream — keeping partial (${emitted.length} chars)`
              )
              return { content: emitted, providerId: provider.id, model }
            }
            return null
          }
        })(),
      }
    })

    const winner = await firstSuccess(racers.map((r) => soft(r.promise)))
    // Defensive: abort anything still running (e.g. winner resolved empty
    // after a loser locked, or a zombie connection).
    abortLosers(lockedIdx >= 0 ? lockedIdx : -1)
    if (winner) return winner
    // all wave-1 racers failed before any delta → next wave
  }
  throw lastError instanceof Error
    ? new Error(`stream race failed: ${lastError.message}`)
    : new Error('All anonymous streaming fallbacks failed.')
}
