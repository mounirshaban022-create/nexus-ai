import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/auth'

const requestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  size: z.enum(['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440']).optional(),
  provider: z.enum(['nexus', 'free']).optional().default('nexus'),
})

export const IMAGES_DIR = path.join(process.cwd(), 'generated-images')

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
    const provider = parsed.data.provider ?? 'nexus'
    const trimmedPrompt = parsed.data.prompt.trim()

    const user = await getCurrentUser(req)

    let buffer: Buffer
    if (provider === 'free') {
      // Free generation via Pollinations (enhanced quality from Open-Generative-AI patterns)
      const [w, h] = chosenSize.split('x').map(Number)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90_000)
      try {
        // Quality-boosted prompt (cinematic quality terms improve Pollinations output significantly)
        const qualityPrompt = `${trimmedPrompt}, high quality, detailed, professional, sharp focus, beautiful lighting`
        const res = await fetch(
          `https://image.pollinations.ai/prompt/${encodeURIComponent(qualityPrompt)}?width=${w}&height=${h}&nologo=true&enhance=true&model=flux&seed=${Math.floor(Math.random() * 1_000_000)}`,
          { signal: controller.signal }
        )
        if (!res.ok) throw new Error(`Free image service responded ${res.status}`)
        const arr = new Uint8Array(await res.arrayBuffer())
        buffer = Buffer.from(arr)
        if (buffer.length < 1000) throw new Error('Free image service returned no data')
      } finally {
        clearTimeout(timer)
      }
    } else {
      const zai = await getZAI()
      const response = await zai.images.generations.create({
        prompt: trimmedPrompt,
        size: chosenSize,
      })
      const base64 = response.data?.[0]?.base64
      if (!base64) {
        throw new Error('Image generation returned no data. Please try again.')
      }
      buffer = Buffer.from(base64, 'base64')
    }
    const filename = `${randomUUID()}.png`

    await mkdir(IMAGES_DIR, { recursive: true })
    await writeFile(path.join(IMAGES_DIR, filename), buffer)

    const record = await db.generatedImage.create({
      data: {
        prompt: trimmedPrompt,
        size: chosenSize,
        provider,
        url: `/api/image/file/${filename.replace('.png', '')}`,
        userId: user?.id ?? null,
      },
    })

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
