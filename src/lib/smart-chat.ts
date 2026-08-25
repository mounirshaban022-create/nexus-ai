import { getActiveAiProvider, externalChatCompletion, anonymousFallbackChat, type ExternalChatMessage } from './ai-providers'
import { zaiChatCompletion, zaiOnCooldown, zaiConfigured } from './zai'
import {
  openrouterConfigured,
  openrouterChatCompletion,
  type OpenRouterMessage,
} from './openrouter'
import type { AiTask } from './smart-chat-types'

/**
 * MULTI-AI SMART ROUTER — task-aware, Z.ai-free.
 *
 * NEXUS runs on a POOL of free AI engines. Every task is routed to the
 * models that do it best (specialist routing), and each provider has its
 * own independent rate-limit budget — so the platform never depends on a
 * single engine.
 *
 * Engine pool (all verified live, no API keys required):
 *   - LLM7.io     (mistral-Nemo, DeepSeek-V4-Flash, minimax-m2.7)
 *   - OVHcloud    (Mistral-7B/Small, Qwen3-32B, Llama-3.3-70B)
 *   - Kilo Code   (openrouter/free router, nemotron-550B, north-code)
 * Plus any provider the user connected with their own key (OpenRouter,
 * Groq, Gemini, Cohere, NVIDIA NIM, Ollama Cloud…) — those always go first.
 *
 * Task routing (which engine family gets which job):
 *   CHAT/VOICE   → conversational models (mistral-Nemo class)
 *   REASONING    → large reasoning models (nemotron-550B, minimax class)
 *   DOCUMENTS    → strong writers (DeepSeek-V4-Flash class)
 *   CODE         → code specialists (north-mini-code, Qwen class)
 *   FAST         → tiny instant models (Mistral-7B, LFM class)
 */

export type { AiTask }

export interface SmartChatOptions {
  maxTokens?: number
  temperature?: number
  /** Skip user providers (for provider-test routes) */
  builtinOnly?: boolean
  /** The task type — routes to specialist models */
  task?: AiTask
  /** Per-request timeout in ms (passed through to externalChatCompletion).
   *  Defaults to 15s for voice, 120s otherwise. */
  timeoutMs?: number
}

/** Specialist models per task, per provider.
 *  DeepSeek (when connected+funded) takes priority — it's the strongest direct API.
 *  OpenRouter free models are the fallback specialists. */
