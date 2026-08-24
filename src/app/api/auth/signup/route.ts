import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, signToken, setSessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(80).optional(),
})

export async function POST(req: NextRequest) {
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

  const token = await signToken({ userId: user.id })
  const res = NextResponse.json({ user }, { status: 201 })
  setSessionCookie(res, token)
  return res
}
