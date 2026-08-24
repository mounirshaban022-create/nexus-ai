import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

/**
 * NEXUS auth — real email/password with bcrypt + JWT sessions.
 * No external auth provider required.
 */

const SESSION_COOKIE = 'nexus-session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const ALG = 'HS256'

function getSecret(): string {
  // In production, AUTH_SECRET MUST be set. A known dev fallback would let
  // anyone forge JWTs signed with a publicly-known secret. Fail fast.
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.AUTH_SECRET
    if (!secret || secret.trim() === '') {
      throw new Error('AUTH_SECRET environment variable is required in production')
    }
    return secret
  }
  return process.env.AUTH_SECRET || 'nexus-dev-secret-change-me'
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(getSecret())
}

/** Hash a plaintext password using bcrypt with 10 rounds. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(plain, salt)
}

/** Verify a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Sign a JWT session token (HS256, 30-day expiry) for the given user id. */
export async function signToken(payload: { userId: string }): Promise<string> {
  return new SignJWT({ sub: payload.userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setSubject(payload.userId)
    .sign(getSecretKey())
}

/** Verify a JWT session token and return the user id, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [ALG],
    })
    const userId = payload.sub || (payload as { userId?: string }).userId
    if (!userId) return null
    return { userId }
  } catch {
    return null
  }
}

/** Read the session cookie from a NextRequest and verify it. Returns null if absent/invalid. */
export async function getSession(req: NextRequest): Promise<{ userId: string } | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

/** Look up the user from the session cookie. Returns the user WITHOUT passwordHash. */
export async function getCurrentUser(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return null
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      interests: true,
      commStyle: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return user
}

/** Set the session cookie on a NextResponse (httpOnly, 30-day, lax, secure in prod). */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  })
}

/** Clear the session cookie on a NextResponse. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
