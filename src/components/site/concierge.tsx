'use client'

/**
 * NEXUS Concierge — the official website's AI host.
 *
 * THE headline feature of the site: it TALKS with visitors.
 *  • Floating glass widget on every screen + proactive greeting bubble
 *  • Real LLM conversation via /api/concierge (no account needed)
 *  • Speaks its answers aloud (Edge neural voice → Z.ai fallback)
 *  • Inline <ConciergePanel> reuses the same engine for the demo section
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandMark } from '@/components/nexus/shared'
import { cn } from '@/lib/utils'
import {
  Bot,
  CornerDownLeft,
  Ear,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Shared chat state                                                   */
/* ------------------------------------------------------------------ */

export interface ConciergeMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Client-side scripted greeting (not persisted, not sent upstream). */
  local?: boolean
  error?: boolean
}

export const CONCIERGE_SUGGESTIONS = [
  'What is NEXUS?',
  'What can it actually do?',
  'Is it free to try?',
  'Tell me about voice calls',
  'Can it edit my photos?',
  'How do the 255 agents work?',
]

const WELCOME: ConciergeMsg = {
  id: 'welcome',
  role: 'assistant',
  local: true,
  content:
    "Hi, I'm the NEXUS Concierge — the AI that hosts this website. Ask me anything about NEXUS, or tell me what you'd love to get done, and I'll show you how it happens.",
}

let msgSeq = 0
const nextId = () => `m${++msgSeq}-${Date.now().toString(36)}`

export function useConciergeChat() {
  const [messages, setMessages] = useState<ConciergeMsg[]>([WELCOME])
  const [sending, setSending] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(false)

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || sending) return

      const userMsg: ConciergeMsg = { id: nextId(), role: 'user', content: text }
      const history = [...messages, userMsg].filter((m) => !m.local && !m.error)
      setMessages(history)
      setSending(true)

      try {
        const res = await fetch('/api/concierge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string }
        if (!res.ok || !data.reply) {
          throw new Error(data.error || 'The concierge could not reply.')
        }
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', content: data.reply as string }])
        if (speakReplies) void speak(data.reply)
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            error: true,
            content:
              err instanceof Error
                ? err.message
                : 'Something glitched on my side — could you say that again?',
          },
        ])
      } finally {
        setSending(false)
      }
    },
    [messages, sending, speakReplies]
  )

  const reset = useCallback(() => {
    setMessages([WELCOME])
  }, [])

  return { messages, sending, send, reset, speakReplies, setSpeakReplies }
}

/* ------------------------------------------------------------------ */
/* Voice — neural speech for concierge replies                         */
/* ------------------------------------------------------------------ */

const voiceCache = new Map<string, string>()

