'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  PenLine,
  Code2,
  Search,
  Palette,
  Briefcase,
  GraduationCap,
  Wand2,
  Zap,
  MessageCircle,
  FileText,
} from 'lucide-react'
import { usePreferences, type CommStyle, type Interest } from '@/lib/preferences'

const INTERESTS: Array<{ id: Interest; label: string; icon: any; desc: string }> = [
  { id: 'writing', label: 'Writing', icon: PenLine, desc: 'Essays, emails, stories' },
  { id: 'coding', label: 'Coding', icon: Code2, desc: 'Code, debug, explain' },
  { id: 'research', label: 'Research', icon: Search, desc: 'Deep dive into topics' },
  { id: 'design', label: 'Design', icon: Palette, desc: 'Visuals & concepts' },
  { id: 'business', label: 'Business', icon: Briefcase, desc: 'Strategy & ops' },
  { id: 'learning', label: 'Learning', icon: GraduationCap, desc: 'Explore new ideas' },
  { id: 'creative', label: 'Creative', icon: Wand2, desc: 'Brainstorm & imagine' },
  { id: 'productivity', label: 'Productivity', icon: Zap, desc: 'Get things done' },
]

const STYLES: Array<{ id: CommStyle; label: string; desc: string; icon: any }> = [
  { id: 'concise', label: 'Concise', desc: 'Short, to the point', icon: Zap },
  { id: 'balanced', label: 'Balanced', desc: 'Clear and complete', icon: Sparkles },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough and deep', icon: FileText },
  { id: 'friendly', label: 'Friendly', desc: 'Warm and conversational', icon: MessageCircle },
]

const TOTAL_STEPS = 5

export function Onboarding() {
  const { completeOnboarding } = usePreferences()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [interests, setInterests] = useState<Interest[]>([])
  const [style, setStyle] = useState<CommStyle>('balanced')

  const toggleInterest = (id: Interest) =>
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const next = () => setStep(s => Math.min(TOTAL_STEPS - 1, s + 1))
  const back = () => setStep(s => Math.max(0, s - 1))

  const finish = () => completeOnboarding({ name: name.trim(), interests, commStyle: style })

  return (
    <div className="nexus-ambient flex min-h-dvh flex-col bg-background">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pt-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${i === step ? 'w-7 bg-primary' : i < step ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-border'}`}
          />
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* STEP 1: Welcome */}
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 120, damping: 16 }}
                  className="relative mx-auto mb-7"
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative"
                  >
                    <Image
                      src="/nexus-onboarding-hero.png"
                      alt="Nexus"
                      width={220}
                      height={147}
                      priority
                      className="h-36 w-auto rounded-2xl shadow-2xl shadow-primary/20 ring-1 ring-border/50"
                    />
                  </motion.div>
                  <motion.span
                    aria-hidden
                    className="absolute -inset-3 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-rose-500/10 to-transparent blur-2xl"
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
                <h1 className="text-3xl font-semibold tracking-tight">Welcome to Nexus</h1>
                <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
                  One assistant for everything you do — research, writing, code, images, and more.
                </p>
              </motion.div>
            )}

            {/* STEP 2: Name */}
            {step === 1 && (
              <motion.div
                key="name"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <h1 className="text-2xl font-semibold tracking-tight">What should I call you?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Optional — Nexus will use this to greet you.</p>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && name.trim()) next() }}
                  placeholder="Your name"
                  className="mt-7 w-full rounded-2xl border border-border bg-card px-4 py-3 text-center text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
                <p className="mt-4 text-xs text-muted-foreground">You can change this later in Profile.</p>
              </motion.div>
            )}

            {/* STEP 3: Interests */}
            {step === 2 && (
              <motion.div
                key="interests"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight">What do you want to do?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Pick a few — Nexus will tailor suggestions.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {INTERESTS.map(it => {
                    const Icon = it.icon
                    const active = interests.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        onClick={() => toggleInterest(it.id)}
                        className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-primary bg-primary/8'
                            : 'border-border bg-card hover:bg-secondary'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium">{it.label}</span>
                        <span className="text-[11px] text-muted-foreground">{it.desc}</span>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {interests.length === 0 ? 'Skip if you like — Nexus works for everyone.' : `${interests.length} selected`}
                </p>
              </motion.div>
            )}

            {/* STEP 4: Communication Style */}
            {step === 3 && (
              <motion.div
                key="style"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <h1 className="text-2xl font-semibold tracking-tight">How should Nexus talk to you?</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose the tone that feels right.</p>
                <div className="mt-6 space-y-2">
                  {STYLES.map(s => {
                    const Icon = s.icon
                    const active = style === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => setStyle(s.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                          active ? 'border-primary bg-primary/8' : 'border-border bg-card hover:bg-secondary'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                        </div>
                        {active && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 5: Enter Nexus */}
            {step === 4 && (
              <motion.div
                key="enter"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative mx-auto mb-6"
                >
                  <Image
                    src="/nexus-onboarding-hero.png"
                    alt="Nexus"
                    width={180}
                    height={120}
                    className="h-28 w-auto rounded-2xl shadow-xl shadow-primary/15 ring-1 ring-border/50"
                  />
                  <motion.span
                    aria-hidden
                    className="absolute -inset-2 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent blur-2xl"
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {name.trim() ? `Welcome, ${name.trim().split(' ')[0]}` : "You're all set"}
                </h1>
                <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
                  Nexus is ready. Ask anything, create something, or just say hi.
                </p>
                {(interests.length > 0 || style) && (
                  <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                    {interests.slice(0, 4).map(i => (
                      <span key={i} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                        {i}
                      </span>
                    ))}
                    <span className="rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary capitalize">
                      {style}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer nav */}
      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto flex max-w-md items-center justify-between">
          {step > 0 ? (
            <button onClick={back} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button onClick={next} className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              Skip
            </button>
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={next}
              disabled={step === 1 && !name.trim()}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              Enter Nexus <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
