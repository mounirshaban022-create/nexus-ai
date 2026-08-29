/* ------------------------------------------------------------------ */
/* PREMIUM IMAGE ENGINES — Vercel-native, zero Z.ai                    */
/*                                                                     */
/* The user-facing image pipeline used to fall back to the Z.ai        */
/* sandbox gateway, which never works on Vercel. This library replaces */
/* it with premium engines that use keys already provisioned in the    */
/* deployment environment and are fully serverless-compatible:         */
/*                                                                     */
/*   1. GOOGLE GEMINI image generation (gemini-2.5-flash-image and     */
/*      siblings) — flagship photorealistic quality when the key's     */
/*      Google project has image models enabled.                       */
/*   2. xAI GROK image generation (grok-2-image / aurora) — premium    */
/*      quality, OpenAI-compatible images API.                         */
/*   3. HUGGING FACE router (FLUX.1-dev/schnell) — works when HF still */
/*      serves the model for the account; degrades gracefully (410).   */
/*   4. Pollinations FLUX — free universal fallback (in the route).    */
/*                                                                     */
/* premiumImageCascade() runs every configured engine in order and     */
/* returns the first successful buffer together with the engine id and */
/* per-engine attempt errors, so callers can surface exactly which     */
/* engine produced the image and why others were skipped.              */
/* ------------------------------------------------------------------ */

const GEMINI_ENDPOINTS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent',
]

const XAI_IMAGE_MODELS = ['grok-2-image-1212', 'grok-2-image']

const HF_ENDPOINTS = [
  'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev',
  'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
]

export function geminiImageConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export function hfImageConfigured(): boolean {
  return Boolean(process.env.HF_TOKEN)
}

export function xaiImageConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY)
}

/** Which premium engines are live in this deployment (for status UIs). */
export function premiumImageEngines(): { gemini: boolean; xai: boolean; huggingface: boolean; pollinations: boolean } {
  return {
    gemini: geminiImageConfigured(),
    xai: xaiImageConfigured(),
    huggingface: hfImageConfigured(),
    pollinations: true,
  }
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

/** Pull the first inline base64 image out of a Gemini generateContent response. */
function extractGeminiImage(json: unknown): Buffer | null {
  const candidates = (json as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }).candidates
  if (!Array.isArray(candidates)) return null
  for (const c of candidates) {
    const parts = c?.content?.parts ?? []
    for (const p of parts) {
      const b64 = p?.inlineData?.data
      if (b64 && b64.length > 500) return Buffer.from(b64, 'base64')
    }
  }
  return null
}

/**
 * Google Gemini image generation. Aspect ratio is steered via the prompt
 * (the API returns 1024-class images; we pass size hints as text guidance).
 */
export async function geminiImage(prompt: string, size: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  const [w, h] = size.split('x').map(Number)
  const ratio = w && h ? (w > h * 1.2 ? 'wide 16:9 landscape' : h > w * 1.2 ? 'tall 9:16 portrait' : 'square 1:1') : 'square'
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: `Generate a ${ratio} image: ${prompt}. Ultra high quality, professional, detailed, beautiful lighting.` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  })
  let lastErr: Error | null = null
  for (const endpoint of GEMINI_ENDPOINTS) {
    const t = withTimeout(90_000)
    try {
      const res = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: t.signal,
      })
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '')
        lastErr = new Error(`Gemini ${endpoint.split('/models/')[1]?.split(':')[0]} → ${res.status}: ${bodyText.slice(0, 160)}`)
        continue
      }
      const json = await res.json().catch(() => null)
      const buf = json ? extractGeminiImage(json) : null
      if (buf && buf.length > 1000) return buf
      lastErr = new Error('Gemini returned no image payload')
    } finally {
      t.done()
    }
  }
  throw lastErr ?? new Error('Gemini image generation failed')
}

