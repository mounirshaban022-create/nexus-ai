'use client'

/**
 * NEXUS One — The Agency directory (255 specialists).
 *
 * TWO exports share one directory body implementation:
 *  - AgentsDirectory       (modal, opened from the chat header)
 *  - AgentsDirectoryPage   (full view, opened from the sidebar)
 *
 * Premium dark UI: display-font header, fuzzy-ish client search over
 * name + description + division label + vibe, division filter rail with
 * brand-colored chips, glow agent cards with hover-revealed actions
 * (always visible on touch), pinned banner, 60-per-page pagination.
 */

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Hexagon, MessageCircle, Pin, PinOff, Search, X } from 'lucide-react'
import {
  AGENCY_AGENTS,
  AGENCY_DIVISIONS,
  AGENT_MAP,
  DIVISION_MAP,
  DivisionIcon,
  tint,
  type AgentMeta,
  type DivisionMeta,
} from './shared'

/** Agents rendered initially — "Show more" appends the same amount. */
const PAGE_SIZE = 60

export interface AgentsDirectoryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pinnedSlug: string | null
  onPin: (slug: string) => void
  onUnpin: () => void
  onNewChatWith: (slug: string) => void
}

export function AgentsDirectory(props: AgentsDirectoryProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88vh] flex-col overflow-hidden border-white/10 bg-[#0c0c0e] p-0 text-zinc-100 sm:max-w-4xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>The Agency — specialists directory</DialogTitle>
        </DialogHeader>
        <DirectoryBody {...props} onClose={() => props.onOpenChange(false)} inModal />
      </DialogContent>
    </Dialog>
  )
}

export interface AgentsDirectoryPageProps {
  pinnedSlug: string | null
  onPin: (slug: string) => void
  onUnpin: () => void
  onNewChatWith: (slug: string) => void
  onBack: () => void
}

