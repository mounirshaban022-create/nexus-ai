'use client'

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import {
  AGENCY_AGENTS,
  AGENCY_DIVISIONS,
  AGENCY_STATS,
  DIVISION_MAP,
  DivisionIcon,
  type AgentMeta,
  type View,
  tint,
} from './shared'

const PAGE_SIZE = 60

/**
 * Shared specialist card — used by the roster grid and the division view.
 * (Exported so division-view.tsx renders the exact same card.)
 */
export function AgentCard({
  agent,
  setView,
}: {
  agent: AgentMeta
  setView: (v: View) => void
}) {
  const division = DIVISION_MAP[agent.division]
  return (
    <button
      onClick={() => setView({ type: 'agent', agentSlug: agent.slug })}
      aria-label={`Open profile: ${agent.name}`}
      className="group flex w-full gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl"
        style={{ backgroundColor: division ? tint(division.color, 0.12) : 'rgba(113,113,122,0.12)' }}
        aria-hidden
      >
        {agent.emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-zinc-100">{agent.name}</span>
          {division && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: tint(division.color, 0.12), color: division.color }}
            >
              {division.label}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-xs text-zinc-500">{agent.description}</span>
        {agent.vibe && (
          <span className="line-clamp-1 text-[11px] italic text-zinc-600">{agent.vibe}</span>
        )}
      </span>
    </button>
  )
}

/**
 * The Roster — browse and search all 255 specialists across 17 divisions.
 * Client-side filtering over the statically imported catalog (instant).
 */
export function AgencyRoster({
  initialQuery,
  initialDivision,
  setView,
}: {
  initialQuery?: string
  initialDivision?: string
  setView: (v: View) => void
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [division, setDivision] = useState<string | null>(
    initialDivision && AGENCY_DIVISIONS.some((d) => d.id === initialDivision) ? initialDivision : null
  )
  const [limit, setLimit] = useState(PAGE_SIZE)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return AGENCY_AGENTS.filter((a) => {
      if (division && a.division !== division) return false
      if (!q) return true
      const divisionLabel = DIVISION_MAP[a.division]?.label ?? ''
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        divisionLabel.toLowerCase().includes(q)
      )
    })
  }, [query, division])

  const visible = results.slice(0, limit)
  const hasFilters = query.trim() !== '' || division !== null

  const clearFilters = () => {
    setQuery('')
    setDivision(null)
    setLimit(PAGE_SIZE)
    inputRef.current?.focus()
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      {/* Header */}
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">The Roster</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
          Every specialist.
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {AGENCY_STATS.agents} agents across {AGENCY_STATS.divisions} divisions
        </p>
      </header>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          placeholder="Search specialists, skills, divisions…"
          aria-label="Search specialists"
          autoFocus
          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-zinc-600"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setLimit(PAGE_SIZE)
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Division filter chips */}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by division">
        <button
          onClick={() => {
            setDivision(null)
            setLimit(PAGE_SIZE)
          }}
          aria-pressed={division === null}
          className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition ${
            division === null
              ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
              : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          All
          <span className="text-[10px] text-zinc-500">{AGENCY_STATS.agents}</span>
        </button>
        {AGENCY_DIVISIONS.map((d) => {
          const active = division === d.id
          return (
            <button
              key={d.id}
              onClick={() => {
                setDivision(active ? null : d.id)
                setLimit(PAGE_SIZE)
              }}
              aria-pressed={active}
              className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition ${
                active ? '' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
              style={
                active
                  ? { borderColor: d.color, backgroundColor: tint(d.color, 0.12), color: d.color }
                  : undefined
              }
            >
              <DivisionIcon division={d} className="h-3.5 w-3.5" />
              {d.label}
              <span className="text-[10px] opacity-70">{d.count}</span>
            </button>
          )
        })}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 py-16 text-center">
          <p className="text-sm font-medium text-zinc-300">No specialists match.</p>
          <p className="max-w-sm text-xs text-zinc-500">
            Try a different search term or clear the division filter.
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            {results.length} specialist{results.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((agent, i) => (
              <motion.div
                key={agent.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  ease: 'easeOut',
                  delay: Math.min(i * 0.015, 0.25),
                }}
              >
                <AgentCard agent={agent} setView={setView} />
              </motion.div>
            ))}
          </div>
          {results.length > visible.length && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                Show more
                <span className="ml-2 text-xs text-zinc-500">
                  {visible.length} of {results.length}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
