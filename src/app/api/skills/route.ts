import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { listAllSkills, searchCliSkills } from '@/lib/cli-skills'

/**
 * GET /api/skills?q=<query>&category=<cat>
 *
 * Catalog of the 7 first-party NEXUS cloud skills + the 79 vendored
 * CLI-Anything agent skills.
 *  - q        → keyword search via searchCliSkills (name/display/description)
 *  - category → exact category filter applied after the search
 *
 * Response: { skills: CliSkill[], total: number, categories: string[] }
 *  - skills     = the filtered result set
 *  - total      = size of the FULL catalog (for count badges)
 *  - categories = every distinct category in the catalog, sorted
 */
export async function GET(req: NextRequest) {
  // Rate limit: 60 reads per minute per client (matches other catalog routes)
  const rl = rateLimit(`skills:${clientKey(req)}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  try {
    const params = req.nextUrl.searchParams
    const q = (params.get('q') ?? '').trim()
    const category = (params.get('category') ?? '').trim().toLowerCase()

    const all = await listAllSkills()
    const categories = Array.from(new Set(all.map((s) => s.category))).sort()

    // searchCliSkills defaults to limit=10 (agent-facing); the browser wants
    // every match, so request the whole catalog's worth.
    let skills = q ? await searchCliSkills(q, all.length || 500) : all
    if (category) {
      skills = skills.filter((s) => s.category.toLowerCase() === category)
    }

    return NextResponse.json({ skills, total: all.length, categories })
  } catch (error) {
    console.error('[api/skills] GET error:', error)
    return NextResponse.json({ error: 'Failed to load skills.' }, { status: 500 })
  }
}
