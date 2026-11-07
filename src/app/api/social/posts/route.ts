import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { publishSocialPost, runAutopilotTick } from '@/lib/social'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* GET — the post queue + activity. This route doubles as the app's    */
/* automation heartbeat: every time the Social Pilot screen is open it */
/* opportunistically fires the autopilot tick for due accounts.        */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const url = new URL(req.url)
  const heartbeat = url.searchParams.get('heartbeat') !== '0'
  const origin = req.headers.get('origin') || url.origin

  try {
    // Lazy autopilot — "it just works" while the app is open.
    let autopilot: Awaited<ReturnType<typeof runAutopilotTick>> | null = null
    if (heartbeat) {
      try {
        autopilot = await runAutopilotTick(session.userId, origin, 2)
      } catch (err) {
        console.warn('[api/social/posts] autopilot tick failed:', err)
      }
    }

    const [posts, activity] = await Promise.all([
      db.socialPost.findMany({
        where: { userId: session.userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 60,
      }),
      db.socialActivity.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ])

    return NextResponse.json({
      posts: posts.map((p) => ({ ...p, mediaUrls: JSON.parse(p.mediaUrls || '[]') as string[] })),
      activity,
      autopilot,
    })
  } catch (error) {
    console.error('[api/social/posts] GET error:', error)
    return NextResponse.json({ error: 'Could not load the queue.' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* POST — create a post: publish now, schedule, or queue for review    */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  accountId: z.string().min(4),
  caption: z.string().max(6000),
  mediaUrls: z.array(z.string().max(600)).max(10).optional().default([]),
  mediaKind: z.enum(['image', 'video', 'carousel', 'text']).optional().default('image'),
  // ISO string → scheduled; 'now' | omitted → publish immediately.
  scheduledFor: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-post:${clientKey(req)}`, 20, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many posts in a minute — wait a moment.' }, { status: 429 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid post payload.' }, { status: 400 })
  const { accountId, caption, mediaUrls, mediaKind, scheduledFor } = parsed.data

  const scheduled = scheduledFor && scheduledFor !== 'now' ? new Date(scheduledFor) : null
  if (scheduled && Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: 'Invalid schedule date.' }, { status: 400 })
  }
  if (mediaKind !== 'text' && mediaUrls.length === 0 && !scheduled) {
    return NextResponse.json({ error: 'Add a photo or video (or pick text-only) before publishing.' }, { status: 400 })
  }

  try {
    const { post, result } = await publishSocialPost({
      userId: session.userId,
      accountId,
      caption,
      mediaUrls,
      mediaKind,
      origin: req.headers.get('origin') || new URL(req.url).origin,
      originKind: 'manual',
      scheduledFor: scheduled,
    })
    return NextResponse.json({ post, result })
  } catch (error) {
    console.error('[api/social/posts] POST error:', error)
    const message = error instanceof Error ? error.message : 'Publish failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
