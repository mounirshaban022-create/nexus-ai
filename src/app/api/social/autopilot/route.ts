import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { runAutopilotTick } from '@/lib/social'

export const maxDuration = 300

/* ------------------------------------------------------------------ */
/* POST — run the autopilot tick NOW ("Run autopilot" button, or an    */
/* external cron hitting this endpoint). Processes every due account.  */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-autopilot:${clientKey(req)}`, 6, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Autopilot already ran recently — wait a minute.' }, { status: 429 })

  try {
    const origin = req.headers.get('origin') || new URL(req.url).origin
    const report = await runAutopilotTick(session.userId, origin, 5)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[api/social/autopilot] POST error:', error)
    return NextResponse.json({ error: 'Autopilot tick failed.' }, { status: 500 })
  }
}
