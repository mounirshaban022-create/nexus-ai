import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getCliSkillDoc } from '@/lib/cli-skills'

/**
 * GET /api/skills/doc?name=<skill>
 *
 * Full SKILL.md manual for one skill. The resolver accepts both the bare
 * name ("browser") and the full harness name ("cli-anything-browser").
 *
 * Response: { skill: CliSkill, doc: string }  — 404 when the skill is unknown.
 */
export async function GET(req: NextRequest) {
  // Rate limit: 60 reads per minute per client (manuals are large payloads)
  const rl = rateLimit(`skills-doc:${clientKey(req)}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const name = (req.nextUrl.searchParams.get('name') ?? '').trim()
  if (!name || name.length > 200) {
    return NextResponse.json({ error: 'Missing or invalid skill name.' }, { status: 400 })
  }

  try {
    const result = await getCliSkillDoc(name)
    if (!result) {
      return NextResponse.json({ error: 'Skill not found.' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/skills/doc] GET error:', error)
    return NextResponse.json({ error: 'Failed to load skill manual.' }, { status: 500 })
  }
}
