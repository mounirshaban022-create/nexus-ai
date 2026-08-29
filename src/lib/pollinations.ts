/* ------------------------------------------------------------------ */
/* POLLINATIONS FLUX — free universal image engine                     */
/*                                                                     */
/* Shared by the app's /api/image route and the console studio as the  */
/* always-available fallback in the premium cascade. Extracted verbatim */
/* from the original route so both call sites use identical logic.     */
/* ------------------------------------------------------------------ */

export async function pollinationsImage(prompt: string, size: string): Promise<Buffer> {
  const [w, h] = size.split('x').map(Number)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    // Quality-boosted prompt (cinematic quality terms improve Pollinations output significantly)
    const qualityPrompt = `${prompt}, high quality, detailed, professional, sharp focus, beautiful lighting`
    const seed = Math.floor(Math.random() * 1_000_000)
    const res = await fetch(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(qualityPrompt)}?width=${w}&height=${h}&nologo=true&enhance=true&model=flux&seed=${seed}`,
      { signal: controller.signal }
    )
    if (!res.ok) throw new Error(`Free image service responded ${res.status}`)
    const arr = new Uint8Array(await res.arrayBuffer())
    const buffer = Buffer.from(arr)
    if (buffer.length < 1000) throw new Error('Free image service returned no data')
    return buffer
  } finally {
    clearTimeout(timer)
  }
}
