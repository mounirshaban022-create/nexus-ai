'use client'

/**
 * NEXUS One — the Personality rail.
 *
 * A ChatGPT-connector-style horizontally SCROLLABLE selector that lives
 * right above the composer. Picking a personality PINS it for the
 * conversation: the backend then skips the ~2.5s orchestrator routing
 * LLM call entirely and the specialist answers instantly — that is the
 * speed win ("so the chat can be faster").
 *
 *   Auto            → NEXUS core with automatic specialist takeover
 *   <personality>   → pinned specialist (instant, no routing delay)
 *   All 255         → opens the full Agents directory dialog
 */

import { useEffect, useRef } from 'react'
import { Sparkles, Users, Zap } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { AGENCY_STATS, AGENT_MAP, DIVISION_MAP, tint } from './shared'

/* ------------------------------------------------------------------ */
/* Curated personalities for the rail (the full 255 live in the        */
/* directory — "All 255" opens it). Picked for coverage across every   */
/* division so the rail alone covers the most common asks.             */
/* ------------------------------------------------------------------ */

const RAIL_SLUGS = [
  'design-ui-designer',
  'design-image-prompt-engineer',
  'engineering-ai-engineer',
  'engineering-senior-developer',
  'engineering-prompt-engineer',
  'engineering-technical-writer',
  'marketing-growth-hacker',
  'marketing-seo-specialist',
  'marketing-social-media-strategist',
  'marketing-content-creator',
  'marketing-email-strategist',
  'finance-financial-analyst',
  'product-manager',
  'business-strategist',
  'language-translator',
  'resume-tailor',
  'grant-writer',
  'game-designer',
  'project-manager-senior',
  'sales-deal-strategist',
  'customer-service',
  'support-support-responder',
  'design-ux-researcher',
  'engineering-data-engineer',
]

interface PersonalityRailProps {
  /** The pinned personality slug (null = Auto). */
  selected: string | null
  /** Pin a personality (slug) or return to Auto (null). */
  onSelect: (slug: string | null) => void
  /** Open the full 255-agent directory dialog. */
  onOpenDirectory: () => void
  /** Disable interactions while a reply streams. */
  disabled?: boolean
}

export function PersonalityRail({ selected, onSelect, onOpenDirectory, disabled = false }: PersonalityRailProps) {
  const { t } = useI18n()
  const railRef = useRef<HTMLDivElement>(null)
  // Keep the ACTIVE chip scrolled into view (e.g. after picking from the
  // directory dialog while the rail is scrolled away).
  useEffect(() => {
    if (!selected || !railRef.current) return
    const active = railRef.current.querySelector<HTMLButtonElement>(`[data-slug="${CSS.escape(selected)}"]`)
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selected])

  // Wheel-to-horizontal scroll. Desktop mice have no natural way to scroll a
  // horizontal rail whose scrollbar is hidden by design — a vertical wheel
  // over the rail did nothing, so desktop users could never reach the later
  // personalities. Translate the wheel into horizontal scroll and release the
  // gesture back to the page at either edge (nothing gets trapped).
  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Trackpads send real horizontal deltas — let the browser handle those.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return
      // Normalize line/page delta modes to pixels.
      const dy =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY
      // RTL rails scroll toward negative scrollLeft — mirror the direction.
      const sign = getComputedStyle(el).direction === 'rtl' ? -1 : 1
      const before = el.scrollLeft
      el.scrollLeft = before + sign * dy
      if (el.scrollLeft !== before) {
        e.preventDefault() // consumed — the rail moved
      }
      // else: at an edge — don't preventDefault so the page keeps scrolling.
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const total = AGENCY_STATS.agents

  return (
    <div className="mb-2 flex items-center gap-2" role="group" aria-label={t('personality.label')}>
      {/* Label — names the selector exactly "Personality" */}
      <span className="hidden shrink-0 select-none items-center gap-1.5 ps-1 text-[11px] font-medium text-muted-foreground/80 sm:flex">
        <Sparkles className="h-3 w-3 text-rose-600 dark:text-[#ff8a8d]" aria-hidden />
        {t('personality.label')}
      </span>

      {/* The scrollable chip rail */}
      <div
        ref={railRef}
        className="nx-rail flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth"
      >
        {/* Auto — automatic routing (default) */}
        <button
          type="button"
          data-slug="__auto"
          aria-pressed={selected == null}
          disabled={disabled}
          onClick={() => onSelect(null)}
          title={t('personality.autoDesc')}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            selected == null
              ? 'border-[#ff5a5f]/60 bg-[#ff5a5f]/15 text-foreground shadow-[0_0_0_3px_rgba(255,90,95,0.08)]'
              : 'border-border bg-muted/50 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
          }`}
        >
          <Zap className="h-3 w-3" aria-hidden />
          {t('personality.auto')}
        </button>

        {/* Pinned personality pinned from the DIRECTORY (not in the curated
            rail) — still gets a live chip so the rail always reflects the
            active personality. Deselecting it returns to Auto. */}
        {selected && !RAIL_SLUGS.includes(selected) && AGENT_MAP[selected] ? (() => {
          const agent = AGENT_MAP[selected]
          const division = DIVISION_MAP[agent.division]
          const color = division?.color ?? '#ff5a5f'
          return (
            <button
              key={`pinned-${selected}`}
              type="button"
              data-slug={selected}
              aria-pressed
              disabled={disabled}
              onClick={() => onSelect(null)}
              title={`${agent.name}${division ? ` — ${division.label}` : ''} (${t('personality.pinnedFromDir')})`}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: `${color}99`,
                backgroundColor: tint(color, 0.16),
                boxShadow: `0 0 0 3px ${tint(color, 0.08)}`,
              }}
            >
              <span aria-hidden>{agent.emoji}</span>
              <span className="max-w-[130px] truncate">{agent.name}</span>
            </button>
          )
        })() : null}

        {/* Curated personalities */}
        {RAIL_SLUGS.map((slug) => {
          const agent = AGENT_MAP[slug]
          if (!agent) return null
          const division = DIVISION_MAP[agent.division]
          const color = division?.color ?? '#ff5a5f'
          const active = selected === slug
          return (
            <button
              key={slug}
              type="button"
              data-slug={slug}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(active ? null : slug)}
              title={`${agent.name}${division ? ` — ${division.label}` : ''} · ${agent.vibe}${active ? ` (${t('personality.pinnedInstant')})` : ''}`}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'text-foreground'
                  : 'border-border bg-muted/50 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
              }`}
              style={
                active
                  ? {
                      borderColor: `${color}99`,
                      backgroundColor: tint(color, 0.16),
                      boxShadow: `0 0 0 3px ${tint(color, 0.08)}`,
                    }
                  : undefined
              }
            >
              <span aria-hidden>{agent.emoji}</span>
              <span className="max-w-[130px] truncate">{agent.name}</span>
            </button>
          )
        })}

        {/* All 255 → directory */}
        <button
          type="button"
          onClick={onOpenDirectory}
          disabled={disabled}
          title={t('agents.specialistsCount', { count: String(total) })}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground/80 transition hover:border-[#ff5a5f]/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Users className="h-3 w-3" aria-hidden />
          {t('personality.allAgents', { count: String(total) })}
        </button>
      </div>
    </div>
  )
}
