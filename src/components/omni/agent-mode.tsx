'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronDown,
  History,
  ListChecks,
  Loader2,
  PlugZap,
  Plus,
  Send,
  Trash2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from './markdown'
import { useConnectorsStore } from './connectors-store'
import type { AgentEvent, ChatMessageItem, ChatSessionItem } from './modes'
import { useToast } from '@/hooks/use-toast'

const AGENT_TASKS = [
  "Check my inbox and summarize the latest emails",
  'Compare the 3 most-starred GitHub repos for AI chatbots',
  "What's the BTC price and USD to AED rate right now?",
  'Geocode the Eiffel Tower and give me its weather forecast',
]

/** A single tool execution step card. */
function ToolStep({
  tool,
  args,
  result,
  status,
}: {
  tool: string
  args: Record<string, unknown>
  result?: unknown
  status: 'running' | 'done' | 'error'
}) {
  const [open, setOpen] = useState(false)
  const resultText = result !== undefined ? JSON.stringify(result, null, 2) : ''

  return (
    <div className="ml-4 w-full max-w-[92%] sm:max-w-[80%]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition ${
          status === 'error'
            ? 'border-destructive/30 bg-destructive/10'
            : status === 'running'
              ? 'border-sky-200 bg-sky-50'
              : 'border-border/60 bg-card/70 hover:border-border'
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50">
          <Wrench className="h-3.5 w-3.5 text-sky-700" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="font-semibold text-sky-700">{tool}</span>
            <span className="text-muted-foreground">
              {Object.entries(args)
                .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
                .join('  ·  ') || 'no arguments'}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-700" aria-hidden />}
          {status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-400" aria-hidden />}
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <pre className="omni-scroll mx-2 mt-1.5 max-h-64 overflow-auto rounded-lg border border-border/60 bg-background/80 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {resultText || 'Waiting for result…'}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AgentMode() {
  const { toast } = useToast()
  const enabledConnectors = useConnectorsStore((s) => s.enabled)

  const [events, setEvents] = useState<AgentEvent[]>([])
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions?kind=agent')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  const run = useCallback(
    async (task: string) => {
      const trimmed = task.trim()
      if (!trimmed || running) return
      setInput('')
      setRunning(true)
      setEvents((prev) => [
        ...prev,
        { type: 'user', id: `local-${Date.now()}`, content: trimmed },
      ])
      scrollToBottom()

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, sessionId, connectors: enabledConnectors }),
        })

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || 'Agent run failed.')
        }

        // Read the NDJSON stream live
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
            try {
              const event = JSON.parse(text) as AgentEvent
              setEvents((prev) => [...prev, event])
              if (event.type === 'done') setSessionId(event.sessionId)
              if (event.type === 'error') {
                toast({ title: 'Agent error', description: event.message, variant: 'destructive' })
              }
              scrollToBottom()
            } catch {
              /* skip malformed line */
            }
          }
        }
        refreshSessions()
      } catch (error) {
        toast({
          title: 'Agent failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
        setEvents((prev) => [
          ...prev.filter((e) => !(e.type === 'user' && e.id.startsWith('local-'))),
        ])
        setInput(trimmed)
      } finally {
        setRunning(false)
      }
    },
    [running, sessionId, enabledConnectors, scrollToBottom, refreshSessions, toast]
  )

  const loadSession = useCallback(
    async (id: string) => {
      if (running) return
      setHistoryOpen(false)
      try {
        const res = await fetch(`/api/chat/sessions/${id}`)
        if (!res.ok) throw new Error('Run not found.')
        const data = await res.json()
        setSessionId(data.session.id)
        // Reconstruct the stream events from persisted messages
        const reconstructed: AgentEvent[] = []
        for (const m of data.session.messages as ChatMessageItem[]) {
          if (m.role === 'user') {
            reconstructed.push({ type: 'user', id: m.id, content: m.content })
          } else if (m.role === 'tool') {
            let args: Record<string, unknown> = {}
            try {
              args = m.toolData ? (JSON.parse(m.toolData).args ?? {}) : {}
            } catch {
              /* ignore */
            }
            reconstructed.push({ type: 'tool_start', tool: m.toolName ?? 'tool', args, index: 0 })
            reconstructed.push({
              type: 'tool_result',
              id: m.id,
              tool: m.toolName ?? 'tool',
              ok: true,
              result: safeParse(m.content),
              index: 0,
            })
          } else {
            reconstructed.push({ type: 'assistant', id: m.id, content: m.content })
          }
        }
        setEvents(reconstructed)
        setTimeout(() => scrollToBottom(), 60)
      } catch (error) {
        toast({
          title: 'Could not open run',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    },
    [running, scrollToBottom, toast]
  )

  const deleteSession = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const res = await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSessions((prev) => prev.filter((s) => s.id !== id))
        if (sessionId === id) {
          setSessionId(null)
          setEvents([])
        }
      } catch {
        toast({ title: 'Could not delete run', variant: 'destructive' })
      }
    },
    [sessionId, toast]
  )

  const activeSession = sessions.find((s) => s.id === sessionId)
  const hasContent = events.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-sm font-semibold sm:text-base">
            <Bot className="h-4.5 w-4.5 shrink-0 text-sky-700" aria-hidden />
            {activeSession?.title ?? 'Agent'}
          </h2>
          <p className="text-xs text-muted-foreground">
            Autonomous mode · {enabledConnectors.length} connector
            {enabledConnectors.length === 1 ? '' : 's'} armed
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-lg">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Runs</span>
                {sessions.length > 0 && (
                  <span className="rounded-full bg-sky-100 px-1.5 text-[11px] font-semibold text-sky-700">
                    {sessions.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0 sm:w-96">
              <SheetHeader className="border-b border-border/60 px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-sky-700" /> Agent runs
                </SheetTitle>
              </SheetHeader>
              <div className="border-b border-border/60 p-3">
                <Button
                  onClick={() => {
                    setSessionId(null)
                    setEvents([])
                    setHistoryOpen(false)
                  }}
                  className="w-full gap-2 rounded-lg bg-primary text-primary-foreground hover:brightness-110"
                >
                  <Plus className="h-4 w-4" /> New run
                </Button>
              </div>
              <ScrollArea className="omni-scroll flex-1">
                <div className="flex flex-col gap-1 p-2">
                  {sessions.length === 0 && (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No agent runs yet.
                    </p>
                  )}
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSession(s.id)}
                      className={`group flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                        s.id === sessionId
                          ? 'border-sky-200 bg-sky-50'
                          : 'border-transparent hover:border-border/60 hover:bg-secondary/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.preview || '…'}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {new Date(s.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Delete run ${s.title}`}
                        onClick={(e) => deleteSession(s.id, e)}
                        onKeyDown={(e) => e.key === 'Enter' && deleteSession(s.id, e as unknown as React.MouseEvent)}
                        className="mt-0.5 rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (running) return
              setSessionId(null)
              setEvents([])
              setInput('')
            }}
            className="gap-2 rounded-lg"
            aria-label="Start new agent run"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </header>

      {/* Stream */}
      <div ref={scrollRef} className="omni-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {!hasContent && !running && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="omni-glow mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
                <Bot className="h-8 w-8 text-white" aria-hidden />
              </div>
              <h3 className="text-xl font-bold sm:text-2xl">
                Meet the <span className="omni-text-gradient">NEXUS Agent</span>.
              </h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Give it a mission. It plans, calls live connectors — search, weather, GitHub,
                Wikipedia, math and more — and reports back with a complete answer.
              </p>
              <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {AGENT_TASKS.map((t) => (
                  <button
                    key={t}
                    onClick={() => run(t)}
                    className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-sky-200 hover:bg-sky-50 hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
              {enabledConnectors.length === 0 && (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-amber-300">
                  <PlugZap className="h-3.5 w-3.5" aria-hidden />
                  All connectors are off — enable some in the Connectors hub for full power.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {events.map((event, i) => {
                if (event.type === 'plan') {
                  return (
                    <motion.div
                      key={`plan-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="ml-4 w-full max-w-[92%] rounded-xl border border-border bg-muted/50 px-4 py-3 sm:max-w-[80%]">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <ListChecks className="h-3.5 w-3.5" aria-hidden /> Plan
                        </p>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                          {event.plan}
                        </p>
                      </div>
                    </motion.div>
                  )
                }

                if (event.type === 'reflection') {
                  return (
                    <motion.div
                      key={`reflect-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="ml-4 flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> {event.note}
                      </div>
                    </motion.div>
                  )
                }

                if (event.type === 'user') {
                  return (
                    <motion.div
                      key={`user-${event.id}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="flex max-w-[85%] items-start gap-2.5 sm:max-w-[75%]">
                        <div className="rounded-2xl rounded-tr-md border border-border bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {event.content}
                        </div>
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                          <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                if (event.type === 'tool_start') {
                  // Find matching result event if it already arrived
                  const matched = events.find(
                    (e, j) => j > i && e.type === 'tool_result' && e.index === event.index && e.tool === event.tool
                  )
                  const status = matched
                    ? matched.type === 'tool_result' && !matched.ok
                      ? 'error'
                      : 'done'
                    : running
                      ? 'running'
                      : 'done'
                  const result = matched && matched.type === 'tool_result' ? matched.result : undefined
                  return (
                    <motion.div
                      key={`tool-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <ToolStep
                        tool={event.tool}
                        args={event.args}
                        result={result}
                        status={status}
                      />
                    </motion.div>
                  )
                }

                if (event.type === 'tool_result') {
                  // Rendered together with its tool_start — skip standalone
                  return null
                }

                if (event.type === 'assistant') {
                  return (
                    <motion.div
                      key={`assistant-${event.id}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="flex max-w-[92%] items-start gap-2.5 sm:max-w-[85%]">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                          <Bot className="h-3.5 w-3.5 text-white" aria-hidden />
                        </div>
                        <div className="min-w-0 rounded-2xl rounded-tl-md border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
                          <Markdown content={event.content} />
                          {event.content.includes('/api/image/file/') && (
                            <img
                              src={event.content.match(/\/api\/image\/file\/[a-zA-Z0-9-]+/)?.[0] ?? ''}
                              alt="Agent generated image"
                              className="mt-3 max-h-96 rounded-xl border border-border/60"
                            />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                return null
              })}
            </AnimatePresence>

            {running && (
              <div className="flex items-center gap-2.5 pl-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border/60 bg-card/80 px-4 py-3">
                  <span className="omni-dot h-2 w-2 rounded-full bg-primary" />
                  <span className="omni-dot h-2 w-2 rounded-full bg-primary/60" />
                  <span className="omni-dot h-2 w-2 rounded-full bg-primary/40" />
                  <span className="ml-1.5 text-xs text-muted-foreground">Agent working — planning and calling connectors…</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/80 backdrop-blur">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault()
            run(input)
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                run(input)
              }
            }}
            placeholder="Give the agent a mission…  e.g. “Compare today's weather in Dubai and London”"
            aria-label="Agent task"
            rows={1}
            disabled={running}
            className="max-h-44 min-h-12 flex-1 resize-none rounded-xl border-border/70 bg-card/80 focus-visible:ring-primary/40 disabled:opacity-60"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || running}
            aria-label="Run agent"
            className="h-12 w-12 shrink-0 rounded-xl bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
          >
            {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>
    </div>
  )
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}
