import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getCliSkillDoc } from '@/lib/cli-skills'
import { CLOUD_SKILLS, resolveSkillAction } from '@/lib/skill-map'

/**
 * GET /api/skills/doc?name=<skill>
 *
 * Full SKILL.md manual for one skill. The resolver accepts both the bare
 * name ("browser") and the full harness name ("cli-anything-browser").
 * First-party NEXUS cloud skills get a synthesized manual (they have no
 * vendored SKILL.md — they run entirely on free cloud APIs).
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
    // First-party cloud skill → synthesized manual
    const short = name.replace(/^cli-anything-/, '')
    const cloud = CLOUD_SKILLS.find((s) => s.name === name || s.name === short)
    if (cloud) {
      const meta = resolveSkillAction(cloud.name, cloud.category)
      const doc = [
        `# ${cloud.displayName}`,
        '',
        `> ${cloud.badge} · Cloud-native skill — powered by **${cloud.powered}** (free, keyless, nothing to install).`,
        '',
        cloud.description,
        '',
        '## What it does',
        '',
        `- Action: **${meta.label}** ${meta.emoji}`,
        '- Runs entirely in the cloud — no local app, no credentials, no setup.',
        '- Artifacts (images, documents, audio, data) land directly in your chat.',
        '',
        '## Use it in chat',
        '',
        '```',
        `Use the "${cloud.name}" skill to help me: <your task>`,
        '```',
        '',
        'or the short form',
        '',
        '```',
        `/skill ${cloud.name} <your task>`,
        '```',
        '',
        '## Examples',
        '',
        `- /skill ${cloud.name} ${exampleFor(cloud.action)}`,
      ].join('\n')
      return NextResponse.json({
        skill: {
          name: cloud.name,
          displayName: cloud.displayName,
          description: cloud.description,
          category: cloud.category,
        },
        doc,
      })
    }

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

function exampleFor(action: string): string {
  switch (action) {
    case 'translate':
      return 'translate "Good morning, the flight lands at nine" to French'
    case 'weather':
      return "what's the weather in Tokyo this weekend?"
    case 'chart':
      return 'a bar chart of our Q1-Q4 revenue: 120k, 185k, 210k, 275k'
    case 'qr':
      return 'make a QR code for https://example.com/invite'
    case 'password':
      return 'generate 3 strong passwords, 24 characters'
    case 'speak':
      return 'narrate this: The ocean breathed under the silver moon.'
    default:
      return 'research the latest updates and brief me'
  }
}
