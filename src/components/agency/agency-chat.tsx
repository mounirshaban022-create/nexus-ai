'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'
import { Markdown } from '@/components/omni/markdown'
import {
  agentOrNexus,
  divisionOf,
  type AgencyMessage,
  type ChatStreamEvent,
  type View,
  tint,
} from './shared'
import { CHAT_PREFILL_KEY, DIVISION_OPENERS, NEXUS_OPENERS } from './agent-profile'

/* ------------------------------------------------------------------ */
/* Local message model (extends the shared AgencyMessage)              */
/* ------------------------------------------------------------------ */

interface ChatMsg extends AgencyMessage {
  /** Live tool-chip state for role:'tool' rows. */
  toolStatus?: 'running' | 'done' | 'error'
  toolMessage?: string
  toolIndex?: number
  /** Rendered as a red error bubble. */
  isError?: boolean
}

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web',
  read_page: 'Reading page',
  generate_image: 'Creating image',
  create_document: 'Building document',
  create_spreadsheet: 'Building spreadsheet',
  run_code: 'Running code',
  pdf_operation: 'Editing PDF',
  edit_document: 'Editing document',
}

function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name]
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ------------------------------------------------------------------ */
/* Attachments (V1 — robust, every field guarded)                      */
/* ------------------------------------------------------------------ */

function AttachmentCard({ item }: { item: unknown }) {
  if (!item || typeof item !== 'object') return null
  const a = item as { type?: unknown; url?: unknown; title?: unknown }
  const type = typeof a.type === 'string' ? a.type : ''
  const url = typeof a.url === 'string' ? a.url : ''
  const title = typeof a.title === 'string' && a.title ? a.title : ''

  if (type === 'image' && url) {
    return (
      // Generated images are dynamic same-origin URLs — plain <img> is correct here.
      <img
        src={url}
        alt={title || 'Generated image'}
        loading="lazy"
        className="w-full max-w-sm rounded-xl border border-border/60"
      />
    )
  }

  if (type === 'document' && url) {
    return (
      <a
        href={url}
        download
        aria-label={title ? `Download ${title}` : 'Download document'}
        className="flex max-w-sm items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 transition hover:border-border"
      >
        <FileText className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{title || 'Document'}</span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
      </a>
    )
  }

  return (
    <div className="flex max-w-sm items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
      <span className="truncate text-xs text-muted-foreground">{title || type || 'Attachment'}</span>
    </div>
  )
}

