'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Mail,
  Search,
  Sparkles,
} from 'lucide-react'
import type { AnswerSource, AnswerStep, EmailMatch } from './modes'

/**
 * Perplexity-style answer card — rendered inline in chat.
 *
 * Shows: plan steps, source cards (numbered, with favicon + host + snippet),
 * the synthesized answer with inline [N] citation markers, and follow-up
 * question chips.
 */
interface AnswerCardProps {
  query: string
  steps?: AnswerStep[]
  sources?: AnswerSource[]
  answer?: string
  followUps?: string[]
  emailMatches?: EmailMatch[]
  onFollowUp?: (q: string) => void
}

export function AnswerCard({
  query,
  steps = [],
  sources = [],
  answer = '',
  followUps = [],
  emailMatches = [],
  onFollowUp,
}: AnswerCardProps) {
  const [planOpen, setPlanOpen] = useState(false)
  const [showEmailMatches, setShowEmailMatches] = useState(emailMatches.length > 0)

  // Build a map of [n] -> source for hover/click resolution
  const sourceMap = useMemo(() => {
    const m = new Map<number, AnswerSource>()
    for (const s of sources) m.set(s.n, s)
    return m
  }, [sources])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-rose-500/10 to-amber-500/10 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold">Nexus Answer</span>
        <span className="ml-2 truncate text-xs text-muted-foreground">{query}</span>
        {sources.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {sources.length} source{sources.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Plan (collapsible) */}
      {steps.length > 0 && (
        <div className="border-b border-border/60">
          <button
            type="button"
            onClick={() => setPlanOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground transition hover:bg-secondary/40"
            aria-expanded={planOpen}
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            <span className="font-medium">Research plan</span>
            <span className="opacity-60">· {steps.length} step{steps.length === 1 ? '' : 's'}</span>
            <ChevronRight
              className={`ml-auto h-3.5 w-3.5 transition-transform ${planOpen ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
            {planOpen && (
              <motion.ol
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                {steps.map((s, i) => (
                  <li key={s.id} className="flex gap-2.5 py-1.5 text-xs">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{s.query}</span>
                      {s.reason && (
                        <span className="block text-[11px] text-muted-foreground/80">{s.reason}</span>
                      )}
                    </span>
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Email matches (if includeEmail was on) */}
      {emailMatches.length > 0 && (
        <div className="border-b border-border/60">
          <button
            type="button"
            onClick={() => setShowEmailMatches((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground transition hover:bg-secondary/40"
            aria-expanded={showEmailMatches}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            <span className="font-medium">Your inbox</span>
            <span className="opacity-60">· {emailMatches.length} match{emailMatches.length === 1 ? '' : 'es'}</span>
            <ChevronRight
              className={`ml-auto h-3.5 w-3.5 transition-transform ${showEmailMatches ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
            {showEmailMatches && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                {emailMatches.map((m, i) => (
                  <li key={i} className="border-l-2 border-primary/30 py-1.5 pl-2.5 text-xs">
                    <p className="truncate font-medium text-foreground">{m.subject}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.from}
                      {m.date ? ` · ${new Date(m.date).toLocaleDateString()}` : ''}
                    </p>
                    {m.snippet && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/80">{m.snippet}</p>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Answer (with inline [N] citations) */}
      {answer && (
        <div className="px-4 py-4">
          <CitationMarkdown content={answer} sourceMap={sourceMap} />
        </div>
      )}

      {/* Sources grid */}
      {sources.length > 0 && (
        <div className="border-t border-border/60 bg-secondary/20 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            <Search className="h-3 w-3" aria-hidden /> Sources
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sources.map((s) => (
              <a
                key={s.n}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2.5 rounded-lg border border-border/50 bg-card p-2.5 transition hover:border-primary/40 hover:bg-secondary/40"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {s.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {s.favicon ? (
                      <img
                        src={s.favicon}
                        alt=""
                        className="h-3 w-3 rounded-sm"
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <span className="flex h-3 w-3 items-center justify-center rounded-sm bg-secondary text-[7px] font-bold uppercase">
                        {s.host?.replace(/^www\./, '')?.slice(0, 1) || '?'}
                      </span>
                    )}
                    <span className="truncate">{s.host}</span>
                    {s.date && <span className="shrink-0 opacity-70">· {s.date}</span>}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-xs font-medium text-foreground group-hover:text-primary">
                    {s.title}
                  </span>
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 transition group-hover:text-primary" aria-hidden />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up questions */}
      {followUps.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Related questions
          </p>
          <div className="flex flex-col gap-1.5">
            {followUps.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (onFollowUp) {
                    onFollowUp(q)
                  } else if (typeof window !== 'undefined') {
                    // Decoupled fallback: dispatch a global event that page.tsx listens for
                    window.dispatchEvent(new CustomEvent('nexus:send-message', { detail: q }))
                  }
                }}
                className="group flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-left text-xs text-foreground transition hover:border-primary/40 hover:bg-secondary/40"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </span>
                <span className="flex-1">{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

/**
 * Renders the synthesized answer as Markdown, but enhances inline [N]
 * citation markers so they become clickable superscript badges linking
 * to the matching source. We transform `[N]` -> `[N](sourceUrl)` and
 * use a custom `a` renderer that detects single-number children.
 */
function CitationMarkdown({
  content,
  sourceMap,
}: {
  content: string
  sourceMap: Map<number, AnswerSource>
}) {
  // Preprocess: turn [N] markers into markdown links pointing at the source URL.
  // If the source is missing, fall back to a #cite-N anchor.
  const processed = useMemo(() => {
    return content.replace(/\[(\d+)\]/g, (full, numStr: string) => {
      const n = parseInt(numStr, 10)
      const src = sourceMap.get(n)
      const url = src?.url ?? `#cite-${n}`
      // Use a special prefix so our custom `a` renderer can identify it.
      return `[${numStr}](nexus-cite:${url})`
    })
  }, [content, sourceMap])

  return (
    <div className="omni-prose text-[14px] leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('nexus-cite:')) {
              const realUrl = href.slice('nexus-cite:'.length)
              // children is the source number as a string
              const num = parseInt(String(children ?? ''), 10)
              const src = sourceMap.get(num)
              return (
                <a
                  href={realUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={src ? `${src.title} — ${src.host}` : `Source ${num}`}
                  className="mx-0.5 inline-flex h-4 min-w-[16px] -translate-y-1 items-center justify-center rounded-full bg-primary/15 px-1 align-super text-[9px] font-bold text-primary no-underline transition hover:bg-primary hover:text-primary-foreground"
                >
                  {num}
                </a>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {children}
              </a>
            )
          },
          code: (props) => {
            const { className, children } = props as { className?: string; children?: React.ReactNode }
            const match = /language-(\w+)/.exec(className || '')
            const codeText = String(children ?? '').replace(/\n$/, '')
            if (!match && !codeText.includes('\n')) {
              return <code className={className}>{children}</code>
            }
            return (
              <pre className="omni-scroll my-2 overflow-auto rounded-lg bg-[oklch(0.16_0.015_295)] p-3 text-[12px] leading-relaxed text-[oklch(0.88_0.005_80)]">
                <code>{codeText}</code>
              </pre>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Email-sent confirmation card.
 */
export function EmailSentCard({
  to,
  subject,
  body,
  messageId,
  needsConnect,
  onConnect,
}: {
  to?: string
  subject?: string
  body?: string
  messageId?: string
  needsConnect?: boolean
  onConnect?: () => void
}) {
  if (needsConnect) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Mail className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Connect your email to send</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              I drafted your email, but no email account is connected yet. Connect Gmail,
              Outlook, or another provider to send and read email from Nexus.
            </p>
            {subject && (
              <p className="mt-2 rounded-lg bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Draft subject:</span> {subject}
              </p>
            )}
            <button
              type="button"
              onClick={onConnect}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:brightness-110"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden /> Connect email
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        <span className="text-sm font-semibold text-emerald-700">Email sent</span>
        {messageId && (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">ID {messageId.slice(0, 24)}…</span>
        )}
      </div>
      <div className="space-y-1.5 px-4 py-3 text-xs">
        <p className="flex gap-2">
          <span className="font-semibold text-muted-foreground">To:</span>
          <span className="text-foreground">{to}</span>
        </p>
        <p className="flex gap-2">
          <span className="font-semibold text-muted-foreground">Subject:</span>
          <span className="text-foreground">{subject}</span>
        </p>
        {body && (
          <div className="mt-2">
            <span className="font-semibold text-muted-foreground">Body:</span>
            <pre className="omni-scroll mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/50 p-2.5 text-[11px] leading-relaxed text-foreground">
              {body.slice(0, 800)}
              {body.length > 800 ? '…' : ''}
            </pre>
          </div>
        )}
      </div>
    </motion.div>
  )
}
