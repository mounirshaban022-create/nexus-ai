/**
 * Canonical app-origin resolution.
 *
 * AUDIT FIX (code-quality §6/§8): this logic was implemented five times with
 * drifting semantics — the social publishing helpers fell back to a bare
 * `http://localhost:3000` default with no Vercel awareness, which silently
 * broke platform media fetches and server-side self-invocation on serverless.
 * One helper, two contexts:
 *
 *  - appOriginFromEnv()   → no request in scope (cron ticks, instrumentation,
 *                           media URLs handed to platforms). Resolution:
 *                           APP_URL / NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
 *  - appOriginFromRequest() → request in scope. The request's own host is the
 *                           most reliable origin everywhere (sandbox gateway,
 *                           Vercel previews, production domain); env overrides
 *                           are only a fallback — a stale APP_URL once made
 *                           every tool self-fetch an HTML 404 instead of JSON.
 */

interface MinimalRequest {
  headers: { get(name: string): string | null }
}

function localhostOrigin(): string {
  return `http://localhost:${process.env.PORT || 3000}`
}

/** Env-derived canonical origin — for callers with no request context. */
export function appOriginFromEnv(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured && configured.startsWith('http')) return configured.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return localhostOrigin()
}

/** Request-derived origin — for callers that self-fetch their own API. */
export function appOriginFromRequest(req: MinimalRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) {
    const proto =
      req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return appOriginFromEnv()
}
