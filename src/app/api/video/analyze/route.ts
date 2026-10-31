import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getZAI } from '@/lib/zai'
import { assertPublicUrl } from '@/lib/safe-url'

export const runtime = 'nodejs'
// Video understanding is a long call (large uploads + multi-frame analysis).
export const maxDuration = 300

const DEFAULT_PROMPT =
  'Analyze this video for me. Respond in clean markdown with: **Overview** (2-3 sentences), ' +
  '**Scene breakdown** (numbered list with rough timestamps if visible), **Key objects & people**, ' +
  "**Text/screens seen** (if any), **Mood & pacing**, **Notable quality issues**. Be factual — say 'not visible' rather than guessing."

const MAX_URL_CHARS = 2048
// 25MB decoded → base64 inflates by 4/3 → ~34.9M characters on the wire.
const MAX_VIDEO_DATA_CHARS = 35_000_000

const requestSchema = z.object({
  source: z
    .string()
    .min(1)
    .refine(
      (s) =>
        s.startsWith('data:video/') || (/^https?:\/\//i.test(s) && s.length <= MAX_URL_CHARS),
      { message: 'Provide an http(s) video URL (max 2048 chars) or a data:video/ base64 payload.' }
    ),
  question: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Signed-in feature — video analysis runs paid AI engines (mirrors /api/vision).
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in to analyze videos.' }, { status: 401 })
    }

    // Video understanding is heavier than image vision — tighter throttle.
    const limit = rateLimit(`video-analyze:${clientKey(req)}`, 10, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Provide an http(s) video URL (max 2048 chars) or an uploaded video under 25MB, plus an optional question (max 500 chars).' },
        { status: 400 }
      )
    }

    const { source, question } = parsed.data

    if (source.startsWith('data:video/')) {
      // Uploaded video arrives inline as base64 — hard-cap ~25MB decoded.
      if (source.length > MAX_VIDEO_DATA_CHARS) {
        return NextResponse.json(
          { error: 'Video too large. Please use a file under 25MB.' },
          { status: 400 }
        )
      }
    } else {
      // SSRF guard — the engine fetches this URL server-side.
      try {
        assertPublicUrl(source)
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Invalid video URL.' },
          { status: 400 }
        )
      }
    }

    const prompt = question?.trim()
      ? `Answer this question about the video, citing timestamps where possible: ${question.trim()}`
      : DEFAULT_PROMPT

    const zai = await getZAI()
    const result = await zai.chat.completions.createVision({
      model: 'glm-4.5v',
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'video_url', video_url: { url: source } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const analysis = result?.choices?.[0]?.message?.content ?? ''
    if (!analysis.trim()) {
      return NextResponse.json(
        { error: 'The vision engine returned an empty analysis. Please try again.' },
        { status: 502 }
      )
    }
    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('[api/video/analyze] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Video analysis failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
