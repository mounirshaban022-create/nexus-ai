import { getActiveAiProvider, externalChatCompletion, anonymousFallbackChat, type ExternalChatMessage } from './ai-providers'
import { getZAI } from './zai'

/**
 * SMART AI ROUTER — task-aware, multi-provider.
 *
 * Specialized models per task (when user's providers are connected):
 *   - CODE tasks    → code-specialist models (Qwen Coder, DeepSeek Coder class)
 *   - REASONING     → large reasoning models (Nemotron 550B class)
 *   - CHAT/VOICE    → fast conversational models (GLM, Laguna class)
 *   - DOCUMENTS     → strong writers (Gemma class)
 *   - FAST/SHORT    → tiny instant models (LFM class)
 *
 * Priority chain per task:
 *   1. Task's specialist model on user's provider
 *   2. General fallback models on user's provider
 *   3. Built-in Z.ai engine
 */

export type AiTask = 'chat' | 'voice' | 'code' | 'documents' | 'reasoning' | 'fast'

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
  // ── Anonymous zero-key providers (added 2026-09 from awesome-free-llm-apis)
  // When a user "connects" one of these as their primary, smart-chat picks
  // task-appropriate models from this map before falling to anonymousFallbackChat.
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
  // ── New free-key providers (added 2026-09 from awesome-free-llm-apis)
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
  // OpenRouter free models (default when it's the connected provider)
  openrouter: {
    code: ['cohere/north-mini-code:free', 'poolside/laguna-s-2.1:free', 'nvidia/nemotron-3-super-120b-a12b:free'],
    reasoning: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'z-ai/glm-5.2:free'],
    chat: ['z-ai/glm-5.2:free', 'poolside/laguna-s-2.1:free', 'google/gemma-4-31b-it:free'],
    voice: ['poolside/laguna-s-2.1:free', 'nvidia/nemotron-3.5-lightning:free', 'liquid/lfm-2.5-2.6b:free'],
    documents: ['google/gemma-4-31b-it:free', 'z-ai/glm-5.2:free', 'dots-studio/dots-3-note-preview:free'],
    fast: ['liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3.5-lightning:free'],
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
}

const TASK_SPECIALISTS: Record<AiTask, string[]> = TASK_SPECIALISTS_BY_PROVIDER.openrouter

export async function smartChat(
  messages: ExternalChatMessage[] | Array<{ role: string; content: string }>,
  opts: SmartChatOptions = {}
): Promise<string> {
  // Bug 1 fix (Phase 0): destructure `task` with a default so the bare
  // `task` references at line 99 resolve to a real variable instead of
  // throwing ReferenceError on every custom-provider request.
  const { maxTokens = 4000, temperature = 0.7, builtinOnly = false, task = 'chat' } = opts
  // Bug F: voice turns must feel live — cap each model attempt at 15s and try at
  // most 2 models (vs 4 for other tasks). Non-voice behaviour is unchanged.
  const isVoiceTask = task === 'voice'
  const effectiveTimeoutMs = opts.timeoutMs ?? (isVoiceTask ? 15_000 : undefined)
  const maxModelAttempts = isVoiceTask ? 2 : 4

  if (!builtinOnly) {
    const provider = await getActiveAiProvider()
    if (provider) {
      // Task-aware model selection: provider-specific specialists first
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
          const content = await externalChatCompletion(provider, messages, {
            maxTokens,
            model,
            timeoutMs: effectiveTimeoutMs,
          })
          if (content.trim()) return content
        } catch (err) {
          lastError = err
          // 429/402/403 → try next model; other errors → break to builtin
          const msg = err instanceof Error ? err.message : ''
          // Rate limits, budget errors, and generic upstream provider errors
          // all warrant trying the next model
          if (/429|402|403|rate|budget|provider returned error|temporarily/i.test(msg)) continue
          break
        }
      }
      if (lastError) {
        console.error('[smartChat] user provider failed, falling back to built-in:', lastError)
      }
    }
  }

  // Built-in Z.ai engine (our quota)
  try {
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content
    if (content?.trim()) return content
  } catch (err) {
    // Z.ai failed (typically a global 429 rate-limit storm). Fall through
    // to the anonymous free-LLM chain — those providers have their own
    // independent rate-limit budgets so they bypass the Z.ai 429 entirely.
    console.error('[smartChat] Z.ai engine failed, trying anonymous fallbacks:', err instanceof Error ? err.message : err)
  }

  // ANONYMOUS FREE-LLM FALLBACK CHAIN (NEW 2026-09)
  // Last-resort layer: LLM7.io → OVHcloud → Kilo Code. No API key, no
  // signup — every endpoint is verified live and OpenAI-compatible.
  // This is what makes NEXUS keep working even when:
  //   - the user has no connected provider
  //   - the connected provider hit a 429
  //   - the built-in Z.ai engine ALSO hit a 429
  // The chain multiplies per-IP free capacity across three providers.
  // Voice tasks get a tighter timeout so mic turns feel live.
  const anonTimeout = isVoiceTask ? 15_000 : 30_000
  try {
    const { content: anonContent, providerId, model } = await anonymousFallbackChat(
      messages as ExternalChatMessage[],
      { maxTokens, timeoutMs: anonTimeout }
    )
    if (anonContent.trim()) {
      console.log(`[smartChat] anonymous fallback served: ${providerId}/${model}`)
      return anonContent
    }
  } catch (err) {
    console.error('[smartChat] anonymous fallbacks exhausted:', err instanceof Error ? err.message : err)
  }

  throw new Error('All AI providers (Z.ai + anonymous fallbacks) returned empty responses.')
}
