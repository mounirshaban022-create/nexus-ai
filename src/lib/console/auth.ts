import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { createHash, timingSafeEqual } from 'node:crypto'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* CONSOLE AUTH — separate admin gate for /console + /api/console/*    */
/*                                                                     */
/* The console is an enterprise control plane over the whole app, so   */
/* it uses its OWN credential (CONSOLE_PASSWORD) and its OWN cookie    */
/* (`nexus-console`) — completely independent of user sessions.        */
/*                                                                     */
/* The signing key is derived from AUTH_SECRET (already mandatory in   */
/* production — src/lib/auth.ts throws without it) + a console salt,   */
/* so no extra secret needs provisioning.                              */
/*                                                                     */
/* In non-production (local dev) a default password is accepted so the */
/* console works out of the box; in production CONSOLE_PASSWORD MUST   */
/* be set (we provision it in Vercel project env).                     */
/* ------------------------------------------------------------------ */

const CONSOLE_COOKIE = 'nexus-console'
const ALG = 'HS256'
const TTL_SECONDS = 60 * 60 * 12 // 12-hour admin sessions

function consolePassword(): string {
  const pw = process.env.CONSOLE_PASSWORD
  if (pw && pw.trim()) return pw.trim()
  if (process.env.NODE_ENV === 'production') {
    // Provisioned in Vercel env — but never fail hard: an unset password
    // simply means login is impossible (fail-closed), the rest of the app
    // keeps working untouched.
    return ''
  }
  return 'nexus-console-dev'
}

function consoleKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || 'nexus-dev-secret-change-me'
  const material = createHash('sha256')
    .update(`${secret}::nexus-console-v1`)
    .digest()
  return new Uint8Array(material)
}

/** Timing-safe password check. */
function passwordMatches(provided: string, expected: string): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** Sign a console session JWT. */
async function signConsoleToken(): Promise<string> {
  return new SignJWT({ scope: 'console' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(consoleKey())
}

/** Verify the console cookie from a request. Returns true when valid. */
export async function isConsoleAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(CONSOLE_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, consoleKey(), { algorithms: [ALG] })
    return payload.scope === 'console'
  } catch {
    return false
  }
}

/** Guard helper for console API routes — returns a 401 response when not authed, else null. */
export async function requireConsole(req: NextRequest): Promise<NextResponse | null> {
  const ok = await isConsoleAuthed(req)
  if (ok) return null
  return NextResponse.json({ error: 'Console authentication required' }, { status: 401 })
}

/** Handle login (POST): rate-limited password check → set cookie. */
export async function consoleLogin(req: NextRequest, password: string): Promise<NextResponse> {
  const limit = rateLimit(`console-login:${clientKey(req)}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }
  const expected = consolePassword()
  if (!passwordMatches(password || '', expected)) {
    return NextResponse.json({ error: 'Invalid console password' }, { status: 401 })
  }
  const token = await signConsoleToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CONSOLE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
  return res
}

/** Handle logout (DELETE): clear the cookie. */
export function consoleLogout(): NextResponse {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CONSOLE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
