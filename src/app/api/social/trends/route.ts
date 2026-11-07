import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { researchTrends } from '@/lib/social'

export const maxDuration = 300

/* ------------------------------------------------------------------ */
/* POST — the Trend Radar: real web research on what is attracting     */
/* people in this niche RIGHT NOW, distilled into topics, hooks and    */
/* hashtags that feed every future post.                               */
/* Body: { accountId, force? }                                         */
/* ------------------------------------------------------------------ */

const trendsSchema = z.object({
  accountId: z.string().min(4),
  force: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-trends:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many scans — give the radar a moment.' }, { status: 429 })

  const parsed = trendsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid trends payload.' }, { status: 400 })

  try {
    const { trends, cached } = await researchTrends(session.userId, parsed.data.accountId, { force: parsed.data.force })
    return NextResponse.json({ trends, cached })
  } catch (error) {
    console.error('[api/social/trends] POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Trend scan failed.' }, { status: 500 })
  }
}
