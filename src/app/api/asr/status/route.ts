import { NextResponse } from 'next/server'
import { hfConfigured } from '@/lib/hf-ai'
import { zaiConfigured } from '@/lib/zai'

export const dynamic = 'force-dynamic'

/**
 * Which server-side speech engines exist in THIS deployment.
 *
 * The voice UI calls this once when it opens. When NEITHER engine is
 * configured (HF_TOKEN missing on the deployment + the Z.ai SDK
 * unreachable, e.g. on Vercel), every server transcription attempt is
 * doomed — so the client pre-warms its on-device Whisper model at t=0
 * (the ~45 MB download overlaps the user's first sentence) instead of
 * discovering the failure after a dead round-trip ("voice doesn't hear
 * me" with a long silent delay).
 *
 * Cheap + safe: when HF is configured the Z.ai check is skipped entirely.
 * The Z.ai check itself is raced against a 2 s timeout so a broken SDK
 * load can never stall the voice UI open.
 */
export async function GET() {
  const withTimeout = (p: Promise<boolean>, ms: number): Promise<boolean> =>
    Promise.race([
      p.catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ])

  const hf = hfConfigured()
  // Groq Whisper (GROQ_API_KEY) is a second server-side engine — counted
  // toward serverAsr so the voice UI doesn't needlessly pre-warm the
  // on-device model when a server engine is available.
  const groq = (process.env.GROQ_API_KEY || '').trim().length > 0
  const zai = hf ? false : await withTimeout(zaiConfigured(), 2000)

  return NextResponse.json(
    { hf, groq, zai, serverAsr: hf || groq || zai },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
