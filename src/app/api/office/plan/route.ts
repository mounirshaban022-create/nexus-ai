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

/**
 * Parse the LLM's JSON plan response. Strips markdown code fences,
 * extracts the first balanced {...} object, attempts repair on truncation
 * and common LLM mistakes. Falls back to a lenient regex extractor that
 * can recover title + blocks from even severely malformed JSON.
 */
function tryParse(raw: string): { title?: string; blocks?: Array<{ type?: string }> } | null {
  if (!raw || typeof raw !== 'string') return null
  // Strip markdown code fences
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  // Balanced-brace extraction (string-aware)
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  let jsonStr: string
  if (end === -1) {
    // Truncated — try repair
    jsonStr = repairTruncatedJson(cleaned.slice(start))
  } else {
    jsonStr = cleaned.slice(start, end + 1)
  }
  // First attempt: strict parse
  try {
    return JSON.parse(jsonStr)
  } catch {
    // fall through to deeper repair
  }
  // Second attempt: fix common LLM mistakes (misplaced colons, missing commas).
  const repaired = repairCommonLlmMistakes(jsonStr)
  try {
    return JSON.parse(repaired)
  } catch {
    // fall through to lenient extraction
  }
  // Third attempt: lenient regex extraction — recovers title + blocks even
  // from severely malformed JSON (unescaped quotes, wrong delimiters, etc.).
  const lenient = lenientExtractPlan(cleaned.slice(start))
  return lenient
}

/**
 * Lenient extractor — recovers {title, blocks} from malformed JSON by using
 * regex to find each piece individually. Handles:
 * - Unescaped quotes inside string values (e.g., "He said "hi" there")
 * - Misplaced colons (e.g., {"type": "paragraph": "text"})
 * - Truncated JSON
 * - Missing commas
 *
 * Strategy: scan for "type":"(heading|paragraph|bullets|table|slide)" markers,
 * then for each block, extract the associated fields via targeted regexes.
 */
function lenientExtractPlan(
  raw: string
): { title?: string; blocks?: Array<Record<string, unknown>> } | null {
  // Extract title (first "title":"..." match that isn't a slide title)
  const titleMatch = raw.match(/"title"\s*(?::|")\s*"\s*([^"]{1,150})/)
  const title = titleMatch?.[1]?.trim()

  const blocks: Array<Record<string, unknown>> = []
  // Find all "type":"..." occurrences that start a block
  const typeRegex = /"type"\s*:\s*"(heading|paragraph|bullets|table|slide)"/g
  let m: RegExpExecArray | null
  while ((m = typeRegex.exec(raw)) !== null) {
    const blockType = m[1]
    // Grab a window of text after this type marker (up to the next "type" or end)
    const after = raw.slice(m.index + m[0].length)
    const nextType = after.search(/"type"\s*:\s*"(?:heading|paragraph|bullets|table|slide)"/)
    const window = nextType === -1 ? after.slice(0, 2000) : after.slice(0, nextType)

    const block: Record<string, unknown> = { type: blockType }

    // Extract "text":"..." (for heading and paragraph blocks)
    const textMatch = window.match(/"text"\s*:\s*"((?:[^"\\]|\\.){1,500})"/)
    if (textMatch) block.text = textMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')

    // Extract "level":N (for heading blocks)
    const levelMatch = window.match(/"level"\s*:\s*(\d+)/)
    if (levelMatch) block.level = parseInt(levelMatch[1], 10)

    // Extract "items":["...","..."] (for bullets blocks)
    const itemsMatch = window.match(/"items"\s*:\s*\[([\s\S]*?)\]/)
    if (itemsMatch) {
      const itemsStr = itemsMatch[1]
      const items: string[] = []
      const itemRegex = /"((?:[^"\\]|\\.)*)"/g
      let im: RegExpExecArray | null
      while ((im = itemRegex.exec(itemsStr)) !== null) {
        items.push(im[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'))
      }
      if (items.length > 0) block.items = items
    }

    // Extract "title":"..." (for slide blocks)
    if (blockType === 'slide') {
      const slideTitleMatch = window.match(/"title"\s*:\s*"((?:[^"\\]|\\.){1,200})"/)
      if (slideTitleMatch) block.title = slideTitleMatch[1].replace(/\\"/g, '"')
      const bulletsMatch = window.match(/"bullets"\s*:\s*\[([\s\S]*?)\]/)
      if (bulletsMatch) {
        const bullets: string[] = []
        const bRegex = /"((?:[^"\\]|\\.)*)"/g
        let bm: RegExpExecArray | null
        while ((bm = bRegex.exec(bulletsMatch[1])) !== null) {
          bullets.push(bm[1].replace(/\\"/g, '"'))
        }
        block.bullets = bullets
      }
    }

    // Extract "rows":[["...","..."],["..."]] (for table blocks)
    if (blockType === 'table') {
      const rowsMatch = window.match(/"rows"\s*:\s*\[([\s\S]*?)\]\s*(?:\]|,|\})/)
      if (rowsMatch) {
        const rowsStr = rowsMatch[1]
        const rows: string[][] = []
        // Match each inner array
        const innerArrayRegex = /\[([\s\S]*?)\]/g
        let iam: RegExpExecArray | null
        while ((iam = innerArrayRegex.exec(rowsStr)) !== null) {
          const cells: string[] = []
          const cellRegex = /"((?:[^"\\]|\\.)*)"/g
          let cm: RegExpExecArray | null
          while ((cm = cellRegex.exec(iam[1])) !== null) {
            cells.push(cm[1].replace(/\\"/g, '"'))
          }
          if (cells.length > 0) rows.push(cells)
        }
        if (rows.length > 0) block.rows = rows
      }
    }

    // Only keep blocks that have at least one content field
    if (block.text || block.items || block.title || block.rows) {
      blocks.push(block)
    }
  }

  if (!title && blocks.length === 0) return null
  return { title: title ?? 'Untitled', blocks }
}

