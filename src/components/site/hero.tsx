'use client'

/**
 * NEXUS Official Site — Hero v2.
 *
 * Three.js plasma orb (WebGL) breathes behind a kinetic split-char
 * headline — bold Space Grotesk lines with one Instrument Serif italic
 * accent word (the 2025 editorial move). A glass "product window" plays
 * a looping agent conversation under the orb, floating glass chips and
 * animated counters complete the stack. Framer Motion + Lenis + GSAP.
 */

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type Variants } from 'framer-motion'
import { ArrowDown, ArrowRight, MessagesSquare, Sparkles } from 'lucide-react'
import { AGENCY_STATS, TOOL_META } from '@/components/nexus/shared'
import { AuroraBackdrop, Counter, Magnetic, ParticleField } from './fx'
import { SplitReveal } from './gsap-fx'

// WebGL is client-only — never rendered on the server.
const WebglOrb = dynamic(() => import('./webgl-orb'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full">
      <div className="nx-aura mx-auto mt-[8%] h-[540px] w-[540px] rounded-full opacity-70" />
    </div>
  ),
})

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.21, 1.02, 0.73, 1] } },
}

/* -------------------- looping product window -------------------- */

type MockLine = { from: 'user' | 'nexus'; text: string; tool?: string }

const MOCK_SCRIPT: MockLine[] = [
  { from: 'user', text: 'Design a launch logo, then draft the announcement email.' },
  { from: 'nexus', text: 'Imagery Agent took over — logo generated ✓', tool: '🎨 Imagery Agent' },
  { from: 'nexus', text: 'Now the email — drafted and ready to send.' },
  { from: 'user', text: 'Perfect. Send it to the team and start a voice debrief.' },
  { from: 'nexus', text: 'Sent ✓ — joining you on the call now.' },
]

