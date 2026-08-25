'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight, History, MessageSquare } from 'lucide-react'
import {
  AGENT_MAP,
  DIVISION_MAP,
  DivisionIcon,
  type AgencySessionItem,
  type View,
  tint,
} from './shared'

/** sessionStorage key used to hand a suggested prompt to the chat composer. */
export const CHAT_PREFILL_KEY = 'agency-chat-prefill'

/** Suggested opening prompts per division (all 17 ids covered). */
export const DIVISION_OPENERS: Record<string, string[]> = {
  academic: [
    'Help me structure a literature review on climate adaptation policy',
    'Turn my rough notes into a proper research methodology section',
    'What citation style fits a social-science journal submission?',
    'Peer-review my abstract and suggest three improvements',
  ],
  design: [
    'Review my landing page and suggest 3 improvements',
    'Design a design-system color palette for a fintech app',
    'Critique this component hierarchy: nav, hero, features, pricing, footer',
    'What makes an interface feel premium?',
  ],
  engineering: [
    'Review my API design and flag anything fragile',
    'Write a production-ready TypeScript utility for retry with backoff',
    'How should I structure a monorepo for a Next.js app and a Rust worker?',
    'Refactor this 200-line function into something readable',
  ],
  finance: [
    'Build a 12-month cash-flow forecast template for a seed-stage startup',
    'Explain the difference between EBITDA and free cash flow like a CFO',
    'What KPIs should a marketplace track from day one?',
    'Stress-test this budget against a 30% revenue drop',
  ],
  'game-development': [
    'Design a core gameplay loop for a 10-minute roguelike',
    'Write a GDD outline for a cozy farming RPG',
    'How do I balance difficulty without frustrating players?',
    'Brainstorm five unique mechanics for a physics puzzle game',
  ],
  gis: [
    'Walk me through building a choropleth map of city population density',
    'Which projection should I use for a nationwide routing analysis?',
    'Convert this CSV of coordinates into GeoJSON step by step',
    'How do I pick the right spatial index for 10M points?',
  ],
  healthcare: [
    'Summarize this clinical trial protocol for a lay audience',
    'Draft patient-friendly discharge instructions for hypertension',
    'What belongs in the methods section of a case report?',
    'Explain the difference between sensitivity and specificity with an example',
  ],
  marketing: [
    'Write a 5-email onboarding sequence for a B2B SaaS trial',
    'Give me 10 hook ideas for a LinkedIn post about our launch',
    'Build a simple messaging framework for our rebrand',
    'How would you position us against the market leader?',
  ],
  'paid-media': [
    'Structure a $5k launch budget across Meta and Google',
    'Write three ad variations for a productivity app',
    'What metrics actually indicate a healthy funnel?',
    'Diagnose why my CTR is fine but conversions are dead',
  ],
  product: [
    'Turn this user feedback into a prioritized roadmap',
    'Write an opportunity solution tree for reducing churn',
    'What questions should a discovery interview never miss?',
    'Draft a crisp one-pager for a new feature proposal',
  ],
  'project-management': [
    'Break this messy goal into a two-week sprint plan',
    'Draft a status update that executives will actually read',
    'What risks should I flag before this launch?',
    'Design a simple RACI for a cross-team migration',
  ],
  sales: [
    'Write a cold email that gets replies in 60 words',
    'Role-play a discovery call — you be the skeptical buyer',
    'Build a qualification checklist for enterprise deals',
    'How do I handle the "your competitor is cheaper" objection?',
  ],
  security: [
    'Threat-model this login flow and rank the risks',
    'Audit this checklist for a small team moving to the cloud',
    'Explain zero-trust in terms a non-technical exec understands',
    'What should our incident response runbook contain?',
  ],
  'spatial-computing': [
    'Storyboard an onboarding experience for a visionOS app',
    'What interactions feel natural in AR without controllers?',
    'Draft a technical concept for a 3D data-viz scene',
    'How do I keep users comfortable in longer VR sessions?',
  ],
  specialized: [
    'You are my thought partner — challenge my plan from first principles',
    'What niche expertise do you bring that a generalist lacks?',
    'Give me a checklist for a problem in your exact specialty',
    'Where do most teams get this kind of work wrong?',
  ],
  support: [
    'Rewrite this angry customer reply to be calm and helpful',
    'Build a macro library for our top 10 ticket types',
    'What should our refund policy say to stay fair and firm?',
    'Turn this messy FAQ into a clean help-center article',
  ],
  testing: [
    'Write a test plan for a checkout flow with edge cases',
    'Which tests give the most confidence per minute invested?',
    'Review this QA checklist and find the gaps',
    'Set up a smoke suite for a release candidate',
  ],
}

