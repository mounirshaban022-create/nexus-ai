import ZAI from 'z-ai-web-dev-sdk'

const globalForZAI = globalThis as unknown as {
  zai: Awaited<ReturnType<typeof ZAI.create>> | undefined
}

/**
 * Shared, lazily-initialized ZAI SDK singleton.
 * MUST only be imported from server-side code (API routes / server components).
 */
export async function getZAI() {
  if (!globalForZAI.zai) {
    globalForZAI.zai = await ZAI.create()
  }
  return globalForZAI.zai
}

/* ------------------------------------------------------------------ */
/* Z.ai CIRCUIT BREAKER — skips the rate-limited endpoint for a while  */
/* after failures so requests don't pay the failed-attempt latency on  */
/* every turn. When Z.ai 429s, each request would otherwise waste a    */
/* round-trip before falling to the anonymous chain.                   */
/* ------------------------------------------------------------------ */

const globalForBreaker = globalThis as unknown as {
  zaiCooldownUntil?: number
  zaiConsecutiveFails?: number
}

/** Cooldown grows: 30s → 1m → 2m → 5m (capped) after consecutive failures. */
const COOLDOWN_STEPS = [30_000, 60_000, 120_000, 300_000]

export function zaiOnCooldown(): boolean {
  return Date.now() < (globalForBreaker.zaiCooldownUntil ?? 0)
}

export function markZaiFailure(): void {
  const fails = (globalForBreaker.zaiConsecutiveFails ?? 0) + 1
  globalForBreaker.zaiConsecutiveFails = fails
  const cooldown = COOLDOWN_STEPS[Math.min(fails - 1, COOLDOWN_STEPS.length - 1)]
  globalForBreaker.zaiCooldownUntil = Date.now() + cooldown
  console.error(`[zai-breaker] failure #${fails} — skipping Z.ai for ${cooldown / 1000}s`)
}

export function markZaiSuccess(): void {
  globalForBreaker.zaiConsecutiveFails = 0
  globalForBreaker.zaiCooldownUntil = 0
}
