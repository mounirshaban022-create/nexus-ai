'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Square,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Sparkles,
  Trash2,
  User,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from './markdown'
import { AttachmentCard, ChatToolStep } from './chat-attachments'
import { puterChat, puterSignIn, isPuterReady } from './puter-engine'
import { getCurrentUser } from '@/lib/supabase'
import { ArtifactPanel, useArtifact, type Artifact } from './artifact-panel'
import type { ChatMessageItem, ChatSessionItem, ChatEvent, ChatAttachment } from './modes'

// Extend message type locally with attachments
interface ChatMsg extends ChatMessageItem {
  attachments?: ChatAttachment[]
}
import { useToast } from '@/hooks/use-toast'

interface ChatModeProps {
  initialPrompt?: string
  onInitialPromptConsumed?: () => void
  headerSlot?: React.ReactNode
}

const STARTER_PROMPTS = [
  'Explain quantum computing like I am five',
  'Write a Python function that finds anagrams',
  'Check the BTC price and convert it to AED',
  'Summarize the plot of Dune in 3 sentences',
]

export function ChatMode({ initialPrompt, onInitialPromptConsumed, headerSlot }: ChatModeProps) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(false)
  const [liveToolSteps, setLiveToolSteps] = useState<Array<{ tool: string; args: Record<string, unknown>; status: 'running' | 'done' | 'error' }>>([])
  // Streaming state: partial text of the in-flight assistant message
  const [streamingText, setStreamingText] = useState('')
  const [streamingAttachments, setStreamingAttachments] = useState<ChatAttachment[]>([])
  // Stop support
  const abortRef = useRef<AbortController | null>(null)
  const streamerRef = useRef<{ stop: () => void; done: Promise<void> } | null>(null)
  const [stopRequested, setStopRequested] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)
  // Smart auto-scroll: only pin to bottom when the user hasn't scrolled away
  const userScrolledUpRef = useRef(false)

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el || userScrolledUpRef.current) return // respect user's position
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    })
  }, [])

  // Detect user scroll position
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUpRef.current = distanceFromBottom > 120 // user scrolled up significantly
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions?kind=chat')
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

  /** Streams text word-by-word into the UI — the 'alive' ChatGPT feel.
   * Cancelable via the returned stop() function. */
  const streamWords = useCallback((fullText: string): { stop: () => void; done: Promise<void> } => {
    const words = fullText.split(/(\s+)/) // keep whitespace tokens
    let i = 0
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const done = new Promise<void>((resolve) => {
      timer = setInterval(() => {
        if (cancelled || stopRequested) {
          if (timer) clearInterval(timer)
          resolve()
          return
        }
        // Emit 1-3 words per tick for natural pacing
        const burst = words.slice(i, i + (Math.random() > 0.7 ? 2 : 1))
        i += burst.length
        setStreamingText(words.slice(0, i).join(''))
        if (i >= words.length) {
          if (timer) clearInterval(timer)
          resolve()
        }
        // keep pinned while streaming (respects userScrolledUp)
        requestAnimationFrame(() => {
          const el = scrollRef.current
          if (el && !userScrolledUpRef.current) {
            el.scrollTop = el.scrollHeight
          }
        })
      }, 24)
    })

    return {
      stop: () => {
        cancelled = true
        if (timer) clearInterval(timer)
      },
      done,
    }
  }, [stopRequested])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return

      const userMsg: ChatMessageItem = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setSending(true)
      setLiveToolSteps([])
      scrollToBottom()

      // ============ ENGINE 1: PUTER (primary — 507 free models) ============
      try {
        const puterReady = await isPuterReady()
        if (puterReady) {
          // Stream Puter reply word-by-word (ChatGPT feel)
          setStreamingText('')
          const result = await puterChat(
            `You are NEXUS AI, created by Mounir Shaaban. ${trimmed}`,
            'gpt-5-nano'
          )
          if (result.ok && result.text) {
            const streamer = streamWords(result.text)
            streamerRef.current = streamer
            await streamer.done
            streamerRef.current = null
            setStreamingText('')
            setMessages((prev) => [
              ...prev.map((m) => (m.id === userMsg.id ? { ...m, id: `u-${Date.now()}` } : m)),
              { id: `a-${Date.now()}`, role: 'assistant', content: result.text },
            ])
            scrollToBottom()
            return // Puter handled it — done!
          }
        }
      } catch {
        // Puter failed (not signed in / error) → fall through to server AI
      }

      // ============ ENGINE 2: SERVER AI (smart router: DeepSeek→OpenRouter→Z.ai) ============
      setStopRequested(false)
      abortRef.current = new AbortController()
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(supabaseUserIdRef.current ? { 'x-supabase-user-id': supabaseUserIdRef.current } : {}),
          },
          body: JSON.stringify({ message: trimmed, sessionId, thinking: thinkingMode }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || 'Chat request failed.')
        }

        // Read the unified NDJSON stream (tool calls + final answer)
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
              const event = JSON.parse(text) as ChatEvent
              if (event.type === 'user') {
                setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { id: event.id, role: 'user', content: event.content } : m)))
              } else if (event.type === 'tool_start') {
                setLiveToolSteps((prev) => [...prev, { tool: event.tool, args: event.args, status: 'running' }])
                scrollToBottom()
              } else if (event.type === 'tool_result') {
                setLiveToolSteps((prev) =>
                  prev.map((st, i) => (i === prev.length - 1 && st.tool === event.tool ? { ...st, status: event.ok ? 'done' : 'error' } : st))
                )
              } else if (event.type === 'assistant') {
                setLiveToolSteps([])
                const streamer = streamWords(event.content)
                streamerRef.current = streamer
                setStreamingAttachments(event.attachments ?? [])
                await streamer.done
                streamerRef.current = null
                setStreamingText('')
                setStreamingAttachments([])
                setMessages((prev) => [
                  ...prev.map((m) => (m.id === userMsg.id && m.id.startsWith('local-') ? { ...m, id: `u-${Date.now()}` } : m)),
                  { id: `a-${Date.now()}`, role: 'assistant', content: event.content, attachments: event.attachments },
                ])
                scrollToBottom()
              } else if (event.type === 'done') {
                setSessionId(event.sessionId)
              } else if (event.type === 'error') {
                throw new Error(event.message)
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && !parseErr.message.includes('JSON')) throw parseErr
            }
          }
        }
        refreshSessions()
      } catch (error) {
        // ============ ENGINE 3: PUTER AS LAST RESORT (if signed in) ============
        try {
          const result = await puterChat(
            `You are NEXUS AI, created by Mounir Shaaban. ${trimmed}`,
            'gpt-5-nano'
          )
          if (result.ok && result.text) {
            setMessages((prev) => [
              ...prev.map((m) => (m.id === userMsg.id ? { ...m, id: `u-${Date.now()}` } : m)),
              { id: `a-${Date.now()}`, role: 'assistant', content: result.text },
            ])
            setInput('')
            scrollToBottom()
            return
          }
        } catch {
          /* all engines failed */
        }
        toast({
          title: 'Message failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
        setInput(trimmed)
      } finally {
        setSending(false)
        setLiveToolSteps([])
        setStreamingText('')
        setStreamingAttachments([])
      }
    },
    [sessionId, sending, scrollToBottom, refreshSessions, toast, thinkingMode]
  )

  // Fire the initial prompt as soon as one arrives and the composer is idle
  useEffect(() => {
    if (initialPrompt && !sentInitialRef.current && !sending) {
      sentInitialRef.current = true
      const p = initialPrompt
      onInitialPromptConsumed?.()
      send(p)
    }
  }, [initialPrompt, send, sending, onInitialPromptConsumed])

  const regenerate = useCallback(async () => {
    if (!sessionId || sending) return
    setSending(true)
    // Optimistically drop the trailing assistant message locally
    setMessages((prev) => {
      const copy = [...prev]
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop()
      return copy
    })
    scrollToBottom()
    try {
      const res = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Regeneration failed.')
      setMessages((prev) => [...prev, data.reply])
      scrollToBottom()
    } catch (error) {
      toast({
        title: 'Regeneration failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, scrollToBottom, toast])

  const { artifact, openArtifact, closeArtifact } = useArtifact()
  const [puterActive, setPuterActive] = useState(false)
  const supabaseUserIdRef = useRef<string | null>(null)

  // Load Supabase user ID for cloud sync
  useEffect(() => {
    getCurrentUser().then((u) => {
      supabaseUserIdRef.current = u?.id ?? null
    }).catch(() => {})
  }, [])

  // Check Puter sign-in state once — hide activation banner if already active
  useEffect(() => {
    isPuterReady().then(setPuterActive).catch(() => {})
  }, [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({})

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Copied to clipboard' })
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }, [toast])

  const feedback = useCallback(
    (msgId: string, kind: 'up' | 'down') => {
      setFeedbackGiven((prev) => ({ ...prev, [msgId]: kind }))
      toast({
        title: kind === 'up' ? 'Thanks for the feedback!' : 'Feedback noted — thanks!',
        duration: 2000,
      })
    },
    [toast]
  )

  /** Edit a sent message: truncate history after it, resend as new message. */
  const submitEdit = useCallback(
    (msgId: string) => {
      const edited = editText.trim()
      setEditingId(null)
      if (!edited) return
      // Truncate messages after the edited one
      const idx = messages.findIndex((m) => m.id === msgId)
      if (idx === -1) return
      setMessages((prev) => prev.slice(0, idx))
      send(edited)
    },
    [editText, messages, send]
  )

  const stopGeneration = useCallback(() => {
    setStopRequested(true)
    abortRef.current?.abort()
    streamerRef.current?.stop()
    const partial = streamingText
    if (partial.trim()) {
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: partial + '\n\n*(stopped)*' }])
    }
    setStreamingText('')
    setStreamingAttachments([])
    setSending(false)
    setLiveToolSteps([])
  }, [streamingText])

  const loadSession = useCallback(
    async (id: string) => {
      if (sending) return
      setHistoryOpen(false)
      try {
        const res = await fetch(`/api/chat/sessions/${id}`)
        if (!res.ok) throw new Error('Conversation not found.')
        const data = await res.json()
        setSessionId(data.session.id)
        setMessages(
          (data.session.messages as ChatMessageItem[]).map((m) => ({
            ...m,
            thinking: m.thinking ?? null,
          }))
        )
        setTimeout(() => scrollToBottom(false), 60)
      } catch (error) {
        toast({
          title: 'Could not open conversation',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    },
    [sending, scrollToBottom, toast]
  )

  const deleteSession = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const res = await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed.')
        setSessions((prev) => prev.filter((s) => s.id !== id))
        if (sessionId === id) {
          setSessionId(null)
          setMessages([])
        }
        toast({ title: 'Conversation deleted' })
      } catch {
        toast({ title: 'Could not delete conversation', variant: 'destructive' })
      }
    },
    [sessionId, toast]
  )

  const startNew = () => {
    if (sending) return
    setSessionId(null)
    setMessages([])
    setInput('')
  }

  const activeSession = sessions.find((s) => s.id === sessionId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chat header — ChatGPT style: ability picker + actions */}
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {headerSlot}
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm text-muted-foreground">
              {messages.length > 0
                ? activeSession?.title ?? 'Conversation'
                : 'Ask anything — full Markdown answers'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-lg">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">History</span>
                {sessions.length > 0 && (
                  <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold text-muted-foreground">
                    {sessions.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0 sm:w-96">
              <SheetHeader className="border-b border-border/60 px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-primary" /> Conversations
                </SheetTitle>
              </SheetHeader>
              <div className="border-b border-border/60 p-3">
                <Button
                  onClick={() => {
                    startNew()
                    setHistoryOpen(false)
                  }}
                  className="w-full gap-2 rounded-lg bg-primary text-primary-foreground hover:brightness-110"
                >
                  <Plus className="h-4 w-4" /> New conversation
                </Button>
              </div>
              <ScrollArea className="omni-scroll flex-1">
                <div className="flex flex-col gap-1 p-2">
                  {sessions.length === 0 && (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No conversations yet.
                    </p>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`group flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                        s.id === sessionId
                          ? 'border-border bg-secondary/60'
                          : 'border-transparent hover:border-border/60 hover:bg-secondary/50'
                      }`}
                    >
                      <button
                        onClick={() => loadSession(s.id)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open conversation: ${s.title}`}
                      >
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {s.preview || '…'}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {new Date(s.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </button>
                      <button
                        aria-label={`Delete conversation: ${s.title}`}
                        onClick={(e) => deleteSession(s.id, e)}
                        className="mt-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            size="sm"
            onClick={startNew}
            className="gap-2 rounded-lg"
            aria-label="Start new conversation"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="omni-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center py-14 text-center sm:py-24">
              { }
              <img
                src="/nexus-logo.svg"
                alt="NEXUS AI — AI that connects"
                className="mb-4 h-36 w-36"
              />
              <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                How can I help you today?
              </h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                One AI, every superpower — with deep thinking, 21 live connectors and your real
                email. Pick an ability or just start typing.
              </p>
              <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* PRIMARY ENGINE: Puter — hidden when already activated */}
              {!puterActive && (
              <div className="mt-6 flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-2">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="text-xs text-muted-foreground">
                  <strong className="text-foreground">GPT-5 · Claude · DeepSeek</strong> — free & unlimited
                </span>
                <button
                  onClick={async () => {
                    const ok = await puterSignIn()
                    if (ok) setPuterActive(true)
                    toast({
                      title: ok ? 'Primary AI engine activated! 🎉' : 'Sign-in canceled — click again when ready',
                      description: ok ? '507 models now power your chats. No keys, no limits.' : undefined,
                      duration: 6000,
                    })
                  }}
                  className="ml-auto shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition hover:brightness-110"
                >
                  Activate
                </button>
              </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-7">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} data-user-msg className="flex flex-col items-end">
                  <div className="max-w-[90%] rounded-3xl rounded-tr-lg bg-secondary px-4 py-1.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words sm:max-w-[80%]">
                    {editingId === m.id ? (
                      <div className="min-w-[260px]">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={Math.min(5, editText.split('\n').length)}
                          className="w-full resize-none rounded-lg bg-background px-3 py-2 text-[15px] focus:outline-none"
                          autoFocus
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-background"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => submitEdit(m.id)}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {editingId !== m.id && (
                    <button
                      onClick={() => {
                        setEditingId(m.id)
                        setEditText(m.content)
                      }}
                      aria-label="Edit message"
                      className="msg-edit-btn mt-1 mr-1 rounded-md p-1 text-muted-foreground transition hover:bg-secondary"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </div>
              ) : (
                <div key={m.id} className="group/msg flex justify-start px-1">
                  <div className="min-w-0 max-w-full flex-1">
                    {m.thinking && <ThinkingPanel thinking={m.thinking} />}
                    <div className="px-1 py-0.5">
                      <Markdown content={m.content} />
                      {(m as ChatMsg).attachments?.map((att, ai) =>
                        att.type === 'document' && att.url ? (
                          <button
                            key={ai}
                            onClick={() =>
                              openArtifact({
                                id: `art-${ai}-${m.id}`,
                                type: 'document',
                                title: att.title ?? 'Document',
                                content: `**${att.title}**\n\n${m.content}\n\n---\n*Format: ${att.format?.toUpperCase() ?? 'DOCX'} · Use the Download button to save this document.*`,
                                downloadUrl: att.url,
                                format: att.format,
                              })
                            }
                            className="mt-3 block w-full text-left"
                          >
                            <AttachmentCard attachment={att} />
                          </button>
                        ) : (
                          <AttachmentCard key={ai} attachment={att} />
                        )
                      )}
                    </div>
                    {/* ChatGPT-style actions: always visible on hover, subtle */}
                    <div className="mt-0.5 -ml-1.5 flex items-center gap-0.5 opacity-0 transition group-hover/msg:opacity-100">
                      <ActionIconButton label="Copy" onClick={() => copyText(m.content)}>
                        <Copy className="h-[14px] w-[14px]" aria-hidden />
                      </ActionIconButton>
                      <ActionIconButton label="Good response" onClick={() => feedback(m.id, 'up')}>
                        <ThumbsUp className="h-[14px] w-[14px]" aria-hidden />
                      </ActionIconButton>
                      <ActionIconButton label="Bad response" onClick={() => feedback(m.id, 'down')}>
                        <ThumbsDown className="h-[14px] w-[14px]" aria-hidden />
                      </ActionIconButton>
                      {messages[messages.length - 1]?.id === m.id && (
                        <ActionIconButton label="Regenerate" onClick={regenerate} disabled={sending}>
                          <RefreshCw className="h-[14px] w-[14px]" aria-hidden />
                        </ActionIconButton>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {liveToolSteps.map((step, i) => (
              <div key={i} className="flex justify-start px-1">
                <ChatToolStep tool={step.tool} args={step.args} status={step.status} />
              </div>
            ))}

            {/* Streaming assistant message — progressive render */}
            {streamingText && !liveToolSteps.length && (
              <div className="flex justify-start px-1">
                <div className="min-w-0 max-w-full flex-1">
                  <div className="px-1 py-0.5">
                    <Markdown content={streamingText} />
                    <span className="nexus-caret" aria-hidden />
                    {streamingAttachments.map((att, ai) => (
                      <AttachmentCard key={ai} attachment={att} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {sending && (
              <div className="flex items-center gap-1.5 px-1 py-2">
                <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <span className="sr-only">NEXUS is thinking…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="bg-background">
        <form
          className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 pb-5 pt-2 sm:px-8"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <div className="relative flex-1 rounded-3xl border border-border bg-card shadow-lg backdrop-blur-sm transition focus-within:shadow-md">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder={
                thinkingMode
                  ? 'Message NEXUS (deep thinking on)…'
                  : 'Message NEXUS…  (Enter to send, Shift+Enter for a new line)'
              }
              aria-label="Message NEXUS"
              rows={1}
              disabled={sending}
              className={`max-h-44 min-h-[52px] flex-1 resize-none rounded-full border-0 bg-transparent px-5 pr-12 py-[15px] text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60 ${
                thinkingMode ? '' : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setThinkingMode((v) => !v)}
              aria-pressed={thinkingMode}
              aria-label="Toggle deep thinking mode"
              title={thinkingMode ? 'Deep thinking: ON' : 'Deep thinking: OFF'}
              className={`absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full transition ${
                thinkingMode
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Brain className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {sending ? (
            <Button
              type="button"
              onClick={stopGeneration}
              aria-label="Stop generating"
              className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground transition hover:brightness-110"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              aria-label="Send message"
              className="h-[52px] w-[52px] shrink-0 rounded-full bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-30"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </form>
      </div>

      {/* Artifact side panel (Claude Artifacts pattern) */}
      <ArtifactPanel artifact={artifact} onClose={closeArtifact} />
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      aria-label="Copy message"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden /> Copy
        </>
      )}
    </button>
  )
}

/** Collapsible reasoning panel shown above answers produced in thinking mode. */
function ThinkingPanel({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2 text-left transition hover:bg-secondary/70"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">Thought before answering</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-muted-foreground/70 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="overflow-hidden"
        >
          <p className="mt-1.5 rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-xs italic leading-relaxed text-muted-foreground">
            {thinking}
          </p>
        </motion.div>
      )}
    </div>
  )
}

/** Compact icon button for message action rows (ChatGPT-style). */
function ActionIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}
