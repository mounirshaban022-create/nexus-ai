import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, signToken, setSessionCookie } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { supabaseUpsert } from '@/lib/supabase'

export const runtime = 'nodejs'

// Tightened password policy: min 8 chars + ≥1 letter + ≥1 digit.
const schema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must include at least one letter')
    .regex(/\d/, 'Password must include at least one digit'),
  name: z.string().trim().min(1).max(80).optional(),
})

export async function POST(req: NextRequest) {
  // Rate limit: 5 signups per minute per client.
  const rl = rateLimit(`auth-signup:${clientKey(req)}`, 5, 60_000)
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
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message || 'Invalid input.' }, { status: 400 })
  }

  const { email, password, name } = parsed.data
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists.' },
      { status: 409 }
    )
  }

  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      name: name?.trim() || '',
      passwordHash,
      interests: '[]',
      commStyle: 'balanced',
    },
    select: { id: true, email: true, name: true },
  })

  // Cloud sync: create the profile row in Supabase (no-op when unconfigured)
  void supabaseUpsert('profiles', {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  const token = await signToken({ userId: user.id })
  const res = NextResponse.json({ user }, { status: 201 })
  setSessionCookie(res, token, req)
  return res
}
