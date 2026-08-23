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
