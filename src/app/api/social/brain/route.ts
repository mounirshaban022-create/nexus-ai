import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { buildPageStrategy, getSocialAccount, logActivity, toPublicAccount, SOCIAL_PLATFORMS, type PageStrategy } from '@/lib/social'
import { db } from '@/lib/db'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* POST — teach the agent about THIS page (page brain) and optionally  */
/* let it build the full AI content strategy from what it learned.     */
/* Body: { accountId, pageNiche?, pageAudience?, pageTone?,            */
/*         pageGoal?, pageLanguage?, buildStrategy? }                  */
/* ------------------------------------------------------------------ */

const brainSchema = z.object({
  accountId: z.string().min(4),
  pageNiche: z.string().max(600).optional(),
  pageAudience: z.string().max(600).optional(),
  pageTone: z.string().max(300).optional(),
  pageGoal: z.string().max(300).optional(),
  pageLanguage: z.string().max(40).optional(),
  buildStrategy: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-brain:${clientKey(req)}`, 15, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests — wait a moment.' }, { status: 429 })

  const parsed = brainSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid brain payload.' }, { status: 400 })
  const { accountId, buildStrategy, ...fields } = parsed.data

  const got = await getSocialAccount(session.userId, accountId)
  if (!got) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })

  try {
    await db.socialAccount.update({
      where: { id: accountId },
      data: {
        ...(fields.pageNiche !== undefined ? { pageNiche: fields.pageNiche } : {}),
        ...(fields.pageAudience !== undefined ? { pageAudience: fields.pageAudience } : {}),
        ...(fields.pageTone !== undefined ? { pageTone: fields.pageTone } : {}),
        ...(fields.pageGoal !== undefined ? { pageGoal: fields.pageGoal } : {}),
        ...(fields.pageLanguage !== undefined ? { pageLanguage: fields.pageLanguage } : {}),
      },
    })

    let strategy: PageStrategy | null = null
    if (buildStrategy) {
      const built = await buildPageStrategy(session.userId, accountId)
      strategy = built.strategy
      await logActivity(session.userId, accountId, 'brain', `🧠 Page brain updated for ${SOCIAL_PLATFORMS[got.rec.platform].label} — strategy rebuilt`)
    }

    const fresh = await getSocialAccount(session.userId, accountId)
    return NextResponse.json({
      account: fresh ? toPublicAccount(fresh.rec, fresh.token) : null,
      strategy,
    })
  } catch (error) {
    console.error('[api/social/brain] POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save the page brain.' }, { status: 500 })
  }
}