/** Fallback openers for the virtual NEXUS generalist. */
export const NEXUS_OPENERS = [
  'Explain quantum computing like I\u2019m five',
  'Write a Python function that finds anagrams',
  'Check the BTC price and convert it to AED',
]

/** Compact relative time ("3m ago", "2h ago", "5d ago"). */
function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diff = Date.now() - then
    if (diff < 60_000) return 'just now'
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

/** Start a chat with this agent, optionally pre-filling the composer. */
function startChat(setView: (v: View) => void, agentSlug: string, prompt?: string) {
  if (prompt) {
    try {
      sessionStorage.setItem(CHAT_PREFILL_KEY, prompt)
    } catch {
      /* storage blocked — the chat still opens, just without the prefill */
    }
  }
  setView({ type: 'chat', agentSlug })
}

/**
 * Agent profile — persona card, suggested openers and the recent
 * conversations the user has had with this exact specialist.
 */
export function AgencyAgentProfile({
  agentSlug,
  setView,
}: {
  agentSlug: string
  setView: (v: View) => void
}) {
  const agent = AGENT_MAP[agentSlug]
  const division = agent ? DIVISION_MAP[agent.division] : undefined
  const [sessions, setSessions] = useState<AgencySessionItem[] | null>(null)

  useEffect(() => {
    if (!agent) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/chat/sessions?kind=chat')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        const list: AgencySessionItem[] = Array.isArray(data?.sessions) ? data.sessions : []
        if (!cancelled) {
          setSessions(
            list.filter((s) => s && typeof s === 'object' && s.agentSlug === agentSlug).slice(0, 5)
          )
        }
      } catch {
        if (!cancelled) setSessions([]) // fail soft — profile still renders
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agent, agentSlug])

  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <button
          onClick={() => setView({ type: 'roster' })}
          className="mb-6 flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to roster
        </button>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 py-16 text-center">
          <p className="text-sm font-medium text-zinc-300">Agent not found.</p>
          <p className="mt-1 text-xs text-zinc-500">
            This specialist may have left the agency. Browse the roster to find another.
          </p>
        </div>
      </div>
    )
  }

  const openers = DIVISION_OPENERS[agent.division] ?? NEXUS_OPENERS

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      {/* Back */}
      <button
        onClick={() => setView({ type: 'roster' })}
        className="mb-6 flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Roster
      </button>

      {/* Profile card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-6 md:p-8"
        aria-label={`${agent.name} profile`}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div
            className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl text-5xl"
            style={{ backgroundColor: division ? tint(division.color, 0.12) : 'rgba(113,113,122,0.12)' }}
            aria-hidden
          >
            {agent.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                {agent.name}
              </h1>
              {division && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: tint(division.color, 0.12), color: division.color }}
                >
                  <DivisionIcon division={division} className="h-3 w-3" />
                  {division.label}
                </span>
              )}
            </div>
            {agent.vibe && (
              <p className="mt-1.5 text-sm italic text-zinc-400">{agent.vibe}</p>
            )}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
              {agent.description}
            </p>
            <button
              onClick={() => startChat(setView, agent.slug)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              Start conversation
            </button>
          </div>
        </div>
      </motion.section>

      {/* Suggested openers */}
      <section className="mt-8" aria-label="Suggested openers">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Start with</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {openers.map((opener) => (
            <button
              key={opener}
              onClick={() => startChat(setView, agent.slug, opener)}
              className="group flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-left text-xs text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
            >
              <span className="line-clamp-2">{opener}</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-hover:text-amber-400"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </section>

      {/* Recent conversations with this agent */}
      <section className="mt-8" aria-label="Recent conversations">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-500" aria-hidden />
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Recent conversations
          </p>
        </div>
        {sessions === null ? (
          <div className="mt-3 space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40"
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-6 text-center text-xs text-zinc-500">
            No conversations with {agent.name} yet — start the first one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setView({ type: 'chat', agentSlug: agent.slug, sessionId: s.id })}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-200">
                      {s.title || 'Untitled conversation'}
                    </span>
                    {s.preview && (
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">
                        {s.preview}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {relativeTime(s.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
