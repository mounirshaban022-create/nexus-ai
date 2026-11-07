import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { logActivity } from '@/lib/social'

/* ------------------------------------------------------------------ */
/* DELETE — cancel a queued/scheduled post                             */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { id } = await ctx.params

  try {
    const post = await db.socialPost.findFirst({ where: { id, userId: session.userId } })
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    if (post.status === 'published' || post.status === 'simulated') {
      return NextResponse.json({ error: 'This post already went out — it cannot be cancelled.' }, { status: 400 })
    }
    await db.socialPost.delete({ where: { id } })
    await logActivity(session.userId, post.accountId, 'fail', `Cancelled a ${post.platform} post before it went out`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/social/posts/id] DELETE error:', error)
    return NextResponse.json({ error: 'Could not cancel the post.' }, { status: 500 })
  }
}
