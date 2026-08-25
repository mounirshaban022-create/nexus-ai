import { NextRequest, NextResponse } from 'next/server'
import { getAgentMeta, getDivision } from '@/lib/agency'

/**
 * GET /api/agency/agent/[slug]
 * Public metadata for one specialist agent. Persona prompts stay
 * server-side — the client only needs identity (name, emoji, division,
 * description, vibe) to render the profile card.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const meta = getAgentMeta(slug)
  if (!meta) {
    return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  }
  const division = getDivision(meta.division)
  return NextResponse.json({
    agent: meta,
    division: division ?? null,
  })
}
