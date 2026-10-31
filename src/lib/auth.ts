import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'

/**
 * NEXUS auth — real email/password with bcrypt + JWT sessions.
 * No external auth provider required.
 */

const SESSION_COOKIE = 'nexus-session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const ALG = 'HS256'

/**
 * Session-signing secret resolution order:
 *
 *   1. AUTH_SECRET environment variable (the operator-managed secret —
 *      always preferred, dev AND production).
 *   2. AUTO-PROVISIONED secret stored in the AppConfig DB table.
 *      WHY: on managed deployments (Vercel) NODE_ENV=production and a
 *      missing AUTH_SECRET used to make getSecret() THROW — which 500'd
 *      every auth route, so nobody could sign in at all (the #1
 *      "sign-in doesn't work on Vercel" report). The secret must simply
 *      be stable and unknown to outsiders: a cryptographically-random
 *      value generated on first boot and shared by every serverless
 *      instance through the database satisfies that. Sign-in already
 *      requires a working database, so wherever sign-in CAN work, this
 *      secret CAN exist.
 *   3. Only when the DB is ALSO unreachable do we throw — with an
 *      actionable message. We never fall back to a publicly-known
 *      constant (that would let anyone forge session JWTs).
 *
 * authSecretSource() reports which path was taken ('env' | 'db' |
 * 'missing') for /api/health — without ever exposing the secret itself.
 */
const AUTH_SECRET_DB_KEY = 'auth_secret'

const globalForAuthSecret = globalThis as unknown as {
  __nexusAuthSecret?: string
  __nexusAuthSecretSource?: 'env' | 'db'
}

export type AuthSecretSource = 'env' | 'db' | 'missing'

export function authSecretSource(): AuthSecretSource {
  if (process.env.AUTH_SECRET?.trim()) return 'env'
  return globalForAuthSecret.__nexusAuthSecretSource ?? 'missing'
}

/**
 * Warms the secret resolution (provisioning the DB-stored secret when
 * needed) WITHOUT exposing it — used by /api/health so the reported
 * authSecret state reflects reality instead of "not touched yet".
 */
export async function ensureAuthSecretProvisioned(): Promise<void> {
  try {
    await loadSecret()
  } catch {
    /* health reporting only — the real error surfaces on sign-in */
  }
}

async function loadSecret(): Promise<string> {
  // 1. Explicit environment secret wins everywhere.
  const envSecret = process.env.AUTH_SECRET
  if (envSecret && envSecret.trim() !== '') {
    return envSecret
  }

  // 2. Auto-provisioned DB secret (cached per process after first read).
  if (globalForAuthSecret.__nexusAuthSecret) {
    return globalForAuthSecret.__nexusAuthSecret
  }

  try {
    const existing = await db.appConfig.findUnique({ where: { key: AUTH_SECRET_DB_KEY } })
    if (existing?.value) {
      globalForAuthSecret.__nexusAuthSecret = existing.value
      globalForAuthSecret.__nexusAuthSecretSource = 'db'
      console.warn(
        '[auth] AUTH_SECRET not set in environment — using the auto-provisioned secret stored in the database. Set AUTH_SECRET in your deployment settings to manage it explicitly.'
      )
      return existing.value
    }

    // First boot: generate a 384-bit random secret. The upsert keeps the
    // create race-safe when several serverless instances cold-start at once
    // (first write wins; everyone re-reads the winner afterwards).
    const generated = randomBytes(48).toString('hex')
    await db.appConfig.upsert({
      where: { key: AUTH_SECRET_DB_KEY },
      update: {},
      create: { key: AUTH_SECRET_DB_KEY, value: generated },
    })
    const row = await db.appConfig.findUnique({ where: { key: AUTH_SECRET_DB_KEY } })
    const secret = row?.value ?? generated
    globalForAuthSecret.__nexusAuthSecret = secret
    globalForAuthSecret.__nexusAuthSecretSource = 'db'
    console.warn(
      '[auth] AUTH_SECRET was missing — generated a secure random secret and stored it in the database (AppConfig.auth_secret). Sessions survive across serverless instances. For explicit control set AUTH_SECRET in your deployment settings.'
    )
    return secret
  } catch {
    // 3. No env secret AND the database is unreachable — nothing safe to
    // sign with. Fail loudly with instructions instead of a silent,
    // forgeable fallback.
    throw new Error(
      'Auth secret unavailable: AUTH_SECRET is not set and the database could not be reached to auto-provision one. Set AUTH_SECRET (or fix DATABASE_URL) in your deployment settings.'
    )
  }
}

async function getSecretKey(): Promise<Uint8Array> {
  return new TextEncoder().encode(await loadSecret())
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
    .sign(await getSecretKey())
}

