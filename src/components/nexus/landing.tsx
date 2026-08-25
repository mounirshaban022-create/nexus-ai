'use client'

/**
 * NEXUS One — premium marketing landing.
 *
 * Dark canvas with the brand gradient, the real logo lockup, capability
 * grid, how-it-works strip, stats and a sticky footer. Framer-motion
 * staggered entrances; fully responsive (mobile-first).
 */

import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  Clapperboard,
  Code2,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Mic,
  MousePointerClick,
  Search,
} from 'lucide-react'
import { AGENCY_STATS, BrandLockup, TOOL_META } from './shared'

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

const TOOL_COUNT = Object.keys(TOOL_META).length

interface Capability {
  icon: typeof ImageIcon
  title: string
  desc: string
  tint: string
  color: string
}

const CAPABILITIES: Capability[] = [
  { icon: MessageSquare, title: 'Chat', desc: 'Reasoning, memory and markdown answers in one thread.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: ImageIcon, title: 'Images', desc: 'Logos, art and photo edits generated inline.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: Clapperboard, title: 'Videos', desc: 'Multi-scene AI clips with narration and captions.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
  { icon: FileText, title: 'Documents', desc: 'Word, Excel, PowerPoint and PDF — built for you.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Code2, title: 'Code & terminal', desc: 'Runs code and shell commands in a live sandbox.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: MousePointerClick, title: 'Real browser', desc: 'Opens, clicks, fills and reads live web pages.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
  { icon: Mic, title: 'Voice', desc: 'Talk hands-free with live transcription.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Mail, title: 'Email & WhatsApp', desc: 'Drafts and sends real messages for you.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: Search, title: 'Live web search', desc: 'Fresh answers with cited sources.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
]

const STEPS = [
  {
    n: '01',
    title: 'Ask anything',
    desc: 'One message box, no modes or menus. Say what you need in plain language.',
  },
  {
    n: '02',
    title: 'The right specialist takes over',
    desc: `${AGENCY_STATS.agents} agents across ${AGENCY_STATS.divisions} divisions route themselves into your chat automatically — and hand back when done.`,
  },
  {
    n: '03',
    title: 'Real results',
    desc: 'Files you can download, images and videos inline, emails actually sent, pages actually browsed.',
  },
]

const STATS = [
  { value: String(AGENCY_STATS.agents), label: 'specialists' },
  { value: String(AGENCY_STATS.divisions), label: 'divisions' },
  { value: String(TOOL_COUNT), label: 'tools' },
  { value: '1', label: 'chat' },
]

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="nx-gradient-text text-xs font-semibold uppercase tracking-[0.2em]">{children}</p>
  )
}

export function NexusLanding({ onJoin, onGuest }: { onJoin: () => void; onGuest: () => void }) {
  const year = new Date().getFullYear()

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[#09090b] text-zinc-100">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,90,95,0.16),rgba(245,166,35,0.07)_45%,transparent_70%)]"
      />

      {/* ---------- Sticky glass header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#09090b]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLockup height={24} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGuest}
              className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100 sm:block"
            >
              Explore as guest
            </button>
            <button
              type="button"
              onClick={onJoin}
              className="nx-gradient-surface rounded-full px-5 py-2 text-sm font-semibold"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* ---------- Hero ---------- */}
        <section className="mx-auto w-full max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-24">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div variants={fadeUp} className="flex justify-center">
              <span className="nx-aura relative inline-flex rounded-2xl p-3">
                <BrandLockup height={64} />
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-display mt-8 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
            >
              One AI.
              <br />
              <span className="nx-gradient-text">Every superpower.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg"
            >
              Chat · images · videos · documents · code · voice · email · WhatsApp · real browser —
              and <span className="text-zinc-200">{AGENCY_STATS.agents} specialists</span> that
              auto-take-over the moment you need them.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[48px] items-center gap-2 rounded-full px-7 text-sm font-semibold"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onGuest}
                className="flex min-h-[48px] items-center rounded-full border border-white/15 px-7 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
              >
                Explore as guest
              </button>
            </motion.div>

            {/* Stats row */}
            <motion.dl
              variants={fadeUp}
              className="mx-auto mt-16 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4"
            >
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="nx-gradient-text font-display block text-3xl font-bold sm:text-4xl">
                      {s.value}
                    </span>
                    <span className="mt-1 block text-xs uppercase tracking-widest text-zinc-500">
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </motion.dl>
          </motion.div>
        </section>

        {/* ---------- Capability grid ---------- */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="nx-caps">
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
            <motion.div variants={fadeUp} className="text-center">
              <Kicker>Superpowers</Kicker>
              <h2 id="nx-caps" className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything, in one chat.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
                No add-ons, no plugins — every power is native to the conversation.
              </p>
            </motion.div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((c) => (
                <motion.div key={c.title} variants={fadeUp} className="nx-glow-card p-5">
                  <span
                    aria-hidden
                    className="mb-4 grid h-11 w-11 place-items-center rounded-xl"
                    style={{ backgroundColor: c.tint, color: c.color }}
                  >
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-100">{c.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{c.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="border-y border-white/5 bg-white/[0.015]" aria-labelledby="nx-how">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
              <motion.div variants={fadeUp} className="text-center">
                <Kicker>How it works</Kicker>
                <h2 id="nx-how" className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Three steps. Zero friction.
                </h2>
              </motion.div>
              <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
                {STEPS.map((s) => (
                  <motion.div key={s.n} variants={fadeUp} className="relative">
                    <span className="font-display text-5xl font-bold text-white/8" aria-hidden>
                      {s.n}
                    </span>
                    <h3 className="font-display mt-3 text-lg font-semibold text-zinc-100">{s.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{s.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="nx-glow-card relative overflow-hidden p-8 text-center sm:p-14"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgba(255,90,95,0.12),transparent_70%)]"
            />
            <h2 className="font-display relative text-3xl font-bold tracking-tight sm:text-4xl">
              Ready when <span className="nx-gradient-text">you are.</span>
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
              Start free — your first specialist is already on call.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[48px] items-center gap-2 rounded-full px-7 text-sm font-semibold"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onGuest}
                className="flex min-h-[48px] items-center rounded-full border border-white/15 px-7 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
              >
                Explore as guest
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ---------- Sticky footer ---------- */}
      <footer className="mt-auto border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <BrandLockup height={18} />
          <p>
            Built by <span className="font-medium text-zinc-300">Mounir Shaaban</span>
          </p>
          <p>© {year} NEXUS</p>
        </div>
      </footer>
    </div>
  )
}
