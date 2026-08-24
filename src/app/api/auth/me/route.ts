import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ user: null })
  }

  let interests: string[] = []
  try {
    const parsed = JSON.parse(user.interests)
    if (Array.isArray(parsed)) interests = parsed.map(String)
  } catch {
    interests = []
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      interests,
      commStyle: user.commStyle,
      createdAt: user.createdAt,
    },
  })
}
