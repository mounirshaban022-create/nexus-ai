import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { supabaseUpsert } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * The full profile selection used by both GET and PATCH responses.
 * `interests` is stored as a JSON-encoded string in the DB.
 */
const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
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
  createdAt: true,
  updatedAt: true,
} as const

/** Strict PATCH schema — any unknown key is rejected by zod. */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(120).optional(),
    timezone: z.string().max(80).optional(),
    language: z.enum(['en', 'ar']).optional(),
    jobTitle: z.string().max(100).optional(),
    website: z.string().max(200).optional(),
    notifications: z.boolean().optional(),
    interests: z.array(z.string().max(40)).max(12).optional(),
    commStyle: z.enum(['concise', 'balanced', 'detailed', 'friendly']).optional(),
  })
  .strict()

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: PROFILE_SELECT,
  })
  if (!profile) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  let interests: string[] = []
  try {
    const parsed = JSON.parse(profile.interests)
    if (Array.isArray(parsed)) interests = parsed.map(String)
  } catch {
    interests = []
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      location: profile.location,
      timezone: profile.timezone,
      language: profile.language,
      jobTitle: profile.jobTitle,
      website: profile.website,
      notifications: profile.notifications,
      interests,
      commStyle: profile.commStyle,
      emailVerified: profile.emailVerified,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  })
}

export async function PATCH(req: NextRequest) {
  // Rate limit: 20 profile updates per minute per client.
  const rl = rateLimit(`profile-update:${clientKey(req)}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many updates. Wait a minute.' },
      { status: 429 }
    )
  }

  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: first?.message || 'Invalid input.' },
      { status: 400 }
    )
  }

  // Build the DB data payload — only fields that were actually provided.
  const data: Record<string, unknown> = {}
  const p = parsed.data
  if (p.name !== undefined) data.name = p.name
  if (p.bio !== undefined) data.bio = p.bio
  if (p.location !== undefined) data.location = p.location
  if (p.timezone !== undefined) data.timezone = p.timezone
  if (p.language !== undefined) data.language = p.language
  if (p.jobTitle !== undefined) data.jobTitle = p.jobTitle
  if (p.website !== undefined) data.website = p.website
  if (p.notifications !== undefined) data.notifications = p.notifications
  if (p.commStyle !== undefined) data.commStyle = p.commStyle
  if (p.interests !== undefined) {
    // Stored as JSON string (User.interests is a String column).
    data.interests = JSON.stringify(p.interests)
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: PROFILE_SELECT,
  })

  // Cloud sync: mirror the profile to Supabase (no-op when unconfigured)
  void supabaseUpsert('profiles', {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    avatar_url: updated.avatarUrl,
    bio: updated.bio,
    location: updated.location,
    timezone: updated.timezone,
    language: updated.language,
    job_title: updated.jobTitle,
    website: updated.website,
    notifications: updated.notifications,
    interests: updated.interests,
    comm_style: updated.commStyle,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  let interests: string[] = []
  try {
    const parsedInterests = JSON.parse(updated.interests)
    if (Array.isArray(parsedInterests)) interests = parsedInterests.map(String)
  } catch {
    interests = []
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      bio: updated.bio,
      location: updated.location,
      timezone: updated.timezone,
      language: updated.language,
      jobTitle: updated.jobTitle,
      website: updated.website,
      notifications: updated.notifications,
      interests,
      commStyle: updated.commStyle,
      emailVerified: updated.emailVerified,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  })
}
