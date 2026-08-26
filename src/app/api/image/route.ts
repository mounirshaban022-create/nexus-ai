import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'
import { getZAI, zaiConfigured } from '@/lib/zai'
import { openrouterConfigured, openrouterGenerateImage } from '@/lib/openrouter'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/auth'

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
 * IMAGE GENERATION — free-first pipeline (works everywhere, no paid keys):
 *
 *   1. Pollinations FLUX (FREE, open, no API key) — primary engine.
 *   2. Z.ai engine — optional enhancement when the platform gateway is
 *      reachable (sandbox only).
 *   3. OpenRouter — optional fallback when the user configured a key.
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

    /* ---- 1. FREE engine first — Pollinations FLUX (no key, works on Vercel) ---- */
    try {
      buffer = await pollinationsImage(trimmedPrompt, chosenSize)
    } catch (freeErr) {
      console.warn('[api/image] Pollinations failed:', freeErr instanceof Error ? freeErr.message : freeErr)
    }

    /* ---- 2. Z.ai engine — optional enhancement when reachable ---- */
    if (!buffer && (await zaiConfigured().catch(() => false))) {
      try {
        const zai = await getZAI()
        const response = await zai.images.generations.create({
          prompt: trimmedPrompt,
          size: chosenSize,
        })
        const base64 = response.data?.[0]?.base64
        if (base64) {
          buffer = Buffer.from(base64, 'base64')
          usedEngine = 'zai'
        }
      } catch (zaiImgErr) {
        console.warn('[api/image] Z.ai image gen failed:', zaiImgErr instanceof Error ? zaiImgErr.message : zaiImgErr)
      }
    }

    /* ---- 3. OpenRouter — optional last resort with a user key ---- */
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

    const record = await db.generatedImage.create({
      data: {
        prompt: trimmedPrompt,
        size: chosenSize,
        provider: usedEngine,
        url: `/api/image/file/${filename}`,
        data: buffer_.toString('base64'),
        userId: user?.id ?? null,
      },
    })
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

export async function GET() {
  try {
    const images = await db.generatedImage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
    })
    return NextResponse.json({ images })
  } catch (error) {
    console.error('[api/image] GET error:', error)
    return NextResponse.json({ error: 'Failed to load gallery.' }, { status: 500 })
  }
}
