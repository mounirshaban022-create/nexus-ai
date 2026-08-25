'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Bot, Brain, Radio, Send, PlugZap, Wand2 } from 'lucide-react'
import { MODES, type ModeId } from './modes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface HomeModeProps {
  onOpenMode: (mode: ModeId, payload?: string) => void
}

const SUGGESTIONS = [
  'Explain quantum computing like I am five',
  'Write a haiku about the desert at dusk',
  'Plan a 3-day trip to Dubai on a budget',
  'Draft a polite follow-up email for a job application',
]
const AGENT_MISSIONS: string[] = []

export function HomeMode({ onOpenMode }: HomeModeProps) {
  const [prompt, setPrompt] = useState('')

  const featured = MODES.filter((m) => ['voice-live', 'agent', 'connectors'].includes(m.id))
  const superpowers = MODES.filter(
    (m) => !['home', 'agent', 'voice-live', 'connectors'].includes(m.id)
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="omni-aurora mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="text-center"
        >
          <Badge
            variant="outline"
            className="mb-5 gap-2 rounded-full border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
            </span>
            Now with Live Voice & Deep Thinking
          </Badge>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            One AI. <span className="omni-text-gradient">Infinite connections.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Talk to NEXUS like a human, watch it <strong className="text-foreground">think</strong>, and let its
            agent act across the web — 10 superpowers in one app.
          </p>

          {/* Universal prompt bar */}
          <form
            className="mx-auto mt-8 flex max-w-2xl items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const value = prompt.trim()
              if (!value) return
              onOpenMode('chat', value)
              setPrompt('')
            }}
          >
            <div className="relative flex-1">
              <Wand2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask anything — or give the Agent a mission…"
                aria-label="Ask NEXUS anything"
                className="h-12 rounded-xl border-border bg-card pl-10 pr-4 text-base shadow-sm placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
              />
            </div>
            <Button
              type="submit"
              size="icon"
              aria-label="Send to chat"
              className="h-12 w-12 rounded-xl bg-primary text-primary-foreground hover:brightness-110"
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onOpenMode('chat', s)}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.section>

        {/* All abilities — compact grid */}
        <section className="mt-10" aria-label="All abilities">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((mode, i) => {
              const Icon = mode.id === 'agent' ? Bot : mode.id === 'voice-live' ? Radio : PlugZap
              return (
                <motion.button
                  key={mode.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.06 * i, ease: 'easeOut' }}
                  onClick={() => onOpenMode(mode.id)}
                  className="group text-left"
                  aria-label={`Open ${mode.label}`}
                >
                  <Card
                    className={`premium-card relative h-full overflow-hidden border-border/50 transition-all duration-300 group-hover:-translate-y-1.5 ${mode.accentBorder}`}
                  >
                    <CardContent className="relative flex h-full flex-col gap-3 p-6">
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl ${mode.accentBg} border ${mode.accentBorder}`}
                        >
                          <Icon className={`h-6 w-6 ${mode.accentText}`} aria-hidden />
                        </div>
                        <Badge
                          variant="outline"
                          className="rounded-full border-border/60 bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          New
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{mode.label}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {mode.description}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                        {mode.description}
                      </p>
                      <span
                        className={`mt-auto flex items-center gap-1 text-xs font-semibold ${mode.accentText}`}
                      >
                        Open {mode.label}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                      </span>
                    </CardContent>
                  </Card>
                </motion.button>
              )
            })}
          </div>
        </section>

        <section className="mt-4" aria-label="More abilities">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {superpowers.map((mode, i) => {
              const Icon = mode.icon
              return (
                <motion.button
                  key={mode.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.03 * (i + 2) }}
                  onClick={() => onOpenMode(mode.id)}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-card p-4 text-center transition hover:bg-secondary/50"
                  aria-label={`Open ${mode.label}`}
                >
                  <Icon className={`h-6 w-6 ${mode.accentText}`} aria-hidden />
                  <span className="text-[13px] font-medium">{mode.shortLabel}</span>
                </motion.button>
              )
            })}
          </div>
        </section>

        {/* Bottom strip */}
        <section className="mt-12">
          <Card className="border-border/60 bg-card/50 backdrop-blur">
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-sm font-semibold text-primary">
                  Built on frontier models, secured by design
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rate-limited APIs, strict input validation, prompt-injection hardened agent —
                  and every connector is live right now.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {['Live Voice', 'Thinking', 'Chat', 'Vision', 'TTS', 'ASR', 'Search', 'Reader', '9 Connectors'].map(
                  (tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="border-border/70 bg-secondary/60 text-[11px] font-medium"
                    >
                      {tag}
                    </Badge>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