export function AgentsDirectoryPage(props: AgentsDirectoryPageProps) {
  return (
    <div className="nx-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl">
        <DirectoryBody {...props} onClose={props.onBack} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared directory body                                               */
/* ------------------------------------------------------------------ */

function DirectoryBody({
  pinnedSlug,
  onPin,
  onUnpin,
  onNewChatWith,
  onClose,
  inModal = false,
}: {
  pinnedSlug: string | null
  onPin: (slug: string) => void
  onUnpin: () => void
  onNewChatWith: (slug: string) => void
  onClose: () => void
  inModal?: boolean
}) {
  const [query, setQuery] = useState('')
  const [division, setDivision] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return AGENCY_AGENTS.filter((a) => {
      if (division && a.division !== division) return false
      if (tokens.length === 0) return true
      const divisionLabel = DIVISION_MAP[a.division]?.label ?? ''
      const haystack = `${a.name} ${a.description} ${divisionLabel} ${a.vibe}`.toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
  }, [query, division])

  const visible = filtered.slice(0, visibleCount)
  const pinnedAgent = pinnedSlug ? AGENT_MAP[pinnedSlug] : undefined
  const pinnedColor = pinnedAgent
    ? (DIVISION_MAP[pinnedAgent.division]?.color ?? '#ff5a5f')
    : '#ff5a5f'

  const applyQuery = (q: string) => {
    setQuery(q)
    setVisibleCount(PAGE_SIZE)
  }
  const applyDivision = (d: string | null) => {
    setDivision(d)
    setVisibleCount(PAGE_SIZE)
  }
  const clearFilters = () => {
    setQuery('')
    setDivision(null)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {!inModal && (
            <button
              onClick={onClose}
              aria-label="Back to chat"
              className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="font-display truncate text-xl font-bold tracking-tight">The Agency</h2>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-400">
            {filtered.length === AGENCY_AGENTS.length
              ? `${AGENCY_AGENTS.length} specialists`
              : `${filtered.length} of ${AGENCY_AGENTS.length}`}
          </span>
        </div>
        {inModal && (
          <button
            onClick={onClose}
            aria-label="Close directory"
            className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Search + division rail */}
      <div className="border-b border-white/8 px-5 py-4">
        <div className="flex h-11 items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3.5 transition focus-within:border-[#ff5a5f]/45 focus-within:shadow-[0_0_0_4px_rgba(255,90,95,0.08)]">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => applyQuery(e.target.value)}
            placeholder="Search specialists — try “frontend” or “logo”…"
            aria-label="Search specialists"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          {query && (
            <button
              onClick={() => applyQuery('')}
              aria-label="Clear search"
              className="rounded-lg p-1 text-zinc-500 transition hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="nx-rail -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by division">
          <DivisionChip
            active={division === null}
            label="All"
            count={AGENCY_AGENTS.length}
            onClick={() => applyDivision(null)}
          />
          {AGENCY_DIVISIONS.map((d) => (
            <DivisionChip
              key={d.id}
              active={division === d.id}
              label={d.label}
              count={d.count}
              color={d.color}
              division={d}
              onClick={() => applyDivision(division === d.id ? null : d.id)}
            />
          ))}
        </div>
      </div>

      {/* Pinned banner */}
      {pinnedAgent && (
        <div
          className="flex items-center gap-3 border-b border-white/8 px-5 py-3"
          style={{
            background: `linear-gradient(90deg, ${tint(pinnedColor, 0.16)} 0%, transparent 80%)`,
          }}
        >
          <span className="text-lg" aria-hidden>
            {pinnedAgent.emoji}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
            Pinned: <span className="font-semibold text-zinc-100">{pinnedAgent.name}</span> —
            auto-routing paused for this chat.
          </p>
          <button
            onClick={onUnpin}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#ff5a5f]/35 px-2.5 py-1.5 text-xs font-medium text-[#ff8a8d] transition hover:bg-[#ff5a5f]/10"
          >
            <PinOff className="h-3.5 w-3.5" />
            Unpin
          </button>
        </div>
      )}

      {/* Agent grid */}
      <div className={inModal ? 'nx-scroll min-h-0 flex-1 overflow-y-auto' : ''}>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <AgentCard
              key={a.slug}
              agent={a}
              pinned={pinnedSlug === a.slug}
              onPin={onPin}
              onUnpin={onUnpin}
              onNewChatWith={onNewChatWith}
            />
          ))}

          {filtered.length > visible.length && (
            <div className="col-span-full flex justify-center pb-2">
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-full border border-white/15 px-5 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:bg-white/5"
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more ·{' '}
                {filtered.length - visible.length} remaining
              </button>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-3 py-14 text-center">
              <Hexagon className="h-9 w-9 text-zinc-600" />
              <div>
                <p className="text-sm font-medium text-zinc-300">No specialists match</p>
                <p className="mt-1 text-xs text-zinc-500">Try a different search or division.</p>
              </div>
              <button
                onClick={clearFilters}
                className="nx-gradient-surface rounded-full px-4 py-1.5 text-xs font-semibold"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Division filter chip                                                */
/* ------------------------------------------------------------------ */

function DivisionChip({
  active,
  label,
  count,
  color,
  division,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  color?: string
  division?: DivisionMeta
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'text-white'
          : 'border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
      }`}
      style={
        active
          ? color
            ? { background: tint(color, 0.2), borderColor: tint(color, 0.6) }
            : { background: 'rgba(255,90,95,0.16)', borderColor: 'rgba(255,90,95,0.55)' }
          : undefined
      }
    >
      {division ? (
        <DivisionIcon division={division} className="h-3.5 w-3.5" />
      ) : (
        <Hexagon className="h-3.5 w-3.5" style={{ color: active ? '#ff5a5f' : '#71717a' }} />
      )}
      {label}
      <span className="text-[10px] font-semibold text-zinc-500">{count}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Agent card                                                          */
/* ------------------------------------------------------------------ */

function AgentCard({
  agent,
  pinned,
  onPin,
  onUnpin,
  onNewChatWith,
}: {
  agent: AgentMeta
  pinned: boolean
  onPin: (slug: string) => void
  onUnpin: () => void
  onNewChatWith: (slug: string) => void
}) {
  const division = DIVISION_MAP[agent.division]
  const color = division?.color ?? '#ff5a5f'

  return (
    <article className="nx-glow-card group flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: tint(color, 0.14), border: `1px solid ${tint(color, 0.3)}` }}
          aria-hidden
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{agent.name}</h3>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide" style={{ color }}>
            {division?.label ?? 'Agency'}
          </p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">{agent.description}</p>
      {agent.vibe && (
        <p className="mt-2 truncate text-xs italic text-zinc-500" title={agent.vibe}>
          &ldquo;{agent.vibe}&rdquo;
        </p>
      )}

      {/* Action row — always visible on touch, revealed on hover from md up */}
      <div className="mt-3 flex flex-wrap items-center gap-2 transition duration-200 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
        <button
          onClick={() => onNewChatWith(agent.slug)}
          className="nx-gradient-surface flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Chat
        </button>
        {pinned ? (
          <button
            onClick={onUnpin}
            className="flex items-center gap-1.5 rounded-lg border border-[#ff5a5f]/40 px-3 py-1.5 text-xs font-medium text-[#ff8a8d] transition hover:bg-[#ff5a5f]/10"
          >
            <PinOff className="h-3.5 w-3.5" />
            Unpin
          </button>
        ) : (
          <button
            onClick={() => onPin(agent.slug)}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:bg-white/5"
          >
            <Pin className="h-3.5 w-3.5" />
            Pin to current chat
          </button>
        )}
      </div>
    </article>
  )
}