/** xAI Grok image generation (aurora) — OpenAI-compatible images API. */
export async function xaiImage(prompt: string, _size: string): Promise<Buffer> {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY not configured')
  let lastErr: Error | null = null
  for (const model of XAI_IMAGE_MODELS) {
    const t = withTimeout(90_000)
    try {
      const res = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, response_format: 'b64_json', n: 1 }),
        signal: t.signal,
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        lastErr = new Error(`xAI ${model} → ${res.status}: ${errText.slice(0, 160)}`)
        continue
      }
      const json = await res.json().catch(() => null)
      const b64 = (json as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json
      const url = (json as { data?: { url?: string }[] })?.data?.[0]?.url
      if (b64 && b64.length > 500) return Buffer.from(b64, 'base64')
      if (url) {
        const imgRes = await fetch(url, { signal: withTimeout(30_000).signal })
        if (imgRes.ok) {
          const buf = Buffer.from(new Uint8Array(await imgRes.arrayBuffer()))
          if (buf.length > 1000) return buf
        }
      }
      lastErr = new Error(`xAI ${model} returned no image payload`)
    } finally {
      t.done()
    }
  }
  throw lastErr ?? new Error('xAI image generation failed')
}

/** Hugging Face FLUX inference — flagship open diffusion models. */
export async function hfImage(prompt: string, size: string): Promise<Buffer> {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not configured')
  const [w, h] = size.split('x').map(Number)
  const qualityPrompt = `${prompt}, masterpiece, best quality, highly detailed, professional photography, cinematic lighting, sharp focus`
  let lastErr: Error | null = null
  for (const endpoint of HF_ENDPOINTS) {
    const t = withTimeout(120_000)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({
          inputs: qualityPrompt,
          parameters: { width: Math.min(w || 1024, 1024), height: Math.min(h || 1024, 1024), num_inference_steps: 28 },
          options: { wait_for_model: true, use_cache: false },
        }),
        signal: t.signal,
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        lastErr = new Error(`HF ${endpoint.split('/models/')[1]} → ${res.status}: ${errText.slice(0, 140)}`)
        continue
      }
      const arr = new Uint8Array(await res.arrayBuffer())
      const buffer = Buffer.from(arr)
      if (buffer.length > 1000) return buffer
      lastErr = new Error('HF returned empty image')
    } finally {
      t.done()
    }
  }
  throw lastErr ?? new Error('HF image generation failed')
}

export interface PremiumImageResult {
  buffer: Buffer
  engine: string
  attempts: { engine: string; error: string }[]
}

/**
 * Full premium cascade. Engines with missing keys are skipped; failures
 * are recorded and cascade onward. Pollinations/openrouter fallbacks stay
 * in the calling route (they are the existing free paths there).
 */
export async function premiumImageCascade(prompt: string, size: string): Promise<PremiumImageResult> {
  const attempts: { engine: string; error: string }[] = []
  const engines = premiumImageEngines()

  if (engines.gemini) {
    try {
      return { buffer: await geminiImage(prompt, size), engine: 'gemini', attempts }
    } catch (err) {
      attempts.push({ engine: 'gemini', error: err instanceof Error ? err.message : String(err) })
    }
  } else {
    attempts.push({ engine: 'gemini', error: 'GEMINI_API_KEY not configured' })
  }

  if (engines.xai) {
    try {
      return { buffer: await xaiImage(prompt, size), engine: 'grok', attempts }
    } catch (err) {
      attempts.push({ engine: 'grok', error: err instanceof Error ? err.message : String(err) })
    }
  } else {
    attempts.push({ engine: 'grok', error: 'XAI_API_KEY not configured' })
  }

  if (engines.huggingface) {
    try {
      return { buffer: await hfImage(prompt, size), engine: 'hf-flux', attempts }
    } catch (err) {
      attempts.push({ engine: 'hf-flux', error: err instanceof Error ? err.message : String(err) })
    }
  } else {
    attempts.push({ engine: 'hf-flux', error: 'HF_TOKEN not configured' })
  }

  const err = new Error(`All premium image engines unavailable: ${attempts.map(a => `${a.engine} (${a.error.slice(0, 60)})`).join('; ')}`)
  ;(err as Error & { attempts?: typeof attempts }).attempts = attempts
  throw err
}
