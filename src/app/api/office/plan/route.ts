import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getZAI } from '@/lib/zai'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({ prompt: z.string().min(1).max(2000) })

const PLANNER_PROMPT = `You are an elite document architect creating PREMIUM, executive-grade content. Convert the user's request into a rich structured document plan. Respond with ONLY valid JSON:

{
  "title": "Compelling document title (max 70 chars)",
  "blocks": [
    {"type": "heading", "text": "Executive Summary", "level": 2},
    {"type": "paragraph", "text": "A polished, insightful paragraph written like a McKinsey consultant."},
    {"type": "bullets", "items": ["Specific actionable point with concrete detail", "Another specific point"]},
    {"type": "table", "rows": [["Metric","Q1","Q2","Q3"],["Revenue","$1.2M","$1.8M","$2.4M"]]}
  ]
}

CONTENT QUALITY RULES (critical for premium documents):
1. Write SPECIFIC, CONCRETE content — real numbers, real examples, real metrics. Never generic filler like "It is important to note that...".
2. Include data tables when ANY numbers are involved (financials, metrics, comparisons).
3. Structure: compelling title → Executive Summary heading → 2-3 sentence overview → themed sections with headings → data/bullets → actionable recommendations.
4. Include a "Key Recommendations" or "Next Steps" section at the end.
5. 8-15 blocks total — rich documents, not thin outlines.
6. For presentations: each slide = ONE key message + 3-4 specific supporting points. Include a data slide if numbers exist.
7. LANGUAGE: match the user's request language exactly.

Return ONLY the JSON object.`

/** Repairs common truncation: closes dangling strings/arrays/objects. */
function repairTruncatedJson(input: string): string {
  let s = input
  // Close dangling string
  const quotes = (s.match(/"/g) ?? []).length
  if (quotes % 2 === 1) s += '"'
  // Walk tokens and close open brackets in reverse order
  const stack: string[] = []
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }
  // Remove trailing commas / dangling operators
  s = s.replace(/[,:]\s*$/, '')
  while (stack.length) {
    const open = stack.pop()
    s += open === '{' ? '}' : ']'
  }
  return s
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`office-plan:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many requests. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 })
    }

    const messages = [
      { role: 'system' as const, content: PLANNER_PROMPT },
      { role: 'user' as const, content: parsed.data.prompt },
    ]

    const raw = await smartChat(
      [
        { role: 'assistant', content: PLANNER_PROMPT },
        { role: 'user', content: parsed.data.prompt },
      ],
      { maxTokens: 4000, task: 'documents' }
    )
    plan = tryParse(raw)

    if (!plan) throw new Error('The model returned an invalid plan. Try again.')

    if (!plan.title || !Array.isArray(plan.blocks) || plan.blocks.length === 0) {
      throw new Error('The plan was incomplete. Try again.')
    }

    // Sanitize blocks
    const validTypes = new Set(['heading', 'paragraph', 'bullets', 'table', 'slide'])
    const blocks = plan.blocks
      .filter((b) => {
        const block = b as { type?: string }
        return block && typeof block.type === 'string' && validTypes.has(block.type)
      })
      .slice(0, 40)

    return NextResponse.json({ title: String(plan.title).slice(0, 150), blocks })
  } catch (error) {
    console.error('[api/office/plan] POST error:', error)
    const message = error instanceof Error ? error.message : 'Could not plan the document.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
