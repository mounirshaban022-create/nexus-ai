import { NextResponse } from 'next/server'
import { AGENCY_STATS, listDivisions, listAgents } from '@/lib/agency'

/**
 * GET /api/agency/catalog
 * The full Agency roster: 17 divisions + all specialist agents (metadata
 * only — persona prompts are never exposed; they are injected server-side
 * into the chat system prompt).
 */
export async function GET() {
  return NextResponse.json(
    {
      stats: AGENCY_STATS,
      divisions: listDivisions(),
      agents: listAgents(),
    },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } }
  )
}
