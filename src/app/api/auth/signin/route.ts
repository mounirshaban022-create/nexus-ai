import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, signToken, setSessionCookie, isUserSuspended } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts per minute per client.
  const rl = rateLimit(`auth-signin:${clientKey(req)}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Identical generic message — same as the wrong-password case below.
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 400 })
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase()

  const user = await db.user.findUnique({ where: { email: normalizedEmail } })
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  // Console control hook: suspended accounts cannot sign in (fail-open on
  // any storage error — see isUserSuspended in src/lib/auth.ts).
  if (await isUserSuspended(user.id)) {
    return NextResponse.json({ error: 'This account has been suspended. Contact support.' }, { status: 403 })
  }

  const token = await signToken({ userId: user.id })
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
  setSessionCookie(res, token, req)
  return res
}
