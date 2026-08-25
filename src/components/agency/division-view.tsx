'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { AGENCY_AGENTS, DIVISION_MAP, DivisionIcon, type View, tint } from './shared'
import { AgentCard } from './roster'

/** One-line descriptors for each of the 17 divisions (all ids covered). */
const DIVISION_DESCRIPTIONS: Record<string, string> = {
  academic: 'Research rigor for every paper and thesis',
  design: 'Interfaces, brands and visual systems',
  engineering: 'Full-stack, AI and infrastructure builders',
  finance: 'Numbers, models and fiscal clarity',
  'game-development': 'Games worth playing, end to end',
  gis: 'Maps, geodata and spatial insight',
  healthcare: 'Medical writing and clinical rigor',
  marketing: 'Campaigns, content and growth',
  'paid-media': 'Ads that pay for themselves',
  product: 'Strategy, roadmaps and discovery',
  'project-management': 'Shipping on time, every time',
  sales: 'Pipelines, pitches and closing',
  security: 'Threat modeling and hardening',
  'spatial-computing': 'AR/VR and 3D interfaces',
  specialized: 'The odd, the rare, the niche',
  support: 'Customers kept happy',
  testing: 'Quality gates and automation',
}

/**
 * Division view — hero for one of the 17 divisions plus its full specialist
 * grid. Unknown ids fall back to a friendly not-found state.
 */
export function AgencyDivisionView({
  divisionId,
  setView,
}: {
  divisionId: string
  setView: (v: View) => void
}) {
  const division = DIVISION_MAP[divisionId]

  const agents = useMemo(
    () => (division ? AGENCY_AGENTS.filter((a) => a.division === division.id) : []),
    [division]
  )

  if (!division) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <button
          onClick={() => setView({ type: 'roster' })}
          className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All divisions
        </button>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 py-16 text-center">
          <p className="text-sm font-medium text-zinc-300">Division not found.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Browse the full roster to find a specialist.
          </p>
        </div>
      </div>
    )
  }

  const description = DIVISION_DESCRIPTIONS[division.id] ?? 'Specialists ready to help'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      {/* Back */}
      <button
        onClick={() => setView({ type: 'roster' })}
        className="mb-6 flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All divisions
      </button>

      {/* Hero */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl p-4"
          style={{ backgroundColor: tint(division.color, 0.12) }}
          aria-hidden
        >
          <DivisionIcon division={division} className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-zinc-100">
            {division.label}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {division.count} specialist{division.count === 1 ? '' : 's'} · {description}
          </p>
        </div>
      </header>

      {/* Specialist grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent, i) => (
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
    </div>
  )
}
