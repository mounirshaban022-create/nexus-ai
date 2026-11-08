import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { draftCommentReply, getSocialAccount } from '@/lib/social'

export const maxDuration = 120

/* ------------------------------------------------------------------ */
/* ENGAGEMENT INBOX — comments people leave, with the agent's          */
/* human-quality replies.                                              */
/* GET  ?accountId=… → list comments (newest first)                    */
/* POST { accountId, author?, text, draftNow? } → add a comment and    */
/*       optionally let the agent reply instantly                      */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  try {
    const accountId = new URL(req.url).searchParams.get('accountId')
    const comments = await db.socialComment.findMany({
      where: { userId: session.userId, ...(accountId ? { accountId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ comments })
  } catch (error) {
    console.error('[api/social/comments] GET error:', error)
    return NextResponse.json({ error: 'Could not load the inbox.' }, { status: 500 })
  }
}

const createSchema = z.object({
  accountId: z.string().min(4),
  author: z.string().max(120).optional().default(''),
  text: z.string().min(1).max(2000),
  draftNow: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-comment:${clientKey(req)}`, 30, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many comments — wait a moment.' }, { status: 429 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid comment payload.' }, { status: 400 })
  const { accountId, author, text, draftNow } = parsed.data

  const got = await getSocialAccount(session.userId, accountId)
  if (!got) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })

  try {
    const comment = await db.socialComment.create({
      data: { userId: session.userId, accountId, platform: got.rec.platform, author, text },
    })
    if (draftNow) {
      try {
        await draftCommentReply(session.userId, comment.id)
      } catch (err) {
        // The comment is saved; the reply can be retried from the inbox.
        console.warn('[api/social/comments] draft failed:', err instanceof Error ? err.message : err)
      }
    }
    const fresh = await db.socialComment.findUnique({ where: { id: comment.id } })
    return NextResponse.json({ comment: fresh })
  } catch (error) {
    console.error('[api/social/comments] POST error:', error)
    return NextResponse.json({ error: 'Could not add the comment.' }, { status: 500 })
  }
}
