import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const rl = rateLimit(`email-del:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    const { id } = await context.params
    await db.emailAccount.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete account.' }, { status: 500 })
  }
}