/** Verify a JWT session token and return the user id, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey(), {
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
  const verified = await verifyToken(token)
  if (!verified) return null

  // ── CONSOLE CONTROL HOOK (additive, fail-open) ──────────────────────
  // The admin console can suspend an account (/console → Users). When a
  // suspension flag exists for this user, their session is void effective
  // immediately — the next request from the suspended account is treated
  // as signed-out, and new sign-ins are refused by the same lookup in the
  // signin route. The check is cached for 30s per process, wrapped in
  // try/catch, and returns "no flag" on ANY failure so console storage
  // problems can NEVER take the app's own auth down.
  if (await isUserSuspended(verified.userId)) return null

  return verified
}

/* Suspension lookup shared with the signin route (one cached read). */
const SUSPEND_CACHE_TTL_MS = 30_000
const globalForSuspend = globalThis as unknown as {
  __nexusSuspendCache?: { at: number; map: Map<string, boolean> }
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  const cache = globalForSuspend.__nexusSuspendCache
  if (!cache || Date.now() - cache.at > SUSPEND_CACHE_TTL_MS) {
    const map = new Map<string, boolean>()
    globalForSuspend.__nexusSuspendCache = { at: Date.now(), map }
  }
  const map = globalForSuspend.__nexusSuspendCache!.map
  if (map.has(userId)) return map.get(userId)!
  try {
    const rows = await db.$queryRawUnsafe<{ suspended: boolean }[]>(
      `SELECT "suspended" FROM "ConsoleUserFlag" WHERE "userId" = $1 LIMIT 1`,
      userId
    )
    const suspended = rows.length > 0 && Boolean(rows[0].suspended)
    map.set(userId, suspended)
    return suspended
  } catch {
    // Table not created yet (console never used) or DB hiccup → fail open.
    map.set(userId, false)
    return false
  }
}

/**
 * DB-verified session: the JWT is valid AND the referenced user row still
 * exists. Returns null when either check fails.
 *
 * WHY: session cookies live for 30 days, but the user row can disappear
 * under a valid cookie — e.g. the Supabase schema was re-provisioned after
 * the user signed up. Writing rows with such a stale userId then crashes
 * with `Foreign key constraint violated on ChatSession_userId_fkey`.
 * Callers that STAMP rows with userId must use this instead of getSession
 * so a wiped account degrades to guest/401 instead of a 500.
 */
export async function getVerifiedSession(req: NextRequest): Promise<{ userId: string } | null> {
  const session = await getSession(req)
  if (!session) return null
  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    })
    return user ? session : null
  } catch {
    // DB unreachable — treat as anonymous rather than throwing.
    return null
  }
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

/**
 * GUEST LOCKDOWN guard — signed-in features only.
 *
 * Guests (anonymous visitors) may browse the landing page, sign up/in,
 * and hold a small text-only chat. Everything that costs money or compute
 * (AI engines, image/video/document generation, code sandbox, CLI tools,
 * WhatsApp/email sends, web tools) requires a real account.
 *
 * Usage at the top of a route handler:
 *   const denied = await requireVerifiedSession(req)
 *   if (denied) return denied
 * Returns null when the caller is signed in (and the user row exists).
 */
export async function requireVerifiedSession(req: NextRequest): Promise<NextResponse | null> {
  const session = await getVerifiedSession(req)
  if (session) return null
  return NextResponse.json(
    { error: 'Sign in to use this feature.', code: 'AUTH_REQUIRED' },
    { status: 401 }
  )
}

/**
 * Session-cookie attributes that work everywhere the app is reachable.
 *
 * The sandbox preview panel embeds the app in a third-party iframe. Browsers
 * silently REJECT SameSite=Lax cookies in that context — signup/signin
 * returned 200 yet the session never stuck, so users saw "always an error"
 * and profile updates failed with 401. Over HTTPS (the gateway/preview, or
 * any production deployment) we therefore emit SameSite=None; Secure, which
 * browsers accept inside cross-site iframes. Plain localhost over http keeps
 * the classic first-party Lax cookie.
 */
function sessionCookieAttrs(req?: NextRequest) {
  const forwardedProto = req?.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
  const host = (req?.headers.get('host') ?? '').toLowerCase()
  const isLocalHttp =
    (host === 'localhost' || host.startsWith('localhost:') || host.startsWith('127.0.0.1')) &&
    forwardedProto !== 'https'
  // Third-party-safe (iframe-friendly) whenever we're NOT plain-local http:
  // https deployments + the sandbox gateway (external host, TLS upstream).
  const iframeSafe = !isLocalHttp
  return {
    httpOnly: true,
    sameSite: (iframeSafe ? 'none' : 'lax') as 'none' | 'lax',
    secure: iframeSafe,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  }
}

/** Set the session cookie on a NextResponse (httpOnly, 30-day, iframe-safe). */
export function setSessionCookie(res: NextResponse, token: string, req?: NextRequest): void {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieAttrs(req))
}

/** Clear the session cookie on a NextResponse (same attributes, empty value). */
export function clearSessionCookie(res: NextResponse, req?: NextRequest): void {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieAttrs(req), maxAge: 0 })
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
