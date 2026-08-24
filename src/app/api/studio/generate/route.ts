import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/**
 * STUDIO AI ENGINE — powers the unified NEXUS Studio (BlockNote docs +
 * Excalidraw canvas). Replaces the old office/documents planning routes.
 *
 * Actions:
 *   - write      : prompt → full document in Markdown
 *   - enhance    : rewrite the given text better
 *   - summarize  : condense the given text
 *   - translate  : translate the given text
 *   - continue   : continue writing from the given text
 *   - canvas_plan: prompt → an Excalidraw scene description the client
 *                  renders as starter elements (shapes + labeled text)
 *
 * All actions run through smartChat — the provider chain with anonymous
 * free-LLM fallbacks — so Studio keeps working during Z.ai 429 storms.
 */

export const maxDuration = 120

const requestSchema = z.object({
  action: z.enum(['write', 'enhance', 'summarize', 'translate', 'continue', 'canvas_plan']),
  prompt: z.string().min(1).max(4000),
  /** The text to enhance/summarize/translate/continue (optional). */
  text: z.string().max(60000).optional(),
  /** Target language for translate. */
  language: z.string().max(40).optional(),
  /** Document kind hint for write (report, letter, blog, deck...). */
  kind: z.string().max(60).optional(),
})

const SYSTEM_PROMPTS: Record<string, string> = {
  write:
    'You are NEXUS Studio\'s document writer. Produce a complete, well-structured document in Markdown based on the user\'s request. ' +
    'Use # for the document title, ## for sections. Include rich content: headings, paragraphs, bullet lists, tables when useful, and ' +
    'bold for key terms. Aim for a polished, ready-to-use document — not an outline unless asked. Respond ONLY with the Markdown document, no commentary.',
  enhance:
    'You are NEXUS Studio\'s editor. Rewrite the given text to be clearer, more engaging, and better structured. Preserve the meaning, ' +
    'tone intent, and Markdown formatting (# headings, lists, tables). Respond ONLY with the improved Markdown.',
  summarize:
    'You are NEXUS Studio\'s summarizer. Condense the given text into a tight Markdown summary with a "## Summary" heading, key bullets, ' +
    'and a one-line takeaway. Respond ONLY with the Markdown summary.',
  translate:
    'You are NEXUS Studio\'s translator. Translate the given text into the target language. Preserve Markdown formatting exactly. ' +
    'Respond ONLY with the translated Markdown.',
  continue:
    'You are NEXUS Studio\'s co-writer. Continue the given text naturally, adding roughly 2-4 paragraphs that flow from where it stops. ' +
    'Match the voice and formatting. Respond ONLY with the continuation Markdown (do NOT repeat the given text).',
  canvas_plan:
    'You are NEXUS Studio\'s canvas designer. The user describes a visual they want on a whiteboard/canvas. ' +
    'Respond ONLY with a JSON array of Excalidraw-style starter elements. Each element is an object with: ' +
    '"type": "rectangle" | "ellipse" | "diamond" | "arrow" | "text", ' +
    '"text" (for text elements, short label), "x", "y" (numbers, canvas coords 0-1500), "width", "height" (numbers 80-400), ' +
    'and optionally "points" for arrows as [[x,y],[x,y]] relative offsets. ' +
    'Create a sensible layout: title text at top, 3-6 shape/text groups arranged left-to-right or as a flow with arrows connecting them. ' +
    'Keep text labels under 6 words. Respond ONLY with the JSON array, no fences, no prose.',
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`studio:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Studio limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid studio request.' }, { status: 400 })
    }
    const { action, prompt, text, language, kind } = parsed.data

    const system = SYSTEM_PROMPTS[action]
    let userContent = ''

    switch (action) {
      case 'write':
        userContent = `${kind ? `Document kind: ${kind}\n\n` : ''}${prompt}`
        break
      case 'translate':
        userContent = `Target language: ${language || 'English'}\n\nText to translate:\n\n${text ?? prompt}`
        break
      case 'canvas_plan':
        userContent = prompt
        break
      default:
        userContent = `${text ?? prompt}`
    }

    const content = await smartChat(
      [
        { role: 'assistant', content: system },
        { role: 'user', content: userContent.slice(0, 60000) },
      ],
      { maxTokens: action === 'canvas_plan' ? 1200 : 4000, task: 'documents' }
    )

    // canvas_plan: extract the JSON array (models sometimes wrap in fences)
    if (action === 'canvas_plan') {
      const cleaned = content.replace(/```(?:json)?/g, '').trim()
      const start = cleaned.indexOf('[')
      const end = cleaned.lastIndexOf(']')
      if (start >= 0 && end > start) {
        try {
          const elements = JSON.parse(cleaned.slice(start, end + 1))
          if (Array.isArray(elements)) {
            return NextResponse.json({ elements })
          }
        } catch {
          /* fall through to raw */
        }
      }
      return NextResponse.json({ elements: [], raw: content.slice(0, 2000) })
    }

    // Strip markdown fences some models wrap around documents
    const cleaned = content
      .replace(/^```(?:markdown|md)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    return NextResponse.json({ markdown: cleaned })
  } catch (error) {
    console.error('[api/studio/generate] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Studio AI failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
