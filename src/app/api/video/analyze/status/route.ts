import { NextResponse } from 'next/server'
import { zaiConfigured } from '@/lib/zai'

export const dynamic = 'force-dynamic'

/**
 * GET — capability probe for Video Intelligence.
 * The client calls this once to decide whether to enable the feature
 * ('sandbox' — Z.ai gateway present) or render a "configure engine" hint
 * ('unavailable'). No auth: leaks nothing but a boolean.
 */
export async function GET() {
  const ok = await zaiConfigured()
  return NextResponse.json({ ok, mode: ok ? 'sandbox' : 'unavailable' })
}
