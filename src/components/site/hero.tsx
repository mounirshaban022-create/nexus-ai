'use client'

/**
 * NEXUS Official Site — hero (performance build).
 *
 * The Three.js WebGL core was replaced by a pure-CSS orb — the same
 * visual drama with zero canvas, zero GPU compute and ~600 KB less
 * JavaScript. Entrance motion is one-shot (plays once), scroll-linked
 * parallax is gone, and the only infinite animations left are cheap
 * transform-only keyframes (orb ring, floating glass chat cards).
 */

import { motion } from 'framer-motion'
import { ArrowRight, MessagesSquare, Sparkles } from 'lucide-react'
import { AuroraBackdrop } from './fx'

const EASE = [0.21, 1.02, 0.73, 1] as const

function RevealLine({
  children,
  delay,
  className,
}: {
  children: React.ReactNode
  delay: number
  className?: string
}) {
  return (
    <span className={`block overflow-visible ${className ?? ''}`}>
      <motion.span
        className="block"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  )
}

/** Small glass chat card that floats beside the orb. */
function ChatCard({
  side,
  children,
}: {
  side: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 1.05, ease: EASE }}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-0' : 'right-0'} hidden md:block`}
    >
      <div
        className={`nx-glow-card w-60 rounded-2xl border border-border/70 bg-background/60 p-3.5 backdrop-blur-xl ${
          side === 'left' ? 'site-float' : 'site-float-delay'
        }`}
      >
        {children}
      </div>
    </motion.div>
  )
}

export function Hero({
  onJoin,
  onGuest,
  onTalk,
}: {
  onJoin: () => void
  onGuest: () => void
  onTalk: () => void
}) {
  return (
    <section
      aria-label="NEXUS — one AI, every superpower"
      className="relative flex min-h-[100svh] flex-col overflow-clip"
    >
      {/* ── Backdrop: static aurora + blueprint grid ──────────────── */}
      <AuroraBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[8%] h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.16),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="site-grid absolute inset-0 [mask-image:radial-gradient(ellipse_62%_58%_at_50%_38%,black_30%,transparent_75%)]"
      />

      {/* ── Copy ───────────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-32 text-center sm:px-6 sm:pt-36">
        {/* Announcement pill */}
        <motion.button
          type="button"
          onClick={onTalk}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
          className="group mx-auto flex min-h-[38px] items-center gap-2 rounded-full border border-border/80 bg-background/50 py-1 pl-1.5 pr-4 text-xs text-muted-foreground backdrop-blur transition hover:border-[#ff5a5f]/40 hover:text-foreground"
        >
          <span className="nx-gradient-surface flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Sparkles className="h-3 w-3" aria-hidden /> New
          </span>
          Knowledge Base with verified citations — ask the concierge
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </motion.button>

        {/* Headline — one-shot rise, serif-italic accent */}
        <h1 className="font-display mt-7 text-[2.85rem] font-bold leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
          <RevealLine delay={0.2}>One AI.</RevealLine>
          <RevealLine delay={0.32}>
            Every{' '}
            <span className="font-serif-accent nx-gradient-text font-normal italic">superpower.</span>
          </RevealLine>
        </h1>

        {/* Sub copy */}
        <RevealLine delay={0.46}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
            Chat, images, video, documents, code, voice, email, WhatsApp and the live web —
            <span className="text-foreground"> 255 specialist agents</span> silently take over the
            moment you need them. One conversation, real results.
          </p>
        </RevealLine>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <button
            type="button"
            onClick={onJoin}
            className="nx-gradient-surface flex min-h-[52px] items-center gap-2 rounded-full px-8 text-sm font-semibold shadow-[0_10px_44px_-10px_rgba(255,90,95,0.55)]"
          >
            Launch NEXUS
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onTalk}
            className="flex min-h-[52px] items-center gap-2 rounded-full border border-border/80 bg-background/40 px-7 text-sm font-semibold text-foreground/90 backdrop-blur transition hover:border-[#ff5a5f]/40 hover:bg-accent/40"
          >
            <MessagesSquare className="h-4 w-4 text-[#ff5a5f]" aria-hidden />
            Talk to our AI
          </button>
        </motion.div>

        {/* Proof strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.85 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80"
        >
          <span>255 specialists</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-[#ff5a5f]/60" />
          <span>20+ built-in tools</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-[#ff5a5f]/60" />
          <span>1 conversation</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-[#ff5a5f]/60" />
          <button type="button" onClick={onGuest} className="underline-offset-4 transition hover:text-foreground hover:underline">
            or explore as a guest
          </button>
        </motion.div>
      </div>

      {/* ── Orb zone — pure-CSS NEXUS core, flanked by glass cards ── */}
      <div className="relative z-0 mx-auto -mt-2 w-full max-w-6xl flex-1 px-4 sm:px-6">
        <div className="relative mx-auto flex h-[46svh] min-h-[360px] max-h-[520px] w-full items-center justify-center">
          <div className="nx-orb" role="img" aria-label="The glowing NEXUS core" />

          {/* Floating glass chat cards — the product, talking */}
          <ChatCard side="left">
            <p className="text-[11px] font-medium leading-snug text-foreground/90">
              “Design a launch logo, then draft the announcement email.”
            </p>
            <div className="mt-2.5 flex items-center gap-2 border-t border-border/60 pt-2.5">
              <span className="nx-aura grid h-6 w-6 place-items-center rounded-full bg-background/80 text-[10px]">🎨</span>
              <p className="text-[10px] leading-tight text-muted-foreground">
                <span className="font-semibold text-[#ff8a4c]">Imagery Agent</span> took over — logo ready ✓
              </p>
            </div>
          </ChatCard>

          <ChatCard side="right">
            <p className="text-[11px] font-medium leading-snug text-foreground/90">
              “Voice: order my usual coffee.”
            </p>
            <div className="site-wave-bar-host mt-2.5 flex items-center gap-1 border-t border-border/60 pt-2.5">
              {[10, 16, 22, 14, 19, 12].map((h, i) => (
                <span
                  key={i}
                  className="site-wave-bar w-[3px] rounded-full bg-gradient-to-t from-[#ff2a68] via-[#ff5a5f] to-[#f5a623]"
                  style={{ height: h, animationDelay: `${i * 0.12}s` }}
                />
              ))}
              <span className="ml-1.5 text-[10px] text-muted-foreground">Speaking…</span>
            </div>
          </ChatCard>
        </div>
      </div>

      {/* Fade into the page canvas */}
      <div aria-hidden className="pointer-events-none relative z-10 h-24 bg-gradient-to-b from-transparent to-background" />
    </section>
  )
}
