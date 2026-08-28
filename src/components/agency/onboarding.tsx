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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="agency-scroll max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-border/60 bg-sidebar p-6 md:p-10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400">
            <Hexagon className="h-5 w-5 text-foreground" fill="currentColor" aria-hidden />
          </span>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
            NEXUS · The Agency
          </p>
        </div>

        <h2 className="font-display mt-6 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Welcome to The Agency
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
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
                    : 'border-border/60 bg-muted/60 hover:border-border hover:bg-muted'
                }`}
              >
                <DivisionIcon division={d} className="h-5 w-5" />
                <span className="text-sm font-medium text-foreground">{d.label}</span>
                <span className="text-xs text-muted-foreground/80">{d.count} specialists</span>
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground/80">
            {selected.length}/{MAX_PICKS} selected — optional
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onComplete([])}
              className="text-sm text-muted-foreground/80 underline underline-offset-4 transition hover:text-muted-foreground"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={() => onComplete(selected)}
              className="flex h-11 items-center justify-center rounded-xl bg-amber-400 px-8 text-sm font-semibold text-foreground transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Enter the Agency
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
