import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/voice/call-status — liveness probe for the voice-call feature.
 *
 * Deliberately minimal (no auth, no deps): the client pings this to confirm
 * the Next.js backend is reachable through the gateway before/while opening
 * the real socket connection to the voice-call mini-service — the socket
 * handshake itself is the actual availability test.
 */
export async function GET() {
  return NextResponse.json({ ok: true })
}
