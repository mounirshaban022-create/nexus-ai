import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'
import { geminiImage, hfImage, premiumImageEngines } from '@/lib/premium-image'
import { openrouterConfigured, openrouterGenerateImage } from '@/lib/openrouter'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getVerifiedSession, getCurrentUser } from '@/lib/auth'

const requestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  size: z.enum(['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440']).optional(),
  provider: z.enum(['nexus', 'free']).optional().default('nexus'),
})

export const IS_VERCEL = Boolean(process.env.VERCEL)
const IMAGES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-images')

/**
 * IMAGE GENERATION — premium-first pipeline (Vercel-native, no Z.ai):
 *
 *   1. Google Gemini (gemini-2.5-flash-image → 2.0 preview fallback) —
 *      flagship quality, key already provisioned in the deployment.
 *   2. Hugging Face FLUX.1-dev → schnell — flagship open diffusion.
 *   3. Pollinations FLUX (FREE, open, no API key) — universal fallback.
 *   4. OpenRouter — optional last resort with a user key.
 *
 * Every engine failure cascades to the next; the response records which
 * engine actually produced the bytes.
 *
 * Bytes are persisted BOTH to disk and to the DB (base64) so generated
 * images survive Vercel's ephemeral /tmp across serverless invocations.
 */

async function pollinationsImage(prompt: string, size: string): Promise<Buffer> {
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

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`image:${clientKey(req)}`, 8, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Image limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A prompt is required (max 2000 chars).' }, { status: 400 })
    }

    const chosenSize = parsed.data.size ?? '1024x1024'
    const trimmedPrompt = parsed.data.prompt.trim()

    const user = await getCurrentUser(req)

    let buffer: Buffer | null = null
    let usedEngine = 'pollinations'

    /* ---- 1. PREMIUM engine — Google Gemini (deployment-provisioned key) ---- */
    if (premiumImageEngines().gemini) {
      try {
        buffer = await geminiImage(trimmedPrompt, chosenSize)
        usedEngine = 'gemini'
      } catch (geminiErr) {
        console.warn('[api/image] Gemini image gen failed:', geminiErr instanceof Error ? geminiErr.message : geminiErr)
      }
    }

    /* ---- 2. PREMIUM engine — Hugging Face FLUX ---- */
    if (!buffer && premiumImageEngines().huggingface) {
      try {
        buffer = await hfImage(trimmedPrompt, chosenSize)
        usedEngine = 'hf-flux'
      } catch (hfErr) {
        console.warn('[api/image] HF FLUX failed:', hfErr instanceof Error ? hfErr.message : hfErr)
      }
    }

    /* ---- 3. FREE engine — Pollinations FLUX (no key, works on Vercel) ---- */
    if (!buffer) {
      try {
        buffer = await pollinationsImage(trimmedPrompt, chosenSize)
      } catch (freeErr) {
        console.warn('[api/image] Pollinations failed:', freeErr instanceof Error ? freeErr.message : freeErr)
      }
    }

    /* ---- 4. OpenRouter — optional last resort with a user key ---- */
    if (!buffer && openrouterConfigured()) {
      const { base64 } = await openrouterGenerateImage({ prompt: trimmedPrompt, size: chosenSize })
      buffer = Buffer.from(base64, 'base64')
      usedEngine = 'openrouter'
    }

    if (!buffer) {
      throw new Error('Image generation is temporarily unavailable — the free image service is busy. Please try again in a moment.')
    }

    const filename = `${randomUUID()}`
    const buffer_ = buffer as Buffer

    // Persist to disk (local + warm /tmp) AND to the DB (survives Vercel).
    await mkdir(IMAGES_DIR, { recursive: true }).catch(() => {})
    await writeFile(path.join(IMAGES_DIR, `${filename}.png`), buffer_).catch(() => {})

    // Persist with the base64 payload; if the live DB hasn't been migrated
    // to the `data` column yet, retry without it (schema-drift resilience —
    // /tmp still serves warm requests).
    let record
    try {
      record = await db.generatedImage.create({
        data: {
          prompt: trimmedPrompt,
          size: chosenSize,
          provider: usedEngine,
          url: `/api/image/file/${filename}`,
          data: buffer_.toString('base64'),
          userId: user?.id ?? null,
        },
      })
    } catch (dataColErr) {
      const msg = dataColErr instanceof Error ? dataColErr.message : ''
      if (!/data|column/i.test(msg)) throw dataColErr
      console.warn('[api/image] data column missing — persisting metadata only')
      record = await db.generatedImage.create({
        data: {
          prompt: trimmedPrompt,
          size: chosenSize,
          provider: usedEngine,
          url: `/api/image/file/${filename}`,
          userId: user?.id ?? null,
        },
      })
    }
    if (record.userId) {
      void supabaseUpsert('library_items', {
        id: record.id,
        user_id: record.userId,
        kind: 'image',
        status: 'done',
        url: record.url,
      }, { onConflict: 'id' })
    }

    return NextResponse.json({
      image: {
        id: record.id,
        url: record.url,
        prompt: record.prompt,
        size: record.size,
        createdAt: record.createdAt,
      },
    })
  } catch (error) {
    console.error('[api/image] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Image generation failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // The gallery listing is account data — generation (POST) stays open
    // to guests, but browsing saved images requires a session.
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    // SECURITY: only the caller's OWN generated images.
    const images = await db.generatedImage.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    })
    return NextResponse.json({ images })
  } catch (error) {
    console.error('[api/image] GET error:', error)
    return NextResponse.json({ error: 'Failed to load gallery.' }, { status: 500 })
  }
}
