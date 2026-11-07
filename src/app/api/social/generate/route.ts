import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { isSocialPlatform, generatePostDraft, logActivity, SOCIAL_PLATFORMS } from '@/lib/social'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* POST — the agent writes the caption + shoots the visual             */
/* Body: { platform, topic, tone?, withImage? }                        */
/* ------------------------------------------------------------------ */

const genSchema = z.object({
  platform: z.string().min(2),
  topic: z.string().min(3).max(500),
  tone: z.string().max(200).optional().default(''),
  withImage: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-generate:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many generations — wait a moment.' }, { status: 429 })

  const parsed = genSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid generation payload.' }, { status: 400 })
  const { platform, topic, tone, withImage } = parsed.data
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  try {
    const draft = await generatePostDraft({ userId: session.userId, platform, topic, tone, withImage })
    await logActivity(session.userId, '', 'generate', `Agent drafted a ${SOCIAL_PLATFORMS[platform].label} post${draft.imageUrl ? ' with a generated visual' : ''}`)
    return NextResponse.json(draft)
  } catch (error) {
    console.error('[api/social/generate] POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed.' }, { status: 500 })
  }
}
