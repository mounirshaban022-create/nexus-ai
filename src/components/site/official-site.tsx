'use client'

/**
 * NEXUS Official Site v2 — the front door of the product.
 *
 * A full marketing website that TALKS with its visitors: an AI concierge
 * widget floats on every screen, a live demo chat sits mid-page, and a
 * "Launch NEXUS" CTA hands off into the real app (auth/guest flow owned
 * by page.tsx).
 *
 * Elite open-source stack: Framer Motion (28k★) orchestration ·
 * GSAP ScrollTrigger (20k★) pinned/scrubbed choreography · Three.js +
 * R3F (105k★/28k★) WebGL orb · Lenis (10k★) buttery scroll · Lucide.
 */

import { useCallback, useEffect, useState } from 'react'
import Lenis from 'lenis'
import { ArrowRight, Bot, MessagesSquare, Sparkles } from 'lucide-react'
import { BrandLockup } from '@/components/nexus/shared'
import { ConciergePanel, ConciergeWidget } from './concierge'
import { Hero } from './hero'
import { Reveal, ScrollProgress, SectionHeading } from './fx'
import { syncLenisScrollTrigger } from './gsap-fx'
import {
  CtaBanner,
  Divisions,
  Faq,
  Features,
  OssMarquee,
  OpenSourceStack,
  Showcase,
  SiteFooter,
  Testimonials,
  Workflow,
} from './sections'

/* ------------------------------------------------------------------ */
/* Lenis smooth scroll — synced 1:1 with GSAP's ticker                 */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    __lenis?: Lenis
  }
}

function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 })
    window.__lenis = lenis
    const unsync = syncLenisScrollTrigger(lenis)
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsync()
      lenis.destroy()
      window.__lenis = undefined
    }
  }, [])
  return null
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const lenis = window.__lenis
  if (lenis) {
    lenis.scrollTo(el, { offset: -88, duration: 1.2 })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const NAV_LINKS = [
  { label: 'Superpowers', id: 'features' },
  { label: 'Divisions', id: 'divisions' },
  { label: 'Showcase', id: 'showcase' },
  { label: 'Open source', id: 'open-source' },
  { label: 'FAQ', id: 'faq' },
]

/* ------------------------------------------------------------------ */
/* Live demo section — visitors chat with the concierge inline         */
/* ------------------------------------------------------------------ */

function TalkDemo({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section id="talk" className="relative scroll-mt-24" aria-labelledby="talk-title">
      {/* Soft backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 h-[420px] bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(255,90,95,0.07),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            id="talk-title"
            kicker="Don't take our word for it"
            title={<>Talk to NEXUS <span className="font-serif-accent nx-gradient-text font-normal">right here.</span></>}
          />
          <Reveal delay={0.1}>
            <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-muted-foreground sm:text-base lg:mx-0 lg:text-left">
              This chat is powered by the same engine that drives the app — no account, no setup. Ask what NEXUS can do, or just tell it what you're trying to get done.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <ul className="mx-auto mt-6 max-w-md space-y-3 text-sm text-muted-foreground lg:mx-0">
              {[
                { icon: Bot, text: 'Instant, honest answers about every superpower' },
                { icon: Sparkles, text: 'Suggestions tuned to what you want to build' },
                { icon: MessagesSquare, text: 'Hand-off: launch the app mid-thought and continue there' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span className="nx-gradient-surface mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white">
                    <item.icon className="h-3 w-3" aria-hidden />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.26} className="mt-8 hidden lg:block">
            <button
              type="button"
              onClick={onLaunch}
              className="flex items-center gap-2 text-sm font-semibold text-[#ff5a5f] transition hover:gap-3"
            >
              Skip the demo — launch the real thing
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="nx-glow-card relative overflow-hidden rounded-3xl bg-card/80 backdrop-blur-xl">
            <header className="flex items-center gap-3 border-b border-border/60 bg-background/50 px-5 py-3.5">
              <span className="nx-aura relative grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-background/80">
                <Bot className="h-4.5 w-4.5 text-[#ff5a5f]" aria-hidden />
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Live demo — NEXUS Concierge</p>
                <p className="text-[11px] text-muted-foreground">Powered by the NEXUS multi-AI engine</p>
              </div>
            </header>
            <ConciergePanel className="h-[440px]" compact />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Official site                                                       */
/* ------------------------------------------------------------------ */

export function OfficialSite({
  onJoin,
  onGuest,
}: {
  onJoin: () => void
  onGuest: () => void
}) {
  const [conciergeOpen, setConciergeOpen] = useState(false)

  const openConcierge = useCallback(() => setConciergeOpen(true), [])
  const launch = useCallback(() => {
    setConciergeOpen(false)
    onJoin()
  }, [onJoin])

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      {/* Cinematic grain + scroll progress hairline */}
      <div aria-hidden className="site-grain" />
      <ScrollProgress />
      <SmoothScroll />

      {/* ---------------- Floating glass pill nav ---------------- */}
      <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3 sm:top-4">
        <div className="pointer-events-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 rounded-full border border-border/70 bg-background/70 pl-4 pr-2 shadow-lg shadow-black/30 backdrop-blur-xl sm:pl-5">
          <button
            type="button"
            onClick={() => window.__lenis?.scrollTo(0, { duration: 1.1 }) ?? window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            className="shrink-0"
          >
            <BrandLockup height={20} />
          </button>

          <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => scrollToId(l.id)}
                className="text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openConcierge}
              className="hidden min-h-[38px] items-center gap-1.5 rounded-full border border-border/80 px-3.5 text-[13px] font-medium text-muted-foreground transition hover:border-[#ff5a5f]/40 hover:text-foreground sm:flex"
            >
              <MessagesSquare className="h-3.5 w-3.5 text-[#ff5a5f]" aria-hidden />
              Ask AI
            </button>
            <button
              type="button"
              onClick={launch}
              className="nx-gradient-surface min-h-[38px] rounded-full px-4 text-[13px] font-semibold sm:px-5"
            >
              Launch app
            </button>
          </div>
        </div>
      </header>

      <main className="relative">
        <Hero onJoin={launch} onGuest={onGuest} onTalk={openConcierge} />
        <OssMarquee />
        <Features />
        <Divisions onLaunch={launch} />
        <TalkDemo onLaunch={launch} />
        <Workflow />
        <Showcase />
        <Testimonials />
        <OpenSourceStack />
        <Faq />
        <CtaBanner onJoin={launch} onGuest={onGuest} />
      </main>

      <SiteFooter onTalk={openConcierge} />

      {/* The concierge that talks with visitors — every screen */}
      <ConciergeWidget open={conciergeOpen} onOpenChange={setConciergeOpen} />
    </div>
  )
}