/**
 * Repairs common LLM JSON mistakes:
 * 1. Misplaced colons: `"value": "key": "value2"` (should be `"value", "key": "value2"`)
 *    — the LLM used `:` instead of `,` between object properties.
 * 2. Missing commas between properties: `"value" "key":` → `"value", "key":`.
 * 3. Trailing commas before } or ]: `{"a":1,}` → `{"a":1}`.
 *
 * Uses a tokenizer + state machine so we never modify string contents.
 * State: 'expectKey' | 'expectColon' | 'expectValue' | 'afterValue'
 *   expectKey   — just saw { or , (in object); next " starts a key
 *   expectColon — just finished a key string; next must be :
 *   expectValue — just saw : (or [ or , in array); next " starts a value
 *   afterValue  — just finished a value; next must be , or } or ]
 */
function repairCommonLlmMistakes(input: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escaped = false
  // Track context: 'object' when inside {…}, 'array' when inside […]
  // We use a stack so nested structures are handled correctly.
  const stack: ('object' | 'array')[] = []
  let state: 'expectKey' | 'expectColon' | 'expectValue' | 'afterValue' = 'expectKey'

  const currentContext = (): 'object' | 'array' | null =>
    stack.length > 0 ? stack[stack.length - 1] : null

  const isValueStart = (ch: string) => /["\d\-{[tfn]/.test(ch)

  const insertCommaIfNeeded = () => {
    const ctx = currentContext()
    if (ctx === null) return
    // In 'afterValue' state, we need a comma before the next element.
    // In 'expectKey' state inside an object after a comma, no comma needed.
    // In 'expectValue' state (after colon), no comma needed.
    if (state !== 'afterValue') return
    const trimmed = out.replace(/\s+$/, '')
    const lastCh = trimmed[trimmed.length - 1]
    if (lastCh && /["}\]\dfln]/.test(lastCh)) {
      out = trimmed + ','
      // After inserting a comma, we're now expecting the next key (object)
      // or next value (array) — same as if we'd seen a real comma.
      state = ctx === 'array' ? 'expectValue' : 'expectKey'
    }
  }

  while (i < input.length) {
    const ch = input[i]

    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        inString = false
        // The string just ended. Update state based on what we were expecting.
        if (state === 'expectKey') state = 'expectColon'
        else if (state === 'expectValue') state = 'afterValue'
      }
      i++
      continue
    }

    if (ch === '"') {
      // Starting a string. Check if we need a comma first.
      insertCommaIfNeeded()
      inString = true
      out += ch
      i++
      continue
    }

    if (/\s/.test(ch)) {
      out += ch
      i++
      continue
    }

    if (ch === ':') {
      // A colon. In 'expectColon' state, it's valid (key → value). In
      // 'afterValue' state, the LLM misplaced a colon (should be a comma).
      if (state === 'afterValue') {
        // Misplaced colon — replace with comma.
        out += ','
        state = 'expectKey'
      } else {
        out += ch
        state = 'expectValue'
      }
      i++
      continue
    }

    if (ch === ',') {
      out += ch
      const ctx = currentContext()
      state = ctx === 'array' ? 'expectValue' : 'expectKey'
      i++
      continue
    }

    if (ch === '{' || ch === '[') {
      // Starting a nested object/array. If we're in 'afterValue', insert comma.
      insertCommaIfNeeded()
      stack.push(ch === '{' ? 'object' : 'array')
      out += ch
      state = ch === '{' ? 'expectKey' : 'expectValue'
      i++
      continue
    }

    if (ch === '}' || ch === ']') {
      out += ch
      stack.pop()
      state = 'afterValue'
      i++
      continue
    }

    // Number, true, false, null, or other value char
    if (isValueStart(ch)) {
      insertCommaIfNeeded()
      out += ch
      state = 'afterValue'
      i++
      continue
    }

    // Any other char (e.g., inside a number) — just copy.
    out += ch
    i++
  }

  // Fix trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, '$1')
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

    const raw = await smartChat(
      [
        { role: 'assistant', content: PLANNER_PROMPT },
        { role: 'user', content: parsed.data.prompt },
      ],
      { maxTokens: 6000, task: 'documents' }
    )
    const plan = tryParse(raw)

    if (!plan) {
      throw new Error('The model returned an invalid plan. Try again.')
    }

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