function AttachmentList({ items }: { items: unknown[] | undefined }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((item, i) => (
        <AttachmentCard key={i} item={item} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Message subcomponents                                               */
/* ------------------------------------------------------------------ */

function ThinkingPanel({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-[32px] items-center gap-1.5 text-xs text-muted-foreground/80 transition hover:text-muted-foreground"
      >
        <Brain className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        Thought process
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <p className="mt-1 whitespace-pre-wrap border-l-2 border-amber-400/30 pl-3 text-xs italic leading-relaxed text-muted-foreground/80">
          {thinking}
        </p>
      )}
    </div>
  )
}

function ToolChip({ msg }: { msg: ChatMsg }) {
  const label = toolLabel(msg.toolName ?? '')
  return (
    <div className="flex justify-start pl-11" role="status" aria-label={label}>
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
          msg.toolStatus === 'error'
            ? 'border-red-900/50 bg-red-950/30 text-red-300'
            : msg.toolStatus === 'done'
              ? 'border-border/60 bg-muted/40 text-muted-foreground/80'
              : 'border-border bg-muted/60 text-muted-foreground'
        }`}
      >
        {msg.toolStatus === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" aria-hidden />
        ) : msg.toolStatus === 'error' ? (
          <X className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        )}
        <span className="max-w-[260px] truncate sm:max-w-md">
          {msg.toolMessage && msg.toolStatus === 'running' ? msg.toolMessage : label}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The chat view                                                       */
/* ------------------------------------------------------------------ */

export function AgencyChat({
  agentSlug,
  sessionId,
  setView,
}: {
  agentSlug: string | null
  sessionId?: string
  setView: (v: View) => void
}) {
  const agent = agentOrNexus(agentSlug)
  const division = divisionOf(agent)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(sessionId)
  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const userScrolledUpRef = useRef(false)
  const streamIdRef = useRef<string | null>(null)
  /** Smooth word-by-word reveal queue (same system as nexus/chat.tsx). */
  const revealRef = useRef<{ id: string; backlog: string; ended: boolean }>({
    id: '',
    backlog: '',
    ended: true,
  })
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* ---------- prefill a suggested opener into the composer ---------- */
  useEffect(() => {
    try {
      const p = sessionStorage.getItem(CHAT_PREFILL_KEY)
      if (p) {
        sessionStorage.removeItem(CHAT_PREFILL_KEY)
        setInput(p)
      }
    } catch {
      /* storage blocked — open a plain empty composer */
    }
  }, [])

  /* ---------- load an existing session (mount + navigation) ---------- */
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`)
        if (!res.ok) return
        const data = await res.json()
        const s = data?.session
        if (cancelled || !s) return
        const rows: AgencyMessage[] = Array.isArray(s.messages) ? s.messages : []
        setMessages(
          rows
            .filter((m) => !!m && typeof m === 'object')
            .map((m, i) => ({
              id: typeof m.id === 'string' ? m.id : `m-${i}`,
              role: m.role === 'user' ? 'user' : m.role === 'tool' ? 'tool' : 'assistant',
              content: typeof m.content === 'string' ? m.content : '',
              thinking: typeof m.thinking === 'string' ? m.thinking : null,
              toolName: typeof m.toolName === 'string' ? m.toolName : null,
              toolStatus: m.role === 'tool' ? 'done' : undefined,
            }))
        )
        setActiveSessionId(typeof s.id === 'string' ? s.id : sessionId)
      } catch {
        /* failed to load — fall back to an empty transcript */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  /* ---------- abort any live stream on unmount ---------- */
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  /* ---------- auto-scroll while the user is near the bottom ---------- */
  useEffect(() => {
    const el = scrollRef.current
    if (!el || userScrolledUpRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distFromBottom > 150
  }

  /* ---------- textarea auto-resize ---------- */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  /* ---------- streaming helpers ---------- */

  const appendToMessage = useCallback((id: string, delta: string) => {
    if (!id || !delta) return
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
    )
  }, [])

  /* ---------- SMOOTH WORD-BY-WORD REVEAL ----------
   * Same paced queue as the main chat: a 30ms tick releases a few
   * characters at a time with automatic catch-up, so text ALWAYS
   * renders word-by-word regardless of how the provider delivers it. */
  const ensureRevealLoop = useCallback(() => {
    if (revealTimerRef.current) return
    revealTimerRef.current = setInterval(() => {
      const st = revealRef.current
      if (!st.id) return
      if (!st.backlog) {
        if (st.ended) {
          if (revealTimerRef.current) clearInterval(revealTimerRef.current)
          revealTimerRef.current = null
          st.id = ''
        }
        return
      }
      let pace = 2 + Math.ceil(st.backlog.length / 40)
      if (st.ended) pace *= 2
      const chunk = st.backlog.slice(0, Math.min(80, pace))
      st.backlog = st.backlog.slice(chunk.length)
      appendToMessage(st.id, chunk)
    }, 30)
  }, [appendToMessage])

  const queueReveal = useCallback(
    (id: string, text: string, ended = false) => {
      if (!id || !text) return
      const st = revealRef.current
      if (st.id !== id) {
        if (st.id && st.backlog) appendToMessage(st.id, st.backlog)
        st.id = id
        st.backlog = ''
        st.ended = false
      }
      st.backlog += text
      if (ended) st.ended = true
      ensureRevealLoop()
    },
    [appendToMessage, ensureRevealLoop]
  )

  const endReveal = useCallback(() => {
    const st = revealRef.current
    if (st.id) st.ended = true
    ensureRevealLoop()
  }, [ensureRevealLoop])

  const flushRevealNow = useCallback(() => {
    const st = revealRef.current
    if (st.id && st.backlog) appendToMessage(st.id, st.backlog)
    st.backlog = ''
    st.ended = true
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }, [appendToMessage])


  /** Patch the live tool chip that matches (toolName, index). */
  const updateToolMessage = useCallback(
    (tool: string, index: number, patch: Partial<ChatMsg>) => {
      setMessages((prev) => {
        let target = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i]
          if (m.role === 'tool' && m.toolName === tool && m.toolIndex === index) {
            target = i
            break
          }
        }
        if (target === -1) {
          for (let i = prev.length - 1; i >= 0; i--) {
            const m = prev[i]
            if (m.role === 'tool' && m.toolName === tool && m.toolStatus === 'running') {
              target = i
              break
            }
          }
        }
        if (target === -1) return prev
        const copy = [...prev]
        copy[target] = { ...copy[target], ...patch }
        return copy
      })
    },
    []
  )

  /* ---------- send ---------- */

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      const userMsg: ChatMsg = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setStreaming(true)
      userScrolledUpRef.current = false

      abortRef.current = new AbortController()
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            ...(activeSessionId ? { sessionId: activeSessionId } : {}),
            thinking: thinkingEnabled,
            language: 'en',
            ...(agentSlug ? { agentSlug } : {}),
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || 'Chat request failed.')
        }

        // Consume the NDJSON stream (same protocol as omni/chat-mode)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const text = line.trim()
            if (!text) continue
            let event: ChatStreamEvent
            try {
              event = JSON.parse(text) as ChatStreamEvent
            } catch {
              continue // partial / malformed line — skip
            }

            switch (event.type) {
              case 'user': {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === userMsg.id ? { ...m, id: event.id, content: event.content } : m
                  )
                )
                break
              }
              case 'assistant_start': {
                streamIdRef.current = event.id
                setMessages((prev) => [
                  ...prev,
                  { id: event.id, role: 'assistant', content: '', streaming: true },
                ])
                break
              }
              case 'assistant_delta': {
                const id = streamIdRef.current
                if (id) queueReveal(id, event.delta)
                break
              }
              case 'assistant_end': {
                endReveal()
                const id = streamIdRef.current
                streamIdRef.current = null
                if (id) {
                  const attachments = Array.isArray(event.attachments) ? event.attachments : []
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === id
                        ? {
                            ...m,
                            streaming: false,
                            ...(attachments.length > 0 ? { attachments } : {}),
                          }
                        : m
                    )
                  )
                }
                break
              }
              case 'assistant': {
                // Full-message fallback (non-streaming providers) -
                // revealed word-by-word through the same paced queue.
                const attachments = Array.isArray(event.attachments) ? event.attachments : []
                const id = streamIdRef.current
                streamIdRef.current = null
                if (id) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === id
                        ? {
                            ...m,
                            content: '',
                            streaming: false,
                            ...(attachments.length > 0 ? { attachments } : {}),
                          }
                        : m
                    )
                  )
                  queueReveal(id, event.content, true)
                } else {
                  const freshId = `a-${Date.now()}`
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: freshId,
                      role: 'assistant',
                      content: '',
                      ...(attachments.length > 0 ? { attachments } : {}),
                    },
                  ])
                  queueReveal(freshId, event.content, true)
                }
                break
              }
              case 'tool_start': {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `tool-${event.index}-${Date.now()}`,
                    role: 'tool',
                    content: '',
                    toolName: event.tool,
                    toolIndex: event.index,
                    toolStatus: 'running',
                  },
                ])
                break
              }
              case 'tool_progress': {
                updateToolMessage(event.tool, event.index, { toolMessage: event.message })
                break
              }
              case 'tool_result': {
                updateToolMessage(event.tool, event.index, {
                  toolStatus: event.ok ? 'done' : 'error',
                })
                break
              }
              case 'done': {
                setActiveSessionId(event.sessionId)
                break
              }
              case 'error': {
                throw new Error(event.message)
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Error path — stop animating and show whatever text arrived.
        flushRevealNow()
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              error instanceof Error
                ? `Something went wrong: ${error.message}`
                : 'Something went wrong. Please try again.',
            isError: true,
          },
        ])
      } finally {
        endReveal()
        streamIdRef.current = null
        setStreaming(false)
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
      }
    },
    [activeSessionId, streaming, thinkingEnabled, agentSlug, queueReveal, endReveal, flushRevealNow, updateToolMessage]
  )

  const startNew = () => {
    if (streaming) abortRef.current?.abort()
    setMessages([])
    setActiveSessionId(undefined)
    setInput('')
    streamIdRef.current = null
    setStreaming(false)
    textareaRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const openers = division ? DIVISION_OPENERS[division.id] ?? NEXUS_OPENERS : NEXUS_OPENERS
  const suggestions = openers.slice(0, 3)
  const canSend = input.trim().length > 0 && !streaming

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col md:h-screen">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <button
          onClick={() => setView(agentSlug ? { type: 'agent', agentSlug } : { type: 'home' })}
          aria-label={agentSlug ? `Back to ${agent.name} profile` : 'Back to home'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
            style={{
              backgroundColor: division ? tint(division.color, 0.12) : 'rgba(113,113,122,0.12)',
            }}
            aria-hidden
          >
            {agent.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
            {division && (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: tint(division.color, 0.12), color: division.color }}
              >
                {division.label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={startNew}
          aria-label="New conversation"
          title="New conversation"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="agency-scroll [scrollbar-width:thin] flex-1 overflow-y-auto"
        aria-label={`Conversation with ${agent.name}`}
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
          {messages.length === 0 && !streaming ? (
            /* Empty state */
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex flex-col items-center pt-10 text-center md:pt-20"
            >
              <div
                className="grid h-20 w-20 place-items-center rounded-2xl text-5xl"
                style={{
                  backgroundColor: division
                    ? tint(division.color, 0.12)
                    : 'rgba(113,113,122,0.12)',
                }}
                aria-hidden
              >
                {agent.emoji}
              </div>
              <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
                {agent.name}
              </h2>
              {agent.vibe && <p className="mt-1.5 text-sm italic text-muted-foreground/80">{agent.vibe}</p>}
              <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground/80">
                {agent.description}
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-2 sm:items-center">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="min-h-[44px] rounded-xl border border-border bg-muted/60 px-4 py-2.5 text-left text-sm text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground sm:min-w-[320px]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-3 text-sm leading-relaxed text-foreground">
                    {m.content}
                  </div>
                </div>
              ) : m.role === 'tool' ? (
                <ToolChip key={m.id} msg={m} />
              ) : (
                <div key={m.id} className="flex gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base"
                    style={{
                      backgroundColor: division
                        ? tint(division.color, 0.12)
                        : 'rgba(113,113,122,0.12)',
                    }}
                    aria-hidden
                  >
                    {agent.emoji}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border/60 bg-muted/80 px-4 py-3">
                    {m.thinking ? <ThinkingPanel thinking={m.thinking} /> : null}
                    {m.isError ? (
                      <p className="text-sm leading-relaxed text-red-400">{m.content}</p>
                    ) : m.streaming && !m.content ? (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground/80">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
                        thinking…
                      </span>
                    ) : (
                      /* Theme-aware prose (no forced `dark` wrapper — it made
                         bold/links invisible in light mode) */
                      <div className="text-sm text-foreground">
                        <Markdown content={m.content} />
                        {m.streaming && (
                          <span
                            className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-amber-400 align-text-bottom"
                            aria-hidden
                          />
                        )}
                      </div>
                    )}
                    <AttachmentList items={m.attachments} />
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/60 p-3 md:p-4">
        <div className="mx-auto w-full max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-muted p-2 transition focus-within:border-border"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={`Message ${agent.name}…`}
              aria-label={`Message ${agent.name}`}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              aria-pressed={thinkingEnabled}
              aria-label="Toggle deep thinking"
              title="Deep thinking"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                thinkingEnabled
                  ? 'bg-amber-400/15 text-amber-400'
                  : 'text-muted-foreground/80 hover:bg-accent hover:text-muted-foreground'
              }`}
            >
              <Brain className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-foreground transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden />
              )}
            </button>
          </form>
          <p className="mt-2 px-1 text-center text-[10px] text-muted-foreground/80">
            {agent.name} can use NEXUS superpowers — images, documents, code, live data & search.
          </p>
        </div>
      </div>
    </div>
  )
}
