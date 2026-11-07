'use client'

/**
 * NEXUS Official Site — motion & graphics primitives (performance build).
 *
 * Everything here is one-shot or transform-only:
 *  • Reveal — plays once when scrolled into view (no continuous work)
 *  • AuroraBackdrop — static painted gradients (zero animation)
 *  • Waveform — tiny scaleY keyframes on 20 bars (compositor-only)
 *  • SpotlightCard — CSS var pointer glow (hover-only)
 *  • ScrollProgress — one transform on a 2px hairline
 *
 * Removed for speed vs the previous version: the O(n²) canvas particle
 * loop, magnetic pointer springs, animated counters, and the three
 * infinitely-animated blurred aurora divs (now static).
 */

import { useRef, type ReactNode } from 'react'
import { motion, useScroll, useSpring, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Aurora backdrop — static brand gradient washes (painted once)       */
/* ------------------------------------------------------------------ */

export function AuroraBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className="absolute -top-40 left-1/2 h-[560px] w-[820px] -translate-x-1/2 rounded-full opacity-40 blur-[110px]"
        style={{ background: 'radial-gradient(closest-side, rgba(255,90,95,0.5), rgba(245,166,35,0.22), transparent)' }}
      />
      <div
        className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full opacity-30 blur-[100px]"
        style={{ background: 'radial-gradient(closest-side, rgba(255,42,104,0.55), transparent)' }}
      />
      <div
        className="absolute top-1/2 -right-48 h-[460px] w-[460px] rounded-full opacity-25 blur-[110px]"
        style={{ background: 'radial-gradient(closest-side, rgba(245,166,35,0.5), transparent)' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reveal — whileInView fade/rise wrapper (one-shot)                   */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  once = true,
  ...rest
}: { children: ReactNode; delay?: number; y?: number; once?: boolean } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-70px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 1.02, 0.73, 1] }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Waveform — talking-voice bars (pure CSS keyframes in globals.css)   */
/* ------------------------------------------------------------------ */

export function Waveform({ className, bars = 24 }: { className?: string; bars?: number }) {
  return (
    <div aria-hidden className={cn('flex h-10 items-center justify-center gap-[3px]', className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="site-wave-bar w-[3px] rounded-full bg-gradient-to-t from-[#ff2a68] via-[#ff5a5f] to-[#f5a623]"
          style={{
            height: `${18 + Math.abs(Math.sin(i * 1.7)) * 82}%`,
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${0.9 + (i % 5) * 0.14}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SpotlightCard — pointer-tracked glow (Linear/Arc-style bento card)  */
/* ------------------------------------------------------------------ */

export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={ref}
      className={cn('site-spotlight nx-glow-card h-full rounded-3xl', className)}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
        el.style.setProperty('--my', `${e.clientY - rect.top}px`)
      }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ScrollProgress — hairline gradient bar tracking page scroll         */
/* ------------------------------------------------------------------ */

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.35 })
  return (
    <motion.div
      aria-hidden
      className="site-progress fixed inset-x-0 top-0 z-50 h-[2.5px] bg-gradient-to-r from-[#f5a623] via-[#ff5a5f] to-[#ff2a68]"
      style={{ scaleX }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* SectionHeading — kicker + title + sub                               */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  kicker,
  title,
  sub,
  id,
}: {
  kicker: string
  title: ReactNode
  sub?: string
  id?: string
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="nx-gradient-text text-xs font-semibold uppercase tracking-[0.22em]">{kicker}</p>
      <h2 id={id} className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
        {title}
      </h2>
      {sub ? <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{sub}</p> : null}
    </Reveal>
  )
}