async function speak(text: string): Promise<void> {
  try {
    let url = voiceCache.get(text)
    if (!url) {
      const res = await fetch('/api/concierge/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 400) }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      url = URL.createObjectURL(blob)
      voiceCache.set(text, url)
      if (voiceCache.size > 24) {
        const oldest = voiceCache.keys().next().value
        if (oldest) {
          const old = voiceCache.get(oldest)
          if (old) URL.revokeObjectURL(old)
          voiceCache.delete(oldest)
        }
      }
    }
    const audio = new Audio(url)
    await audio.play()
  } catch {
    /* autoplay or network hiccup — stay silent */
  }
}

/* ------------------------------------------------------------------ */
/* Panel — message thread + composer (widget & inline demo)            */
/* ------------------------------------------------------------------ */

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Concierge is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#ff5a5f]"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2.5, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

export function ConciergePanel({
  className,
  onNavigateAway,
  compact = false,
}: {
  className?: string
  onNavigateAway?: () => void
  compact?: boolean
}) {
  const { messages, sending, send, reset, speakReplies, setSpeakReplies } = useConciergeChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Stick to the newest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const submit = () => {
    const text = draft
    if (!text.trim() || sending) return
    setDraft('')
    void send(text)
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* Thread */}
      <div
        ref={scrollRef}
        className="site-scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div className={cn('max-w-[85%]', m.role === 'user' && 'text-right')}>
              {m.role === 'assistant' && !m.local && (
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <Bot className="h-3 w-3" aria-hidden />
                  Concierge
                  {!m.error && (
                    <button
                      type="button"
                      onClick={() => void speak(m.content)}
                      aria-label="Play this reply aloud"
                      className="ml-1 rounded-full p-0.5 text-muted-foreground/60 transition hover:text-[#ff5a5f]"
                    >
                      <Volume2 className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </div>
              )}
              <div
                className={cn(
                  'rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'nx-gradient-surface rounded-br-md text-white'
                    : m.error
                      ? 'rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive'
                      : 'rounded-bl-md border border-border/80 bg-muted/70 text-foreground/90'
                )}
              >
                {m.content}
              </div>
            </div>
          </motion.div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-border/80 bg-muted/70 px-3.5 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
        {(compact ? CONCIERGE_SUGGESTIONS.slice(0, 3) : CONCIERGE_SUGGESTIONS.slice(0, 4)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={sending}
            className="rounded-full border border-border/80 bg-background/60 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:border-[#ff5a5f]/40 hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        className="border-t border-border/60 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the concierge anything…"
            aria-label="Message the NEXUS concierge"
            maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background/80 px-4 text-[13px] outline-none transition placeholder:text-muted-foreground/60 focus:border-[#ff5a5f]/50 focus:ring-2 focus:ring-[#ff5a5f]/20"
          />
          <button
            type="button"
            onClick={() => setSpeakReplies(!speakReplies)}
            aria-label={speakReplies ? 'Mute concierge voice' : 'Have the concierge speak replies aloud'}
            aria-pressed={speakReplies}
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-full border transition',
              speakReplies
                ? 'border-[#ff5a5f]/50 bg-[#ff5a5f]/15 text-[#ff5a5f]'
                : 'border-border/80 text-muted-foreground hover:text-foreground'
            )}
          >
            {speakReplies ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="nx-gradient-surface grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-50"
          >
            <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {onNavigateAway && (
          <button
            type="button"
            onClick={() => {
              reset()
              onNavigateAway()
            }}
            className="mx-auto mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 transition hover:text-[#ff5a5f]"
          >
            <Ear className="h-3 w-3" aria-hidden />
            That&apos;s enough talking — launch the real NEXUS
          </button>
        )}
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Widget — floating bubble + proactive greeting                       */
/* ------------------------------------------------------------------ */

export function ConciergeWidget({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [teaser, setTeaser] = useState(false)
  const openRef = useRef(open)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirror the latest `open` into the ref (ref writes belong in effects).
  useEffect(() => {
    openRef.current = open
  }, [open])

  // Proactive greeting: after 7s the concierge waves first (once per visit).
  // Fires only if the widget was never opened — event-safe via ref guard.
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!openRef.current) setTeaser(true)
    }, 7000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Event-driven dismissal — opening the widget retires the teaser forever.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setTeaser(false)
        if (timerRef.current) clearTimeout(timerRef.current)
      }
      onOpenChange(next)
    },
    [onOpenChange]
  )

  return (
    <>
      {/* Floating launcher */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {teaser && !open && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.21, 1.02, 0.73, 1] }}
              onClick={() => handleOpenChange(true)}
              className="nx-glow-card relative max-w-[240px] rounded-2xl rounded-br-md bg-card/95 px-4 py-3 text-left text-[12.5px] leading-snug text-foreground/90 backdrop-blur-xl"
            >
              <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#ff2a68] text-white" aria-hidden>
                <X className="h-3 w-3" />
              </span>
              <span aria-hidden className="mr-1">👋</span>
              I&apos;m NEXUS — the AI that runs this site. Want a quick tour? Just say hi.
            </motion.button>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => handleOpenChange(!open)}
          aria-label={open ? 'Close the NEXUS concierge chat' : 'Chat with the NEXUS concierge'}
          aria-expanded={open}
          className="relative grid h-14 w-14 place-items-center rounded-full nx-gradient-surface shadow-xl"
        >
          {!open && (
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#ff5a5f]/30 [animation-duration:2.4s]" />
          )}
          {open ? (
            <X className="relative h-6 w-6" aria-hidden />
          ) : (
            <BrandMark size={26} className="relative" />
          )}
        </button>
      </div>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="NEXUS concierge chat"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.32, ease: [0.21, 1.02, 0.73, 1] }}
            className="fixed bottom-[5.75rem] right-4 top-20 z-50 flex h-auto w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border/80 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:right-6"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/60 bg-background/60 px-4 py-3">
              <span className="nx-aura relative grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-background/80">
                <BrandMark size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold">NEXUS Concierge</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Online — replies instantly
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close concierge"
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" aria-hidden />
              </button>
            </header>

            <ConciergePanel className="flex-1" />
          </motion.section>
        )}
      </AnimatePresence>
    </>
  )
}
