import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession, getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { getZAI, zaiConfigured } from '@/lib/zai'

export const maxDuration = 120
export const runtime = 'nodejs'

const IS_VERCEL = Boolean(process.env.VERCEL)
const FILES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-images')

/**
 * INSTRUCTION-BASED AI PHOTO EDIT — Z.ai engine (free, no API keys).
 *
 * The client posts { image: dataUrl, instruction, size? } and receives a
 * URL to the edited photo served through the SAME media pipeline as the
 * other image routes: bytes on disk (`generated-images/{id}.png`, /tmp on
 * Vercel) + a durable base64 copy in the `GeneratedImage` table, served by
 * `/api/image/file/{id}` (it sniffs real magic bytes, so PNG/JPEG both work).
 */

const requestSchema = z.object({
  // Data URL only (paste/upload come from the studio UI as data URLs) —
  // ~12MB string ceiling ≈ 9MB decoded image.
  image: z
    .string()
    .min(64)
    .max(12_000_000)
    .refine((v) => v.startsWith('data:image/'), { message: 'image must be a data URL' }),
  instruction: z.string().min(3).max(600),
  size: z
    .enum(['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'])
    .optional(),
})

// Server-side edit-prompt template — keeps tiny instructions ("remove bg")
// producing coherent, identity-preserving, photorealistic edits.
const PROMPT_PREFIX = 'Edit this photo: '
const PROMPT_SUFFIX =
  "Preserve the original subject's identity, proportions, and background unless the instruction says otherwise. Photorealistic, seamless, high detail."

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  try {
    const limit = rateLimit(`photo-edit:${clientKey(req)}`, 10, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many AI edits. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: an image (data URL), an instruction (3–600 chars) and an optional size are required.' },
        { status: 400 }
      )
    }
    const { image, instruction, size } = parsed.data

    // Z.ai gateway check — the sandbox has it; plain hosting does not.
    if (!(await zaiConfigured())) {
      return NextResponse.json(
        { error: 'AI photo engine unavailable — configure Z.ai gateway or use the manual editor.' },
        { status: 503 }
      )
    }

    const prompt = `${PROMPT_PREFIX}${instruction.trim()}. ${PROMPT_SUFFIX}`

    let base64: string | undefined
    try {
      const zai = await getZAI()
      // Wire format (verified against the gateway): images is an ARRAY of
      // {url} objects — the older `image: string` field is rejected with
      // "image_to_image task must provide images".
      const result = await zai.images.generations.edit({
        prompt,
        images: [{ url: image }],
        size,
      })
      base64 = result?.data?.[0]?.base64
    } catch (sdkErr) {
      console.error('[api/photo-edit] SDK edit failed:', sdkErr instanceof Error ? sdkErr.message : sdkErr)
      return NextResponse.json(
        { error: 'The AI editor could not process this photo — try a different instruction or image.' },
        { status: 502 }
      )
    }

    if (!base64 || base64.length < 500) {
      return NextResponse.json(
        { error: 'The AI editor returned no image — try rephrasing your instruction.' },
        { status: 502 }
      )
    }
    const buffer = Buffer.from(base64, 'base64')

    // Persist + serve through the same media route as generated images.
    const id = `photo-${Date.now()}-${randomUUID().slice(0, 8)}`
    await mkdir(FILES_DIR, { recursive: true })
    await writeFile(path.join(FILES_DIR, `${id}.png`), buffer)

    // DB row — the durable copy that survives Vercel's ephemeral /tmp.
    // Mirrors /api/image: retries metadata-only when the live DB lacks the
    // `data` column (schema drift), never fails the request on persist errors.
    const user = await getCurrentUser(req).catch(() => null)
    const persistBase = {
      prompt: `photo-edit: ${instruction.trim()}`.slice(0, 500),
      size: size ?? '1024x1024',
      provider: 'photo-edit',
      url: `/api/image/file/${id}`,
      userId: user?.id ?? null,
    }
    try {
      await db.generatedImage.create({ data: { ...persistBase, data: base64 } })
    } catch (persistErr) {
      const msg = persistErr instanceof Error ? persistErr.message : ''
      if (/data|column/i.test(msg)) {
        try {
          await db.generatedImage.create({ data: { ...persistBase } })
        } catch (retryErr) {
          console.warn('[api/photo-edit] DB persist failed (serving from disk):', retryErr instanceof Error ? retryErr.message : retryErr)
        }
      } else {
        console.warn('[api/photo-edit] DB persist failed (serving from disk):', persistErr instanceof Error ? persistErr.message : persistErr)
      }
    }

    return NextResponse.json({
      ok: true,
      id,
      url: `/api/image/file/${id}`,
      size: size ?? '1024x1024',
      instruction: instruction.trim(),
    })
  } catch (error) {
    console.error('[api/photo-edit] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'AI photo edit failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