const TASK_SPECIALISTS_BY_PROVIDER: Record<string, Record<AiTask, string[]>> = {
  deepseek: {
    code: ['deepseek-v4-flash', 'deepseek-chat'],
    reasoning: ['deepseek-reasoner', 'deepseek-v4-pro'],   // R1 = elite reasoning
    chat: ['deepseek-v4-flash', 'deepseek-chat'],
    voice: ['deepseek-v4-flash'],                           // flash = fast
    documents: ['deepseek-v4-pro', 'deepseek-chat'],
    fast: ['deepseek-v4-flash'],
  },
  groq: {
    code: ['qwen/qwen3-32b'],
    reasoning: ['deepseek-r1-distill-llama-70b'],
    chat: ['llama-3.3-70b-versatile'],
    voice: ['llama-3.1-8b-instant'],                        // 8B = instant
    documents: ['llama-3.3-70b-versatile'],
    fast: ['llama-3.1-8b-instant'],
  },
  qwen: {
    code: ['qwen2.5-coder-32b-instruct', 'qwen3-coder-plus'],
    reasoning: ['qwen-max', 'qwen-plus'],
    chat: ['qwen-plus', 'qwen-turbo'],
    voice: ['qwen-turbo'],
    documents: ['qwen-max', 'qwen-plus'],
    fast: ['qwen-turbo'],
  },
  zhipu: {
    code: ['glm-5-turbo', 'glm-5'],           // 5-turbo = fast coder
    reasoning: ['glm-5.3', 'glm-5'],           // newest reasoning
    chat: ['glm-5-turbo', 'glm-5'],            // fast conversational
    voice: ['glm-5-turbo'],                    // lowest latency
    documents: ['glm-5.3', 'glm-5'],           // best writer
    fast: ['glm-5-turbo'],
  },
  // OpenRouter — PREMIUM-first model pool (Claude Sonnet 4 leads every
  // task; free models remain as last-resort fallbacks when a premium model
  // is rate-limited or the user's OpenRouter credits run low).
  // The user explicitly requested "smarter AI that understands everything"
  // + "premium" — Claude Sonnet 4 is the strongest general-purpose model
  // on OpenRouter (smart, fast, multimodal, 200k context). GPT-4o is the
  // fallback premium; the :free models are emergency-only.
  openrouter: {
    code: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'cohere/north-mini-code:free'],
    reasoning: ['anthropic/claude-sonnet-4', 'openai/o1-mini', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
    chat: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
    voice: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'liquid/lfm-2.5-2.6b:free'],
    documents: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemma-4-31b-it:free'],
    fast: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'liquid/lfm-2.5-2.6b:free'],
  },
  // Putra AI (Malaysia) — OpenAI-compatible, 500 free API calls
  putra: {
    code: ['gpt-4o-mini', 'gpt-4o'],
    reasoning: ['gpt-4o', 'gpt-4'],
    chat: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    voice: ['gpt-4o-mini'],
    documents: ['gpt-4o', 'gpt-4o-mini'],
    fast: ['gpt-4o-mini', 'gpt-3.5-turbo'],
  },
  // New free-key providers (added 2026-09 from awesome-free-llm-apis)
  llm7: {
    code: ['DeepSeek-V4-Flash-0731', 'mistral-Nemo-Instruct-2407'],
    reasoning: ['minimax-m2.7', 'DeepSeek-V4-Flash-0731'],
    chat: ['mistral-Nemo-Instruct-2407'],
    voice: ['mistral-Nemo-Instruct-2407'],
    documents: ['DeepSeek-V4-Flash-0731', 'mistral-Nemo-Instruct-2407'],
    fast: ['mistral-Nemo-Instruct-2407'],
  },
  ovhcloud: {
    code: ['Qwen3-32B', 'Mistral-Small-3.2-24B-Instruct'],
    reasoning: ['Meta-Llama-3_3-70B-Instruct', 'Qwen3-32B'],
    chat: ['Mistral-7B-Instruct-v0.3', 'Mistral-Nemo-Instruct-2407'],
    voice: ['Mistral-7B-Instruct-v0.3', 'Qwen3.5-9B'],
    documents: ['Mistral-Small-3.2-24B-Instruct', 'Meta-Llama-3_3-70B-Instruct'],
    fast: ['Mistral-7B-Instruct-v0.3', 'Qwen3.5-9B'],
  },
  kilocode: {
    code: ['cohere/north-mini-code:free', 'liquid/lfm-2.5-2.6b:free'],
    reasoning: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter/free'],
    chat: ['openrouter/free', 'liquid/lfm-2.5-2.6b:free'],
    voice: ['liquid/lfm-2.5-2.6b:free'],
    documents: ['openrouter/free', 'cohere/north-mini-code:free'],
    fast: ['liquid/lfm-2.5-2.6b:free'],
  },
  cohere: {
    code: ['command-r-08-2024', 'command-a-03-2025'],
    reasoning: ['command-a-03-2025', 'command-r-plus-08-2024'],
    chat: ['command-r-08-2024', 'command-r7b-08-2024'],
    voice: ['command-r7b-08-2024'],
    documents: ['command-a-03-2025', 'command-r-plus-08-2024'],
    fast: ['command-r7b-08-2024'],
  },
  cloudflare: {
    code: ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    reasoning: ['@cf/openai/gpt-oss-120b', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'],
    chat: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash'],
    voice: ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    documents: ['@cf/google/gemma-4-26b-a4b-it', '@cf/openai/gpt-oss-120b'],
    fast: ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  },
  nvidia: {
    code: ['mistralai/mistral-large-2-instruct', 'meta/llama-3.3-70b-instruct'],
    reasoning: ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-super-120b-a12b'],
    chat: ['nvidia/nemotron-3-super-120b-a12b', 'meta/llama-3.3-70b-instruct'],
    voice: ['openai/gpt-oss-20b', 'meta/llama-3.3-70b-instruct'],
    documents: ['mistralai/mistral-large-2-instruct', 'nvidia/nemotron-3-super-120b-a12b'],
    fast: ['openai/gpt-oss-20b'],
  },
  ollama: {
    code: ['gpt-oss:120b', 'deepseek-v4-flash'],
    reasoning: ['deepseek-v4-pro', 'mistral-large-3:675b'],
    chat: ['deepseek-v4-flash', 'minimax-m3'],
    voice: ['deepseek-v4-flash', 'gpt-oss:120b'],
    documents: ['deepseek-v4-pro', 'kimi-k3'],
    fast: ['deepseek-v4-flash'],
  },
}

const TASK_SPECIALISTS: Record<AiTask, string[]> = TASK_SPECIALISTS_BY_PROVIDER.openrouter

