/* ------------------------------------------------------------------ */
/* NEXUS VISION ENGINE — image understanding cascade.                  */
/*                                                                    */
/* Replaces the retired Z.ai createVision path (owner directive: Z.ai  */
/* is permanently disabled). Tries, in order:                          */
/*   1. Gemini (GEMINI_API_KEY)     — gemini-3.6-flash, fast + cheap   */
/*   2. OpenRouter (OPENROUTER_API_KEY) — vision-capable models        */
/*   3. Groq (GROQ_API_KEY)         — llama-4-scout multimodal         */
/*                                                                    */
/* Every engine failure is captured (never thrown mid-chain) and the   */
/* per-engine diagnostics are returned so the caller/UI can show WHY   */
/* an engine was skipped — same pattern as lib/premium-image.ts.       */
/* Server-side only.                                                   */
/* ------------------------------------------------------------------ */

export interface VisionResult {
  text: string
  engine: string
  diagnostics: Array<{ engine: string; ok: boolean; error?: string }>
}

interface VisionEngine {
  id: string
  configured: () => boolean
  run: (imageBase64: string, mimeType: string, question: string) => Promise<string>
}

/** Parse a data URL (or bare base64) into { mimeType, base64 }. */
export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl)
  if (match) {
    return { mimeType: match[1] || 'image/png', base64: match[3] ?? '' }
  }
  // Bare base64 — assume PNG (most generators emit PNG).
  return { mimeType: 'image/png', base64: dataUrl }
}

/* -------------------------- 1. Gemini ----------------------------- */

function geminiEngine(): VisionEngine {
  return {
    id: 'gemini',
    configured: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
    run: async (base64, mimeType, question) => {
      const key = process.env.GEMINI_API_KEY!.trim()
      // NOTE: gemini-2.0/1.5 are RETIRED, and gemini-2.5-flash is 404 for
      // NEW API keys (the production key is new) — that is why "vision
      // doesn't work". 3.6-flash first; 2.5 stays as a legacy fallback.
      // thinkingBudget 0 is a 2.5-family knob — never sent to 3.x models.
      const models = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']
      const errors: string[] = []
      for (const model of models) {
        let lastError: string | null = null
        // Two attempts per model — Google's "Unable to process input image"
        // is often transient (its own message says "Please retry").
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        { text: question },
                        { inline_data: { mime_type: mimeType, data: base64 } },
                      ],
                    },
                  ],
                  generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.4,
                    ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
                  },
                }),
                signal: AbortSignal.timeout(45_000),
              }
            )
            if (!res.ok) {
              const errText = (await res.text()).slice(0, 160)
              lastError = `${model}: HTTP ${res.status} ${errText}`
              if (attempt === 0 && res.status === 400) continue // one retry
              break // move to the next model
            }
            const data = (await res.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
            }
            const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
            if (text.trim()) return text.trim()
            lastError = `${model}: empty response`
            break
          } catch (err) {
            lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
            break
          }
        }
        if (lastError) errors.push(lastError)
      }
      throw new Error(errors.join(' | ') || 'no model answered')
    },
  }
}

/* ------------------------- 2. OpenRouter --------------------------- */

function openRouterEngine(): VisionEngine {
  return {
    id: 'openrouter',
    configured: () => Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    run: async (base64, mimeType, question) => {
      const key = process.env.OPENROUTER_API_KEY!.trim()
      const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1'
      // Vision-capable candidates: the PAID qwen2.5-vl slug (the :free one
      // was retired — 404 "use this slug instead") then Gemini via router.
      const models = [
        'qwen/qwen2.5-vl-72b-instruct',
        'google/gemini-2.5-flash',
      ]
      let lastError = 'no model answered'
      for (const model of models) {
        try {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL?.trim() || 'https://nexus-ai.vercel.app',
              'X-Title': process.env.OPENROUTER_APP_NAME?.trim() || 'NEXUS AI',
            },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: question },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                  ],
                },
              ],
            }),
            signal: AbortSignal.timeout(60_000),
          })
          if (!res.ok) {
            lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`
            continue
          }
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>
          }
          const text = data.choices?.[0]?.message?.content ?? ''
          if (text.trim()) return text.trim()
          lastError = `${model}: empty response`
        } catch (err) {
          lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      throw new Error(lastError)
    },
  }
}

/* ---------------------------- 3. Groq ------------------------------ */

function groqEngine(): VisionEngine {
  return {
    id: 'groq',
    configured: () => Boolean(process.env.GROQ_API_KEY?.trim()),
    run: async (base64, mimeType, question) => {
      const key = process.env.GROQ_API_KEY!.trim()
      // llama-4-scout was deprecated/404 for many keys (Aug 2026) — maverick
      // is the surviving Llama-4 multimodal; scout stays as a fallback.
      const models = [
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'meta-llama/llama-4-scout-17b-16e-instruct',
      ]
      let lastError = 'no model answered'
      for (const model of models) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: question },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                  ],
                },
              ],
            }),
            signal: AbortSignal.timeout(45_000),
          })
          if (!res.ok) {
            lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`
            continue
          }
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
          const text = data.choices?.[0]?.message?.content ?? ''
          if (!text.trim()) {
            lastError = `${model}: empty response`
            continue
          }
          return text.trim()
        } catch (err) {
          lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      throw new Error(lastError)
    },
  }
}

/* --------------------------- Cascade ------------------------------- */

const ENGINES: VisionEngine[] = [geminiEngine(), openRouterEngine(), groqEngine()]

/** Analyze an image (data URL or bare base64) through the engine cascade. */
export async function analyzeImage(
  dataUrl: string,
  question: string
): Promise<VisionResult> {
  const { mimeType, base64 } = parseDataUrl(dataUrl)
  if (!base64) throw new Error('Image payload is empty.')
  if (base64.length > 12_000_000) throw new Error('Image too large (max ~8MB after encoding).')

  const diagnostics: Array<{ engine: string; ok: boolean; error?: string }> = []
  for (const engine of ENGINES) {
    if (!engine.configured()) {
      diagnostics.push({ engine: engine.id, ok: false, error: 'not configured' })
      continue
    }
    try {
      const text = await engine.run(base64, mimeType, question)
      diagnostics.push({ engine: engine.id, ok: true })
      return { text, engine: engine.id, diagnostics }
    } catch (err) {
      diagnostics.push({
        engine: engine.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  throw new Error(
    `All vision engines failed: ${diagnostics
      .filter((d) => d.error && d.error !== 'not configured')
      .map((d) => `${d.engine} (${d.error})`)
      .join('; ') || 'no engine configured'}`
  )
}
