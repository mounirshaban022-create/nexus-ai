import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const DEFAULT_PROMPT =
  'Describe this image in detail: the main subject, notable objects, setting, colors, mood, and any text visible in the image.'

const requestSchema = z.object({
  image: z.string().startsWith('data:image/').max(12_000_000),
  prompt: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`vision:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A base64 image (data URL) is required, under 8MB.' },
        { status: 400 }
      )
    }

    const question = parsed.data.prompt?.trim() || DEFAULT_PROMPT
    const { image } = parsed.data

    const zai = await getZAI()
    const response = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const analysis = response.choices?.[0]?.message?.content
    if (!analysis || !analysis.trim()) {
      throw new Error('Vision analysis returned an empty response. Please try again.')
    }

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('[api/vision] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Vision analysis failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
