'use client'

/**
 * The Agency — marketing landing for signed-out visitors (task 5-a).
 *
 * Dark editorial hero with the division color rail, stats line, dual CTA and
 * a horizontal strip of featured specialists. Sticky footer via mt-auto.
 */

import { motion, type Variants } from 'framer-motion'
import { Hexagon } from 'lucide-react'
import { AGENCY_DIVISIONS, AGENCY_STATS, FEATURED_AGENTS, divisionOf, tint } from './shared'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

export function AgencyLanding({
  onJoin,
  onGuest,
}: {
  onJoin: () => void
  onGuest: () => void
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#09090b] text-zinc-100">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.05),transparent_55%)]"
      />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400">
            <Hexagon className="h-5 w-5 text-zinc-950" fill="currentColor" aria-hidden />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none tracking-tight">NEXUS</p>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              The Agency
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onJoin}
          className="flex h-11 items-center justify-center rounded-xl bg-amber-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          Join the Agency
        </button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-6 py-20 text-center md:py-24">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center"
        >
          <motion.p
            variants={item}
            className="text-[11px] uppercase tracking-[0.2em] text-zinc-500"
          >
            NEXUS presents · The Agency
          </motion.p>
          <motion.h1
            variants={item}
            className="font-display mt-6 text-5xl font-bold tracking-tighter md:text-7xl"
          >
            Hire the entire agency.
          </motion.h1>
          <motion.p variants={item} className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
            {AGENCY_STATS.agents} specialist AI agents across {AGENCY_STATS.divisions}{' '}
            divisions — designers, engineers, marketers, analysts. Each with real
            personality, real process, real deliverables. One conversation away.
          </motion.p>

          {/* Division color rail */}
          <motion.div
            variants={item}
            className="mt-10 flex flex-wrap items-center justify-center gap-2.5"
            aria-label={`The ${AGENCY_STATS.divisions} agency divisions`}
          >
            {AGENCY_DIVISIONS.map((d) => (
              <span
                key={d.id}
                title={`${d.label} — ${d.count} specialists`}
                className="h-2.5 w-2.5 rounded-full transition-transform hover:scale-125"
                style={{ backgroundColor: d.color }}
              />
            ))}
          </motion.div>

          {/* Stats line */}
          <motion.p variants={item} className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-400">
            <span className="font-medium text-zinc-300">{AGENCY_STATS.agents} specialists</span>
            <span aria-hidden className="text-zinc-700">·</span>
            <span className="font-medium text-zinc-300">{AGENCY_STATS.divisions} divisions</span>
            <span aria-hidden className="text-zinc-700">·</span>
            <span className="font-medium text-zinc-300">Free while in beta</span>
          </motion.p>

          {/* CTAs */}
          <motion.div variants={item} className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={onJoin}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-amber-400 px-8 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 sm:w-auto"
            >
              Join the Agency
            </button>
            <button
              type="button"
              onClick={onGuest}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-700 px-8 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:w-auto"
            >
              Explore as guest
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Featured specialists strip */}
      <section className="relative z-10 py-16" aria-labelledby="featured-heading">
        <div className="mx-auto w-full max-w-6xl px-6">
          <p id="featured-heading" className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Meet the specialists
          </p>
          <div className="agency-scroll -mx-6 mt-6 flex gap-4 overflow-x-auto px-6 pb-4">
            {FEATURED_AGENTS.slice(0, 6).map((a, i) => {
              const div = divisionOf(a)
              return (
                <motion.article
                  key={a.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, ease: 'easeOut', delay: i * 0.05 }}
                  className="w-[240px] flex-shrink-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5"
                >
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
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
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500 italic line-clamp-2">
                    {a.vibe}
                  </p>
                </motion.article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer — pinned to viewport bottom when content is short */}
      <footer className="relative z-10 mt-auto border-t border-zinc-800/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-zinc-500 sm:flex-row">
          <p className="font-display font-semibold text-zinc-400">NEXUS — The Agency</p>
          <p>Agent roster: agency-agents (MIT)</p>
          <p>© 2026</p>
        </div>
      </footer>
    </div>
  )
}
