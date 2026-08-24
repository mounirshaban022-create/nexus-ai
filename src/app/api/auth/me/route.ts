import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const sessionUser = await getCurrentUser(req)
  if (!sessionUser) {
    return NextResponse.json({ user: null })
  }

  // Re-fetch with the full extended profile (Task 3 added these columns).
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      bio: true,
      location: true,
      timezone: true,
      language: true,
      jobTitle: true,
      website: true,
      notifications: true,
      interests: true,
      commStyle: true,
      emailVerified: true,
      lastActiveAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!user) {
    // Session existed but the user row was deleted out-of-band.
    return NextResponse.json({ user: null })
  }

  // Fire-and-forget presence ping — never block the response on this.
  void db.user
    .update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {})

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
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      location: user.location,
      timezone: user.timezone,
      language: user.language,
      jobTitle: user.jobTitle,
      website: user.website,
      notifications: user.notifications,
      emailVerified: user.emailVerified,
      lastActiveAt: user.lastActiveAt,
      interests,
      commStyle: user.commStyle,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  })
}
