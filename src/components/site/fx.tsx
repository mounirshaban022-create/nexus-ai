'use client'

/**
 * NEXUS Official Site — motion & graphics primitives.
 *
 * Built on the famous open-source stack: Framer Motion (28k★) for
 * orchestration, Lenis for buttery scroll, and a lightweight custom
 * canvas particle network (the classic particles.js idea, ~0 deps).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  animate,
  type HTMLMotionProps,
} from 'framer-motion'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Particle network — hero canvas                                      */
/* ------------------------------------------------------------------ */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

/**
 * Interactive constellation: drifting nodes linked by hairlines, gently
 * attracted to the pointer. Brand-tinted (amber → coral → magenta).
 */
export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let w = 0
    let h = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    const particles: Particle[] = []
    const pointer = { x: -9999, y: -9999 }
    const LINK = 130

    const seed = () => {
      particles.length = 0
      const target = Math.min(90, Math.max(38, Math.round((w * h) / 26000)))
      for (let i = 0; i < target; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.6 + 0.6,
        })
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }
    const onVisibility = () => {
      running = !document.hidden
      if (running) {
        cancelAnimationFrame(raf)
        tick()
      }
    }

    const tick = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)

      for (const p of particles) {
        // Gentle attraction toward the pointer.
        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const dist2 = dx * dx + dy * dy
        if (dist2 < 26000 && dist2 > 40) {
          p.vx += (dx / Math.sqrt(dist2)) * 0.012
          p.vy += (dy / Math.sqrt(dist2)) * 0.012
        }
        p.vx = Math.max(-0.6, Math.min(0.6, p.vx))
        p.vy = Math.max(-0.6, Math.min(0.6, p.vy))
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20
      }

      // Hairline links.
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < LINK) {
            const alpha = (1 - d / LINK) * 0.32
            ctx.strokeStyle = `rgba(255, 106, 90, ${alpha.toFixed(3)})`
            ctx.lineWidth = 0.7
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // Nodes.
      for (const p of particles) {
        ctx.fillStyle = 'rgba(255, 138, 76, 0.75)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }

    resize()
    tick()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      running = false
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Aurora backdrop — floating brand gradient orbs                      */
/* ------------------------------------------------------------------ */

export function AuroraBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <motion.div
        className="absolute -top-40 left-1/2 h-[560px] w-[820px] -translate-x-1/2 rounded-full opacity-40 blur-[110px]"
        style={{ background: 'radial-gradient(closest-side, rgba(255,90,95,0.5), rgba(245,166,35,0.22), transparent)' }}
        animate={{ x: ['-50%', '-46%', '-54%', '-50%'], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full opacity-30 blur-[100px]"
        style={{ background: 'radial-gradient(closest-side, rgba(255,42,104,0.55), transparent)' }}
        animate={{ y: [0, 60, -20, 0], x: [0, 30, 10, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/2 -right-48 h-[460px] w-[460px] rounded-full opacity-25 blur-[110px]"
        style={{ background: 'radial-gradient(closest-side, rgba(245,166,35,0.5), transparent)' }}
        animate={{ y: [0, -50, 30, 0], x: [0, -20, 10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reveal — whileInView fade/rise wrapper                              */
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
/* Counter — animated number that counts up when scrolled into view    */
/* ------------------------------------------------------------------ */

export function Counter({
  to,
  suffix = '',
  className,
  duration = 1.6,
}: {
  to: number
  suffix?: string
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, to, duration])

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}
      {suffix}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Magnetic — element gently follows the cursor                        */
/* ------------------------------------------------------------------ */

export function Magnetic({ children, strength = 0.28, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 180, damping: 16, mass: 0.4 })
  const y = useSpring(my, { stiffness: 180, damping: 16, mass: 0.4 })

  return (
    <motion.div
      ref={ref}
      style={reduceMotion ? undefined : { x, y }}
      className={cn('inline-block', className)}
      onPointerMove={(e) => {
        if (reduceMotion || !ref.current) return
        const rect = ref.current.getBoundingClientRect()
        mx.set((e.clientX - (rect.left + rect.width / 2)) * strength)
        my.set((e.clientY - (rect.top + rect.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
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