function ProductWindow() {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(1)
  const visible = reduceMotion ? MOCK_SCRIPT.length : step

  useEffect(() => {
    if (reduceMotion) return
    const timer = setInterval(() => {
      setStep((v) => (v >= MOCK_SCRIPT.length ? 1 : v + 1))
    }, 2100)
    return () => clearInterval(timer)
  }, [reduceMotion])

  return (
    <div className="gradient-border relative overflow-hidden rounded-3xl p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-4">
      {/* Window chrome */}
      <div className="mb-3 flex items-center gap-2 px-1.5 pt-1">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5a5f]/80" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f5a623]/80" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" aria-hidden />
        <span className="ml-2 text-[11px] font-medium tracking-wide text-muted-foreground/70">
          nexus — one chat, every superpower
        </span>
      </div>

      {/* Conversation */}
      <div className="space-y-2.5 px-1 pb-1" aria-label="NEXUS product preview">
        {MOCK_SCRIPT.slice(0, visible).map((line, i) => (
          <motion.div
            key={`${visible}-${i}`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={line.from === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}
          >
            {line.tool && (
              <span className="nx-shimmer mb-2 rounded-full border border-[#ff5a5f]/30 bg-[#ff5a5f]/10 px-2.5 py-1 text-[10.5px] font-semibold text-[#ff8a8d]">
                {line.tool}
              </span>
            )}
            <span
              className={
                line.from === 'user'
                  ? 'nx-gradient-surface max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-[12.5px] leading-snug text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-md border border-border/80 bg-muted/60 px-3.5 py-2 text-[12.5px] leading-snug text-foreground/90'
              }
            >
              {line.text}
            </span>
          </motion.div>
        ))}
        {visible < MOCK_SCRIPT.length && (
          <span className="inline-flex items-center gap-1 pl-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[#ff5a5f]"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16 }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------------------------- hero ---------------------------- */

export function Hero({
  onJoin,
  onGuest,
  onTalk,
}: {
  onJoin: () => void
  onGuest: () => void
  onTalk: () => void
}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const orbY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 140])
  const mockY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 90])
  const mockRotate = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 3])
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0.15])

  const tools = Object.keys(TOOL_META).length

  return (
    <section ref={sectionRef} className="relative overflow-hidden" aria-labelledby="hero-title">
      {/* Backdrop graphics */}
      <AuroraBackdrop className="opacity-90" />
      <ParticleField />

      {/* WebGL plasma orb — behind headline and product window */}
      <motion.div
        aria-hidden
        style={{ y: orbY, opacity: fade }}
        className="pointer-events-none absolute left-1/2 top-[13%] z-0 h-[600px] w-[min(94vw,780px)] -translate-x-1/2 opacity-75 sm:h-[720px]"
      >
        <WebglOrb className="h-full w-full" />
      </motion.div>
      {/* Contrast veil — keeps hero copy readable over the orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_58%_50%_at_50%_38%,rgba(5,4,8,0.42),transparent_72%)]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-background to-transparent"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:pb-28">
        <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-4xl text-center">
          {/* Announcement pill */}
          <motion.div variants={fadeUp} className="flex justify-center">
            <button
              type="button"
              onClick={onTalk}
              className="group flex items-center gap-2 rounded-full border border-border/80 bg-card/50 py-1.5 pl-2 pr-3.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition hover:border-[#ff5a5f]/40 hover:text-foreground"
            >
              <span className="nx-gradient-surface flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="h-3 w-3" aria-hidden />
                New
              </span>
              Knowledge Base with verified citations — ask our concierge about it
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          </motion.div>

          {/* Kinetic headline — bold sans + one serif-italic accent word */}
          <motion.h1
            id="hero-title"
            variants={fadeUp}
            className="font-display mt-8 text-[2.85rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-7xl lg:text-[5.4rem]"
          >
            <SplitReveal text="One AI." delay={0.15} className="block" />
            <span className="block">
              <SplitReveal text="Every" delay={0.55} className="mr-[0.22em]" />
              <SplitReveal
                text="superpower."
                delay={0.72}
                className="font-serif-accent font-normal tracking-[-0.01em]"
                charClass="nx-gradient-text"
              />
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Chat, images, videos, documents, code, voice, email, WhatsApp, the live web — and{' '}
            <span className="font-semibold text-foreground">{AGENCY_STATS.agents} specialist agents</span>{' '}
            that silently take over the moment you need them. This website talks.{' '}
            <span className="font-semibold text-foreground">The product delivers.</span>
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic>
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[48px] items-center gap-2 rounded-full px-8 text-sm font-semibold"
              >
                Launch NEXUS
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </Magnetic>
            <Magnetic strength={0.2}>
              <button
                type="button"
                onClick={onTalk}
                className="flex min-h-[48px] items-center gap-2 rounded-full border border-border bg-card/40 px-7 text-sm font-semibold text-foreground/90 backdrop-blur-md transition hover:border-[#ff5a5f]/40 hover:bg-accent/50"
              >
                <MessagesSquare className="h-4 w-4 text-[#ff5a5f]" aria-hidden />
                Talk to our AI
              </button>
            </Magnetic>
          </motion.div>
          <motion.button
            variants={fadeUp}
            type="button"
            onClick={onGuest}
            className="mt-4 text-xs font-medium text-muted-foreground/80 underline decoration-border underline-offset-4 transition hover:text-foreground"
          >
            or explore as a guest — no account needed
          </motion.button>

          {/* Stats */}
          <motion.dl variants={fadeUp} className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {[
              { value: <Counter to={AGENCY_STATS.agents} />, label: 'specialist agents' },
              { value: <Counter to={AGENCY_STATS.divisions} />, label: 'divisions' },
              { value: <Counter to={tools} suffix="+" />, label: 'built-in tools' },
              { value: '1', label: 'conversation' },
            ].map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="nx-gradient-text font-display block text-3xl font-bold sm:text-4xl">{s.value}</span>
                  <span className="mt-1 block text-[11px] uppercase tracking-widest text-muted-foreground/80">{s.label}</span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        {/* Product window with parallax */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.21, 1.02, 0.73, 1] }}
          style={{ y: mockY, rotateX: mockRotate, opacity: fade }}
          className="relative mx-auto mt-16 max-w-2xl [perspective:1200px]"
        >
          <ProductWindow />
          {/* Floating chips */}
          <motion.span
            aria-hidden
            className="nx-glow-card absolute -left-6 top-8 hidden rounded-2xl bg-card/90 px-3.5 py-2.5 text-[11px] font-semibold text-foreground/90 backdrop-blur-md sm:block"
            animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎨 Images generated inline
          </motion.span>
          <motion.span
            aria-hidden
            className="nx-glow-card absolute -right-8 bottom-10 hidden rounded-2xl bg-card/90 px-3.5 py-2.5 text-[11px] font-semibold text-foreground/90 backdrop-blur-md sm:block"
            animate={reduceMotion ? undefined : { y: [0, 12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          >
            🎙️ Real-time voice calls
          </motion.span>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden
        className="relative z-10 -mt-10 flex justify-center pb-8 sm:-mt-4"
        animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/60">
          <ArrowDown className="h-3.5 w-3.5" /> scroll
        </span>
      </motion.div>
    </section>
  )
}
