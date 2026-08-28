import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { ensurePerUserColumns } from '@/lib/schema-guard'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const rl = rateLimit(`provider-del:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    const { id } = await context.params
    // SECURITY: ownership check — deleteMany with userId filter is atomic;
    await ensurePerUserColumns()
    // returns count=0 when the id belongs to another user (no leak).
    const result = await db.aiProvider.deleteMany({
      where: { id, userId: session.userId },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Provider not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to remove provider.' }, { status: 500 })
  }
}
