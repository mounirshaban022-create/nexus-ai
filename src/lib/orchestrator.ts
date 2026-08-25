import { AGENCY_AGENTS, AGENCY_DIVISIONS, getAgentMeta } from '@/lib/agency'
import { smartChat } from '@/lib/smart-chat'

/* ------------------------------------------------------------------ */
/* NEXUS Orchestrator — the auto-routing brain.                        */
/*                                                                     */
/* Every user message in an un-pinned conversation is classified       */
/* against the 255-agent Agency catalog and the best specialist       */
/* "takes over" the response. One cheap LLM call (compact catalog      */
/* roster + last messages) returns a slug; unknown/failed responses   */
/* fall back to plain NEXUS so routing can never break a chat.         */
/* ------------------------------------------------------------------ */

export interface RoutingDecision {
  agentSlug: string | null
  agentName: string
  division: string | null
  emoji: string
  color: string
  reason: string
  /** ms spent routing (surfaced for debugging) */
  elapsedMs: number
}

/** A compact one-line roster: "slug — name (division)" — ~10KB total. */
const ROSTER = AGENCY_AGENTS.map((a) => `${a.slug} — ${a.name} (${a.division})`).join('\n')

const DIVISION_LABELS = AGENCY_DIVISIONS.map((d) => `${d.id}=${d.label}`).join(', ')

/** Keyword shortcuts: obvious signals skip the LLM call entirely. */
const KEYWORD_ROUTING: Array<{ test: RegExp; slug: string }> = [
  { test: /\b(generate|create|draw|make|paint)\b[\s\S]{0,40}\b(image|photo|picture|illustration|logo|art)\b|\b(image|photo|picture) (of|for)\b/i, slug: 'design-image-prompt-engineer' },
  { test: /\b(excel|spreadsheet|\.xlsx|worksheet)\b/i, slug: 'finance-financial-analyst' },
  { test: /\b(whatsapp)\b/i, slug: 'marketing-social-media-strategist' },
  { test: /\b(browse|open the (site|website|page)|click (the|on)|type (in|into)|scrape)\b/i, slug: 'engineering-ai-engineer' },
  { test: /\b(code|function|bug|debug|typescript|javascript|python|api|deploy|regex|sql)\b/i, slug: 'engineering-ai-engineer' },
]

/** Trivial small talk never pays the routing latency. */
const SMALL_TALK = /^(hi|hey|hello|yo|sup|hiya|salam|salaam|hola|bonjour|good (morning|afternoon|evening|day)|how are you|how's it going|hows it going|what's up|whats up|thanks|thank you|ty|ok|okay|cool|nice|great|\?|👍)[\s!.,?]*$/i

const SYSTEM_PROMPT = `You are the NEXUS Orchestrator. Your ONLY job: pick the single best specialist agent to answer the user's latest message.

Divisions: ${DIVISION_LABELS}

Agent roster (slug — name (division)):
${ROSTER}

Rules:
- Respond with ONLY one line of JSON: {"slug":"<slug from roster>","reason":"<max 8 words>"}
- Pick the specialist whose domain best matches the TASK in the latest message.
- For general conversation, greetings, small talk, or mixed/general requests → {"slug":null,"reason":"general"} (plain NEXUS handles it).
- If the topic clearly shifted from earlier messages, follow the LATEST message.
- Never invent slugs. Use exactly one from the roster, or null.`

/**
 * Routes a user message to the best Agency specialist.
 * Fast paths: keyword shortcuts for obvious tool-intent messages.
 * Otherwise one bounded LLM call. Always resolves (never throws).
 */
export async function routeMessage(
  message: string,
  history: Array<{ role: string; content: string }> = []
): Promise<RoutingDecision> {
  const started = Date.now()

  const fallback = (): RoutingDecision => ({
    agentSlug: null,
    agentName: 'NEXUS',
    division: null,
    emoji: '◆',
    color: '#f97316',
    reason: 'general',
    elapsedMs: Date.now() - started,
  })

  const trim = message.trim()
  if (!trim) return fallback()

  // Small talk fast-path — never pay LLM latency for "hi"
  if (trim.length <= 40 && SMALL_TALK.test(trim)) return fallback()

  // Keyword fast-path (also covers the case where the LLM pool is down)
  for (const { test, slug } of KEYWORD_ROUTING) {
    if (test.test(trim)) {
      const meta = getAgentMeta(slug)
      if (meta) {
        const division = AGENCY_DIVISIONS.find((d) => d.id === meta.division)
        return {
          agentSlug: slug,
          agentName: meta.name,
          division: meta.division,
          emoji: meta.emoji,
          color: division?.color ?? '#f97316',
          reason: 'fast match',
          elapsedMs: Date.now() - started,
        }
      }
    }
  }

  try {
    const convo = history.slice(-6).map((m) => ({ role: m.role, content: String(m.content).slice(0, 400) }))
    convo.push({ role: 'user', content: trim.slice(0, 1200) })

    const raw = await smartChat(
      [
        { role: 'assistant', content: SYSTEM_PROMPT },
        ...convo,
      ],
      { maxTokens: 120, temperature: 0.1, builtinOnly: true, task: 'fast', timeoutMs: 12_000 }
    )

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return fallback()
    const parsed = JSON.parse(match[0]) as { slug?: string | null; reason?: string }
    const slug = parsed.slug ?? null
    if (!slug) {
      return { ...fallback(), reason: parsed.reason?.slice(0, 60) || 'general', elapsedMs: Date.now() - started }
    }
    const meta = getAgentMeta(slug)
    if (!meta) return fallback()

    const division = AGENCY_DIVISIONS.find((d) => d.id === meta.division)
    return {
      agentSlug: slug,
      agentName: meta.name,
      division: meta.division,
      emoji: meta.emoji,
      color: division?.color ?? '#f97316',
      reason: (parsed.reason || 'best match').slice(0, 80),
      elapsedMs: Date.now() - started,
    }
  } catch (error) {
    console.error('[orchestrator] routing failed, falling back to NEXUS:', error)
    return fallback()
  }
}
