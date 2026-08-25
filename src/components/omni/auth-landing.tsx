'use client'

import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Sparkles, Mic, FileText, Languages, ChevronRight, ShieldCheck, CreditCard, Gift } from 'lucide-react'

export interface AuthLandingProps {
  onSignIn: () => void
  onSignUp: () => void
  onContinueAsGuest: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  language: 'en' | 'ar'
  onToggleLanguage: () => void
}

interface Feature {
  title: string
  subtitle: string
  icon: typeof Sparkles
  gradient: string
}

const FEATURES: Feature[] = [
  {
    title: 'Every AI model',
    subtitle: 'GPT, Claude, Gemini, DeepSeek & more — unified.',
    icon: Sparkles,
    gradient: 'from-rose-500 to-orange-500',
  },
  {
    title: 'Natural voice',
    subtitle: 'Speak naturally. Hear responses that sound human.',
    icon: Mic,
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    title: 'Documents & code',
    subtitle: 'Read, write, and run — files, code, and PDFs.',
    icon: FileText,
    gradient: 'from-orange-500 to-rose-500',
  },
]

const TRUST_POINTS: Array<{ label: string; icon: typeof ShieldCheck }> = [
  { label: 'Free to start', icon: Gift },
  { label: 'No credit card', icon: CreditCard },
  { label: 'Privacy-first', icon: ShieldCheck },
]

/**
 * Full-screen dedicated authentication landing page.
 * Design reference: Instagram login landing + Linear hero + Vercel marketing site.
 *
 * The parent component should wrap this in `<AnimatePresence>` and conditionally
 * render it (e.g. `<AnimatePresence>{show && <AuthLanding key="auth-landing" />}</AnimatePresence>`)
 * so the `exit` animation fires on unmount. The `initial`/`animate`/`exit` props
 * on the root motion.div handle the 0.3s opacity fade.
 */
export function AuthLanding({
  onSignIn,
  onSignUp,
  onContinueAsGuest,
  onOpenPrivacy,
  onOpenTerms,
  language,
  onToggleLanguage,
}: AuthLandingProps) {
  const isRtl = language === 'ar'

  return (
    <AnimatePresence>
      <motion.div
        key="auth-landing"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="nexus-shell fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background"
        role="region"
        aria-label="NEXUS AI welcome"
      >
        {/* ---------- Top: 56px header ---------- */}
        <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background px-4 sm:px-6">
          <Image
            src="/nexus-header-logo.png"
            alt="NEXUS AI"
            width={120}
            height={28}
            className="h-7 w-auto"
            priority
          />
          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label={`Toggle language. Current: ${language === 'en' ? 'English' : 'Arabic'}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/60"
          >
            <Languages className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className={language === 'en' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              EN
            </span>
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
            <span className={language === 'ar' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              AR
            </span>
          </button>
        </header>

        {/* ---------- Middle (flex-1, centered, max-w-md) ---------- */}
        <main className="relative flex flex-1 flex-col items-center justify-start gap-8 px-6 py-8 sm:py-10 lg:justify-center lg:gap-10">
          {/* Subtle ambient backdrop — primary-tinted radial gradient at the top */}
          <div
            aria-hidden
            className="nexus-ambient pointer-events-none absolute inset-0 -z-10"
          />

          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 lg:gap-10">
            {/* === Hero block === */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
              className="flex flex-col items-center text-center"
            >
              {/* Beta badge above the brand mark */}
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" aria-hidden />
                Now in public beta
              </span>

              <Image
                src="/nexus-icon-warm.png"
                alt="NEXUS AI"
                width={96}
                height={96}
                className="h-24 w-24 rounded-3xl shadow-xl shadow-primary/15 ring-1 ring-border/50"
                priority
              />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
                One <span className="text-brand-gradient">AI</span>. Infinite connections.
              </h1>
              <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                NEXUS unifies every AI model, every tool, every connection — into one chat.
              </p>
            </motion.div>

            {/* === CTA block === */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.12 }}
              className="flex w-full flex-col gap-3"
            >
              {/* Primary CTA */}
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={onSignIn}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient text-base font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 active:scale-[0.98]"
              >
                <Mail className="mr-2 h-5 w-5" aria-hidden />
                Continue with email
              </motion.button>

              {/* "or" divider with horizontal rules on either side */}
              <div className="flex items-center gap-3 py-0.5" aria-hidden>
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  or
                </span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
              </div>

              {/* Secondary CTAs — 3 side-by-side; flex-row-reverse when RTL */}
              <div className={`flex gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onSignIn}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/60"
                >
                  Sign in
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onSignUp}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/60"
                >
                  Sign up
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onContinueAsGuest}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
                >
                  Try as guest
                </motion.button>
              </div>

              {/* Microcopy — legal hint */}
              <p className="mt-1 text-center text-[11px] text-muted-foreground/70">
                By continuing you agree to our{' '}
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                >
                  Terms
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={onOpenPrivacy}
                  className="font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </motion.div>

            {/* === Feature showcase (3 small cards in a vertical stack on mobile) === */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
              className="flex w-full flex-col gap-2.5"
            >
              {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} text-white shadow-md`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{f.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{f.subtitle}</div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden
                    />
                  </div>
                )
              })}
            </motion.div>

            {/* === Trust row (icons + labels) === */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.28 }}
              className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground/70"
            >
              {TRUST_POINTS.map((p) => {
                const Icon = p.icon
                return (
                  <span key={p.label} className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
                    {p.label}
                  </span>
                )
              })}
            </motion.div>
          </div>
        </main>

        {/* ---------- Bottom: slim legal footer ---------- */}
        <footer className="nexus-footer relative z-10 shrink-0 border-t border-border/60 bg-background/95 px-4 pb-[env(safe-area-inset-bottom)] sm:px-6">
          <div className="flex h-10 items-center justify-between text-xs text-muted-foreground">
            <span>© 2026 NEXUS AI · by Mounir Shaaban</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="transition hover:text-foreground"
              >
                Privacy
              </button>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <button
                type="button"
                onClick={onOpenTerms}
                className="transition hover:text-foreground"
              >
                Terms
              </button>
            </div>
          </div>
        </footer>
      </motion.div>
    </AnimatePresence>
  )
}

export default AuthLanding