export async function smartChat(
  messages: ExternalChatMessage[] | Array<{ role: string; content: string }>,
  opts: SmartChatOptions = {}
): Promise<string> {
  const { maxTokens = 4000, temperature = 0.7, builtinOnly = false, task = 'chat' } = opts
  const isVoiceTask = task === 'voice'
  const effectiveTimeoutMs = opts.timeoutMs ?? (isVoiceTask ? 15_000 : undefined)
  const maxModelAttempts = isVoiceTask ? 2 : 4

  /* ---- Layer 0: OpenRouter (primary on Vercel) ----
   * When OPENROUTER_API_KEY is set, OpenRouter is tried FIRST for every
   * task. It's a high-quality, well-rounded gateway (Claude, GPT, etc.)
   * that works the same in sandbox and on Vercel. Z.ai remains as a
   * Layer 0b fallback for the sandbox dev environment (faster, free).
   * On Vercel the Z.ai SDK is unavailable — `zaiConfigured()` returns
   * false and Layer 0b is skipped automatically. */
  if (openrouterConfigured()) {
    try {
      const content = await openrouterChatCompletion(
        messages as OpenRouterMessage[],
        {
          maxTokens,
          temperature,
          timeoutMs: effectiveTimeoutMs ?? 60_000,
        }
      )
      if (content.trim()) {
        console.log(`[smartChat] served by OpenRouter (task: ${task})`)
        return content
      }
    } catch (orErr) {
      console.warn(
        '[smartChat] OpenRouter failed, falling through:',
        orErr instanceof Error ? orErr.message : orErr
      )
    }
  }

  /* ---- Layer 0b: the platform's built-in Z.ai engine (GLM) ----
   * Millisecond-latency gateway shipped with the sandbox — by far the
   * fastest engine available. Only attempted in the sandbox dev
   * environment (the SDK isn't bundled on Vercel). Tried first for
   * EVERY task when OpenRouter isn't configured; the free pool and
   * user providers only serve as fallbacks when Z.ai is cooling down
   * (circuit breaker) or fails. This is the root fix for "AI is slow". */
  if (!zaiOnCooldown() && (await zaiConfigured())) {
    try {
      const content = await zaiChatCompletion(
        messages as Array<{ role: string; content: string }>,
        { maxTokens, temperature, timeoutMs: effectiveTimeoutMs ?? 60_000 }
      )
      if (content.trim()) {
        console.log(`[smartChat] served by Z.ai engine (task: ${task})`)
        return content
      }
    } catch (zaiErr) {
      console.warn(
        '[smartChat] Z.ai engine failed, falling through:',
        zaiErr instanceof Error ? zaiErr.message : zaiErr
      )
    }
  }

  /* ---- Layer 1: the user's connected provider (their key, their quota) ---- */
  if (!builtinOnly) {
    const provider = await getActiveAiProvider()
    if (provider) {
      const providerSpecialists = TASK_SPECIALISTS_BY_PROVIDER[provider.providerId]
      const specialists = (providerSpecialists?.[task] ?? TASK_SPECIALISTS[task]) ?? TASK_SPECIALISTS.chat
      const models =
        provider.providerId === 'openrouter' || providerSpecialists
          ? [...specialists, provider.defaultModel].filter(
              (m, i, arr) => arr.indexOf(m) === i // dedupe
            )
          : [undefined, undefined]

      let lastError: unknown = null
      for (const model of models.slice(0, maxModelAttempts)) {
        try {
          const content = await externalChatCompletion(provider, messages as ExternalChatMessage[], {
            maxTokens,
            model,
            timeoutMs: effectiveTimeoutMs,
          })
          if (content.trim()) return content
        } catch (err) {
          lastError = err
          const msg = err instanceof Error ? err.message : ''
          if (/429|402|403|rate|budget|provider returned error|temporarily/i.test(msg)) continue
          break
        }
      }
      if (lastError) {
        console.error('[smartChat] user provider failed, using the free AI pool:', lastError)
      }
    }
  }

  /* ---- Layer 2: the free multi-AI pool (task-routed, Z.ai-free) ----
   * anonymousFallbackChat routes per task:
   *   chat/voice → LLM7 first (fast conversational)
   *   reasoning/documents/code → Kilo first (big reasoning/writer/code models)
   *   fast → OVH first (tiny instant models)
   * Every engine has its own rate-limit budget. */
  const anonTimeout = isVoiceTask ? 15_000 : 45_000
  try {
    const { content, providerId, model } = await anonymousFallbackChat(
      messages as ExternalChatMessage[],
      { maxTokens, timeoutMs: anonTimeout, task }
    )
    if (content.trim()) {
      console.log(`[smartChat] served by free AI pool: ${providerId}/${model} (task: ${task})`)
      return content
    }
  } catch (err) {
    console.error('[smartChat] free AI pool exhausted:', err instanceof Error ? err.message : err)
  }

  throw new Error('All AI engines are busy right now. Please try again in a moment.')
}
