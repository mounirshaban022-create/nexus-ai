'use client'

/**
 * The Agency — home dashboard (task 5-a).
 *
 * Dubai-time greeting, quick actions, agency stats, pinned/favorite division
 * grid, featured specialists rail and recent conversations. Sessions are read
 * once from GET /api/chat/sessions?kind=chat and shared by stats + recents.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Users } from 'lucide-react'
import {
  AGENCY_DIVISIONS,
  AGENCY_STATS,
  DivisionIcon,
  FEATURED_AGENTS,
  agentOrNexus,
  divisionOf,
  tint,
  type AgencySessionItem,
  type View,
} from './shared'

/* ------------------------------ helpers ------------------------------ */

/** "2h ago" style relative time — client-side only. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}

/** Greeting word computed against the agency's home timezone (Asia/Dubai). */
function dubaiGreeting(name: string): string {
  const who = name.trim() || 'friend'
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Dubai',
      }).format(new Date())
    )
    const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    return `Good ${part}, ${who}`
  } catch {
    return `Welcome back, ${who}`
  }
}

const sectionMotion = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' as const, delay },
})

/* ------------------------------ component ------------------------------ */

export function AgencyHome({
  user,
  setView,
}: {
  user: { email?: string; name?: string } | null
  setView: (v: View) => void
}) {
  const [favorites, setFavorites] = useState<string[] | null>(null)
  const [sessions, setSessions] = useState<AgencySessionItem[] | null>(null)
  const [conversationCount, setConversationCount] = useState<number | null>(null)

  // Pinned divisions (from onboarding) — deferred read after mount for
  // hydration safety (same pattern the legacy page used for onboarding).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem('agency-favorite-divisions')
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        setFavorites(
          Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
        )
      } catch {
        setFavorites([])
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // Conversations — one fetch feeds the stats strip and the recents list.
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/sessions?kind=chat')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ sessions?: AgencySessionItem[] }>
      })
      .then((data) => {
        if (cancelled) return
        const list = data.sessions ?? []
        setSessions(list)
        setConversationCount(list.length)
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([])
          setConversationCount(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const hasFavorites = (favorites?.length ?? 0) > 0
  const divisionCards = hasFavorites
    ? AGENCY_DIVISIONS.filter((d) => favorites?.includes(d.id))
    : AGENCY_DIVISIONS.slice(0, 8)
  const recent = (sessions ?? []).slice(0, 6)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      {/* Greeting */}
      <motion.header {...sectionMotion(0)}>
        <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl">
          {dubaiGreeting(user?.name ?? '')}
        </h1>
        <p className="mt-2 text-sm text-zinc-400 md:text-base">
          Your agency is ready — {AGENCY_STATS.agents} specialists on call.
        </p>
      </motion.header>

      {/* Quick actions */}
      <motion.div {...sectionMotion(0.04)} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => setView({ type: 'chat', agentSlug: null })}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          New conversation
        </button>
        <button
          type="button"
          onClick={() => setView({ type: 'roster' })}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
        >
          <Users className="h-4 w-4" aria-hidden />
          Browse all agents
        </button>
      </motion.div>

      {/* Stats strip */}
      <motion.section {...sectionMotion(0.08)} className="mt-8" aria-label="Agency statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { value: String(AGENCY_STATS.agents), label: 'Specialists' },
            { value: String(AGENCY_STATS.divisions), label: 'Divisions' },
            {
              value: conversationCount === null ? '—' : String(conversationCount),
              label: 'Conversations',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 transition hover:border-zinc-700"
            >
              <p className="font-display text-3xl font-bold tabular-nums text-zinc-100">
                {s.value}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Favorite divisions */}
      <motion.section {...sectionMotion(0.12)} className="mt-10" aria-labelledby="home-divisions">
        <div className="flex items-center justify-between">
          <h2 id="home-divisions" className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Your divisions
          </h2>
          {hasFavorites && (
            <button
              type="button"
              onClick={() => setView({ type: 'roster' })}
              className="text-xs font-medium text-amber-400/90 transition hover:text-amber-300"
            >
              All {AGENCY_STATS.divisions} divisions →
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {divisionCards.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setView({ type: 'division', divisionId: d.id })}
              className="group flex flex-col gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              <span
                className="flex aspect-square w-12 items-center justify-center rounded-xl p-3"
                style={{ backgroundColor: tint(d.color, 0.12) }}
              >
                <DivisionIcon division={d} className="h-6 w-6" />
              </span>
              <span>
                <span className="font-display block font-semibold text-zinc-100">{d.label}</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  {d.count} specialists
                </span>
              </span>
            </button>
          ))}
        </div>
      </motion.section>

      {/* Featured specialists */}
      <motion.section {...sectionMotion(0.16)} className="mt-10" aria-labelledby="home-featured">
        <h2 id="home-featured" className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Featured
        </h2>
        <div className="agency-scroll -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
          {FEATURED_AGENTS.map((a) => {
            const div = divisionOf(a)
            return (
              <button
                key={a.slug}
                type="button"
                onClick={() => setView({ type: 'agent', agentSlug: a.slug })}
                className="w-[260px] flex-shrink-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: tint(div?.color ?? '#f59e0b', 0.12) }}
                >
                  <span aria-hidden>{a.emoji}</span>
                </div>
                <h3 className="mt-4 font-semibold text-zinc-100">{a.name}</h3>
                {div && (
                  <span
                    className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: tint(div.color, 0.14), color: div.color }}
                  >
                    {div.label}
                  </span>
                )}
                <p className="mt-2 text-sm leading-relaxed text-zinc-500 italic line-clamp-2">
                  {a.vibe}
                </p>
              </button>
            )
          })}
        </div>
      </motion.section>

      {/* Recent conversations */}
      <motion.section {...sectionMotion(0.2)} className="mt-10" aria-labelledby="home-recent">
        <h2 id="home-recent" className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Recent conversations
        </h2>

        <div className="mt-4 space-y-3">
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
              <p className="text-sm text-zinc-400">
                No conversations yet — say hello to a specialist.
              </p>
              <button
                type="button"
                onClick={() => setView({ type: 'roster' })}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 px-5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              >
                Browse the roster
              </button>
            </div>
          ) : (
            recent.map((s) => {
              const agent = agentOrNexus(s.agentSlug)
              const div = divisionOf(agent)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setView({ type: 'chat', agentSlug: s.agentSlug ?? null, sessionId: s.id })
                  }
                  className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: tint(div?.color ?? '#f59e0b', 0.12) }}
                  >
                    <span aria-hidden>{agent.emoji}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {s.title || agent.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {s.preview || `Conversation with ${agent.name}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs text-zinc-500">
                      {relativeTime(s.updatedAt)}
                    </span>
                    <span className="block text-[11px] text-zinc-600">
                      {s.messageCount} {s.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </motion.section>
    </div>
  )
}
