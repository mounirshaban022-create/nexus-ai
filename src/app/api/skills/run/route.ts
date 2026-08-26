import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { listCliSkills } from '@/lib/cli-skills'
import { runSkillAction, resolveSkillAction } from '@/lib/skill-actions'

export const maxDuration = 120

const requestSchema = z.object({
  skill: z.string().min(2).max(120),
  task: z.string().min(1).max(2000),
})

/**
 * POST /api/skills/run — executes a catalog skill's REAL cloud action.
 * { skill: "cli-anything-blender" | "blender", task: "a low-poly fox" }
 * → { ok, summary, attachment } (attachment = chat artifact payload).
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`skill-run:${clientKey(req)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Skill limit reached. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const parsed = requestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'skill (2-120 chars) and task (1-2000 chars) are required.' }, { status: 400 })
  }

  try {
    const { skill, task } = parsed.data
    // Resolve against the catalog (accept full or short names).
    const catalog = await listCliSkills()
    const short = skill.replace(/^cli-anything-/, '')
    const entry =
      catalog.find((s) => s.name === skill) ??
      catalog.find((s) => s.name === `cli-anything-${short}`) ??
      catalog.find((s) => s.name.replace(/^cli-anything-/, '') === short) ??
      null

    const meta = resolveSkillAction(skill, entry?.category)
    const result = await runSkillAction(
      req,
      skill,
      entry?.category,
      task,
      entry?.displayName ?? short
    )
    return NextResponse.json({
      ...result,
      action: meta.kind,
      actionLabel: meta.label,
      actionEmoji: meta.emoji,
    })
  } catch (error) {
    console.error('[api/skills/run] POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Skill run failed.' },
      { status: 500 }
    )
  }
}
