/**
 * NEXUS automation clock — server-side scheduler.
 *
 * Next.js calls register() once per server process. From there we run the
 * social automation tick every 60 seconds so agents keep working even when
 * NOBODY has the app open:
 *
 *   1. Autopilot accounts that are due get a fully agent-made post
 *      (caption via smartChat + visual via the image cascade → publish).
 *   2. Posts the user scheduled earlier ("post this tomorrow at 9") go
 *      out the moment their time arrives.
 *
 * Safe guards: nodejs runtime only (no edge), single instance per process
 * (global flag survives dev HMR), every tick wrapped in try/catch, and a
 * small startup delay so the database is ready first.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const g = globalThis as typeof globalThis & { __nexusAutomationClock?: NodeJS.Timeout }
  if (g.__nexusAutomationClock) return // already ticking (dev HMR re-runs register)

  const TICK_MS = 60_000
  const STARTUP_DELAY_MS = 20_000

  const tick = async () => {
    try {
      const { automationTick } = await import('@/lib/social')
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const report = await automationTick(origin)
      const posts =
        (report.autopilot?.processed ?? 0) + (report.scheduled?.published ?? 0)
      if (posts > 0) {
        console.log(
          `[automation-clock] tick → ${report.autopilot.processed} autopilot post(s), ${report.scheduled.published} scheduled post(s) published`,
        )
      }
    } catch (err) {
      // Never crash the server because of a tick — log and move on.
      console.warn('[automation-clock] tick failed:', err instanceof Error ? err.message : err)
    }
  }

  g.__nexusAutomationClock = setInterval(() => void tick(), TICK_MS)
  // Unref so the interval never keeps the process alive on shutdown.
  g.__nexusAutomationClock.unref?.()
  setTimeout(() => void tick(), STARTUP_DELAY_MS)
  console.log('[automation-clock] NEXUS automation scheduler started (every 60s)')
}
