import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import {
  isSocialPlatform,
  generatePostDraft,
  logActivity,
  SOCIAL_PLATFORMS,
  getSocialAccount,
  pageBrainContextOf,
  trendContextOf,
  ensureFreshTrendsFor,
} from '@/lib/social'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* POST — the agent writes the caption + shoots the visual.            */
/* With an accountId the agent ALSO uses its page brain and the latest */
/* trend research, so the draft sounds like the page and rides what    */
/* works right now. Body: { platform, topic, tone?, withImage?,        */
/* accountId? }                                                        */
/* ------------------------------------------------------------------ */

const genSchema = z.object({
  platform: z.string().min(2),
  topic: z.string().min(3).max(500),
  tone: z.string().max(200).optional().default(''),
  withImage: z.boolean().optional().default(true),
  accountId: z.string().min(4).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-generate:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many generations — wait a moment.' }, { status: 429 })

  const parsed = genSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid generation payload.' }, { status: 400 })
  const { platform, topic, tone, withImage, accountId } = parsed.data
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  try {
    let pageContext = ''
    let trendContext = ''
    if (accountId) {
      const got = await getSocialAccount(session.userId, accountId)
      if (got) {
        pageContext = pageBrainContextOf(got.rec)
        // Research-first here too: refresh stale trends, then inject.
        const trendRaw = await ensureFreshTrendsFor(session.userId, accountId)
        trendContext = trendContextOf({ ...got.rec, trendBrain: trendRaw || got.rec.trendBrain })
      }
    }

    const draft = await generatePostDraft({ userId: session.userId, platform, topic, tone, withImage, pageContext, trendContext })
    await logActivity(session.userId, '', 'generate', `Agent drafted a ${SOCIAL_PLATFORMS[platform].label} post${trendContext ? ' informed by live trend research' : ''}${draft.imageUrl ? ' with a generated visual' : ''}`)
    return NextResponse.json(draft)
  } catch (error) {
    console.error('[api/social/generate] POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed.' }, { status: 500 })
  }
}
