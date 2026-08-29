/* ------------------------------------------------------------------ */
/* PREMIUM IMAGE ENGINES — Vercel-native, zero Z.ai                    */
/*                                                                     */
/* The user-facing image pipeline used to fall back to the Z.ai        */
/* sandbox gateway, which never works on Vercel. This library replaces */
/* it with two premium engines that already have keys provisioned in   */
/* the deployment environment and are fully serverless-compatible:     */
/*                                                                     */
/*   1. GOOGLE GEMINI image generation (gemini-2.5-flash-image, with   */
/*      gemini-2.0-flash-preview-image-generation fallback) — state-   */
/*      of-the-art photorealistic + text rendering quality.            */
/*   2. HUGGING FACE inference (FLUX.1-dev, FLUX.1-schnell fallback)   */
/*      — flagship open-weights diffusion, enterprise-grade detail.    */
/*                                                                     */
/* Both engines are tried before the free Pollinations fallback that   */
/* already exists in /api/image. Engine selection is fully dynamic:    */
/* an engine with a missing key is skipped, failures cascade to the    */
/* next engine, and the caller always records which engine produced    */
/* the bytes.                                                          */
/* ------------------------------------------------------------------ */

const GEMINI_ENDPOINTS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent',
]

const HF_ENDPOINTS = [
  'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev',
  'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
]

export function geminiImageConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export function hfImageConfigured(): boolean {
  return Boolean(process.env.HF_TOKEN)
}

/** Which premium engines are live in this deployment (for status UIs). */
export function premiumImageEngines(): { gemini: boolean; huggingface: boolean; pollinations: boolean } {
  return { gemini: geminiImageConfigured(), huggingface: hfImageConfigured(), pollinations: true }
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
        lastErr = new Error(`Gemini ${endpoint.split('/models/')[1]} → ${res.status}`)
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
        lastErr = new Error(`HF ${endpoint.split('/models/')[1]} → ${res.status}`)
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
