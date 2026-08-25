'use client'

/**
 * The Agency — first-visit onboarding overlay (task 5-a).
 *
 * Division picker (up to 5, optional) shown over the app shell. Selected
 * divisions are passed to onComplete and persisted by the caller to
 * localStorage ('agency-favorite-divisions').
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Hexagon } from 'lucide-react'
import { AGENCY_DIVISIONS, DivisionIcon } from './shared'

const MAX_PICKS = 5

export function AgencyOnboarding({
  onComplete,
}: {
  onComplete: (favoriteDivisions: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_PICKS) return prev
      return [...prev, id]
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to The Agency"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/95 p-6 backdrop-blur"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="agency-scroll max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800/60 bg-[#0c0c0f] p-6 md:p-10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400">
            <Hexagon className="h-5 w-5 text-zinc-950" fill="currentColor" aria-hidden />
          </span>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            NEXUS · The Agency
          </p>
        </div>

        <h2 className="font-display mt-6 text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl">
          Welcome to The Agency
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-400 md:text-base">
          {AGENCY_DIVISIONS.reduce((sum, d) => sum + d.count, 0)} specialists.{' '}
          {AGENCY_DIVISIONS.length} divisions. Pick a few you work with — we&rsquo;ll
          pin them to your home.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AGENCY_DIVISIONS.map((d) => {
            const isSel = selected.includes(d.id)
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                aria-pressed={isSel}
                className={`flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                  isSel
                    ? 'border-amber-400 bg-amber-400/5'
                    : 'border-zinc-800/60 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <DivisionIcon division={d} className="h-5 w-5" />
                <span className="text-sm font-medium text-zinc-100">{d.label}</span>
                <span className="text-xs text-zinc-500">{d.count} specialists</span>
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-zinc-500">
            {selected.length}/{MAX_PICKS} selected — optional
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onComplete([])}
              className="text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-300"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={() => onComplete(selected)}
              className="flex h-11 items-center justify-center rounded-xl bg-amber-400 px-8 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Enter the Agency
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
