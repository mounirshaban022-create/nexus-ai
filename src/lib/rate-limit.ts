/**
 * Simple in-memory sliding-window rate limiter.
 * (OWASP LLM/security best practice: throttle expensive AI endpoints.)
 */

interface Bucket {
  count: number
  reset: number
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets: Map<string, Bucket> | undefined
}

const buckets =
  globalForRateLimit.rateLimitBuckets ?? (globalForRateLimit.rateLimitBuckets = new Map<string, Bucket>())

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Opportunistic cleanup of expired buckets (keeps memory bounded)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.reset < now) buckets.delete(k)
    }
  }

  const existing = buckets.get(key)
  if (!existing || existing.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.reset - now) / 1000)),
    }
  }

  existing.count += 1
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 }
}

/** Extracts a best-effort client identifier from request headers. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'anonymous'
}
