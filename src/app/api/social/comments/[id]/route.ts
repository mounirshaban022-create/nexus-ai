import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { draftCommentReply } from '@/lib/social'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* PATCH — act on one comment:                                         */
/*   { action: 'draft' }                    → (re)generate the AI reply */
/*   { reply: '…' }                         → save an edited reply     */
/*   { action: 'dismiss' }                  → hide it from the queue   */
/* DELETE ?id → remove the comment                                     */
/* ------------------------------------------------------------------ */

const patchSchema = z.object({
  action: z.enum(['draft', 'dismiss']).optional(),
  reply: z.string().max(2000).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-comment-patch:${clientKey(req)}`, 30, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests — wait a moment.' }, { status: 429 })

  const { id } = await params
  const comment = await db.socialComment.findFirst({ where: { id, userId: session.userId } })
  if (!comment) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  const { action, reply } = parsed.data

  try {
    if (action === 'draft') {
      const result = await draftCommentReply(session.userId, id)
      const fresh = await db.socialComment.findUnique({ where: { id } })
      return NextResponse.json({ comment: fresh, ...result })
    }
    if (action === 'dismiss') {
      await db.socialComment.update({ where: { id }, data: { status: 'dismissed' } })
      return NextResponse.json({ ok: true })
    }
    if (typeof reply === 'string' && reply.trim()) {
      await db.socialComment.update({
        where: { id },
        data: { aiReply: reply.trim().slice(0, 2000), status: 'replied', repliedAt: new Date() },
      })
      const fresh = await db.socialComment.findUnique({ where: { id } })
      return NextResponse.json({ comment: fresh })
    }
    return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 })
  } catch (error) {
    console.error('[api/social/comments/[id]] PATCH error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Action failed.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { id } = await params
  const comment = await db.socialComment.findFirst({ where: { id, userId: session.userId } })
  if (!comment) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 })
  try {
    await db.socialComment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/social/comments/[id]] DELETE error:', error)
    return NextResponse.json({ error: 'Could not delete the comment.' }, { status: 500 })
  }
}
