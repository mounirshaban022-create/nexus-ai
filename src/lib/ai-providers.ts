import { createDecipheriv, scryptSync } from 'crypto'
import { db } from '@/lib/db'

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
  opts: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const model = opts.model ?? provider.defaultModel
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
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
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Provider responded ${res.status}`)
    }
    const content = data.choices?.[0]?.message?.content
    if (!content || !content.trim()) throw new Error('Empty response from model')
    return content
  } finally {
    clearTimeout(timer)
  }
}

/** Verifies a provider API key by listing models (or a tiny completion). */
export async function verifyAiProvider(
  baseUrl: string,
  apiKey: string,
  providerId: string
): Promise<{ ok: boolean; message: string }> {
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
