'use client'

/**
 * NEXUS Official Site — GSAP (20k★) scroll choreography.
 *
 * The award-tier signature moves:
 *  • SplitReveal     — per-character kinetic type (staggered rise + rotate)
 *  • HorizontalScroll — GSAP-pinned section whose card track scrubs
 *                      sideways as the visitor scrolls vertically
 *  • ParallaxFigure  — scroll-scrubbed image parallax + clip-path reveal
 *  • syncLenisScrollTrigger — Lenis (10k★) drives GSAP's ticker 1:1
 *
 * Every animation is created inside gsap.context() and reverted on
 * unmount; prefers-reduced-motion disables all of it.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { cn } from '@/lib/utils'

/* Register ScrollTrigger on the client only. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/* ------------------------------------------------------------------ */
/* Lenis ↔ ScrollTrigger sync (call once after creating Lenis)         */
/* ------------------------------------------------------------------ */

export function syncLenisScrollTrigger(lenis: Lenis) {
  gsap.registerPlugin(ScrollTrigger)
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => {
    gsap.ticker.remove(tick)
  }
}

/* ------------------------------------------------------------------ */
/* SplitReveal — kinetic per-character headline                        */
/* ------------------------------------------------------------------ */

export function SplitReveal({
  text,
  className,
  charClass,
  delay = 0,
  as: Tag = 'span',
  trigger = 'mount',
}: {
  text: string
  className?: string
  /** classes applied per character — required for gradient text, since
   * background-clip:text on the parent cannot clip through inline-block
   * child spans (they break the parent's text clip). */
  charClass?: string
  /** seconds before the animation starts */
  delay?: number
  as?: 'span' | 'div' | 'h1' | 'h2'
  /** 'mount' = animate on first paint, 'scroll' = when scrolled into view */
  trigger?: 'mount' | 'scroll'
}) {
  const ref = useRef<HTMLElement | null>(null)

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      const chars = el.querySelectorAll('[data-char]')
      gsap.fromTo(
        chars,
        { yPercent: 118, rotate: 6, opacity: 0 },
        {
          yPercent: 0,
          rotate: 0,
          opacity: 1,
          duration: 0.9,
          delay,
          ease: 'power4.out',
          stagger: 0.024,
          ...(trigger === 'scroll'
            ? { scrollTrigger: { trigger: el, start: 'top 88%', once: true } }
            : {}),
        },
      )
    }, el)
    return () => ctx.revert()
  }, [delay, trigger])

  const words = text.split(' ')
  let charIndex = 0

  return (
    <Tag ref={ref as never} className={cn('inline-block', className)} aria-label={text}>
      {words.map((word, wi) => (
        <span key={`${word}-${wi}`} aria-hidden className="inline-block whitespace-nowrap">
          {Array.from(word).map((ch, ci) => {
            charIndex += 1
            return (
              <span
                key={`${ch}-${ci}`}
                data-char
                className={cn('inline-block will-change-transform', charClass)}
              >
                {ch}
              </span>
            )
          })}
          {wi < words.length - 1 && (
            <span data-char className={cn('inline-block will-change-transform', charClass)}>
              &nbsp;
            </span>
          )}
        </span>
      ))}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/* HorizontalScroll — GSAP-pinned sideways gallery                     */
/* ------------------------------------------------------------------ */

export function HorizontalScroll({
  kicker,
  title,
  children,
  className,
  id,
}: {
  kicker: string
  title: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLSpanElement | null>(null)

  useIsoLayoutEffect(() => {
    const section = sectionRef.current
    const track = trackRef.current
    if (!section || !track) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      const distance = () => track.scrollWidth - section.clientWidth

      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (progressRef.current) {
              progressRef.current.textContent = String(
                Math.min(99, Math.max(1, Math.round(self.progress * 100))),
              ).padStart(2, '0')
            }
          },
        },
      })
    }, section)

    const onLoad = () => ScrollTrigger.refresh()
    window.addEventListener('load', onLoad)
    return () => {
      window.removeEventListener('load', onLoad)
      ctx.revert()
    }
  }, [])

  return (
    <section ref={sectionRef} id={id} className={cn('relative overflow-hidden', className)} aria-labelledby="divisions-title">
      <div className="flex h-screen flex-col justify-center py-10">
        <div className="mx-auto mb-10 w-full max-w-6xl px-4 sm:px-6">
          <p className="nx-gradient-text text-xs font-semibold uppercase tracking-[0.22em]">{kicker}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 id="divisions-title" className="font-display max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              {title}
            </h2>
            <p className="font-display text-sm tabular-nums text-muted-foreground">
              <span ref={progressRef}>01</span>
              <span className="text-muted-foreground/50"> / 100</span>
            </p>
          </div>
        </div>

        <div ref={trackRef} className="flex w-max items-stretch gap-4 px-4 will-change-transform sm:gap-5 sm:px-6">
          {children}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* ParallaxFigure — scrubbed image parallax + clip reveal              */
/* ------------------------------------------------------------------ */

export function ParallaxFigure({
  src,
  alt,
  tag,
  caption,
  className,
}: {
  src: string
  alt: string
  tag: string
  caption: string
  className?: string
}) {
  const figRef = useRef<HTMLElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useIsoLayoutEffect(() => {
    const fig = figRef.current
    const img = imgRef.current
    if (!fig || !img) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      // Clip-path cinematic reveal.
      gsap.fromTo(
        fig,
        { clipPath: 'inset(14% 8% 14% 8% round 28px)' },
        {
          clipPath: 'inset(0% 0% 0% 0% round 28px)',
          ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top 92%', end: 'top 42%', scrub: 0.6 },
        },
      )
      // Inner image drifts slower than the page.
      gsap.fromTo(
        img,
        { yPercent: -9, scale: 1.18 },
        {
          yPercent: 9,
          scale: 1.18,
          ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        },
      )
    }, fig)
    return () => ctx.revert()
  }, [])

  return (
    <figure ref={figRef} className={cn('group relative overflow-hidden rounded-[28px]', className)}>
      {/* GSAP transforms the raw img node directly — next/image wrappers fight it */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
      />
      <span className="absolute left-4 top-4 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
        {tag}
      </span>
      <figcaption className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-5 pt-14 text-[13px] font-medium leading-relaxed text-white/90">
        {caption}
      </figcaption>
    </figure>
  )
}
