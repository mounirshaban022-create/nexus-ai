'use client'

/**
 * NEXUS One — THE unified chat.
 *
 * One ChatGPT-style conversation where 255 specialist agents auto-take-over
 * (agent_assign handoff pills), with every superpower inline: images, live
 * video jobs, documents (Word/Excel/PDF), code, real browser, email and
 * WhatsApp. NDJSON streaming client modeled on the battle-tested
 * agency-chat implementation (deltas buffered + flushed every 80ms).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowUp,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Mail,
  Mic,
  MousePointerClick,
  Paperclip,
  Pin,
  Square,
  Users,
  X,
} from 'lucide-react'
import { Markdown } from '@/components/omni/markdown'
import { useI18n } from '@/lib/i18n'
import { usePreferences } from '@/lib/preferences'
import type { AgentAssignEvent, ChatMessageView, ChatStreamEvent, SkillRunEvent } from './shared'
import { BrandMark, DIVISION_MAP, agentOrNexus, useActiveChatSession } from './shared'
import { AgentAvatar, AttachmentList, HandoffPill, SkillRunCard, ToolCard, type ToolCardInfo } from './chat-parts'
import { PersonalityRail } from './personality-rail'

export interface NexusChatProps {
  sessionId?: string
  prefill?: string
  pinnedAgent: string | null
  onPinnedAgentChange: (slug: string | null) => void
  /** call when the stream creates/uses a session so the sidebar refreshes */
  onSessionCreated: (id: string) => void
  onOpenAgents: () => void
  onOpenVoice: () => void
  onOpenWhatsApp: () => void
}

/* ------------------------------------------------------------------ */
/* Local message model (extends the shared view with routing extras)   */
/* ------------------------------------------------------------------ */

interface NxMsg extends Omit<ChatMessageView, 'role'> {
  role: 'user' | 'assistant' | 'tool' | 'agent' | 'skill'
  isError?: boolean
  /** filename the user attached with this message */
  attachName?: string
  /** role:'agent' → the routing handoff pill */
  assign?: AgentAssignEvent
  /** role:'skill' → the animated cloud-skill execution card */
  skillInfo?: SkillRunEvent
  /** live tool chip state for role:'tool' rows */
  toolStatus?: 'running' | 'done' | 'error'
  toolMessage?: string
  toolIndex?: number
  toolArgs?: Record<string, unknown> | null
}

/* Welcome-screen suggestion chips — i18n keys (rendered via t()). */
const SUGGESTION_KEYS = ['caps.sugg1', 'caps.sugg2', 'caps.sugg3', 'caps.sugg4'] as const

interface Capability {
  icon: typeof ImageIcon
  titleKey: string
  descKey: string
  /** composer prefill (i18n key) */
  promptKey?: string
  voice?: boolean
  whatsapp?: boolean
}

const CAPABILITIES: Capability[] = [
  {
    icon: ImageIcon,
    titleKey: 'caps.imageTitle',
    descKey: 'caps.imageDesc',
    promptKey: 'caps.imagePrompt',
  },
  {
    icon: Clapperboard,
    titleKey: 'caps.videoTitle',
    descKey: 'caps.videoDesc',
    promptKey: 'caps.videoPrompt',
  },
  {
    icon: FileText,
    titleKey: 'caps.docTitle',
    descKey: 'caps.docDesc',
    promptKey: 'caps.docPrompt',
  },
  {
    icon: MousePointerClick,
    titleKey: 'caps.webTitle',
    descKey: 'caps.webDesc',
    promptKey: 'caps.webPrompt',
  },
  { icon: Mic, titleKey: 'caps.voiceTitle', descKey: 'caps.voiceDesc', voice: true },
  { icon: Mail, titleKey: 'caps.emailTitle', descKey: 'caps.emailDesc', whatsapp: true },
]

/** Server status lines arrive in English on the wire — localize the known
 *  ones client-side so Arabic users still see a fully-Arabic surface. */
const STATUS_KEYS: Record<string, string> = {
  'Picking the right specialist…': 'chat.picking',
  'Thinking…': 'chat.thinking',
  'Continuing…': 'chat.continuing',
  'Working…': 'chat.working',
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

/* ------------------------------------------------------------------ */
/* The chat                                                            */
/* ------------------------------------------------------------------ */

export function NexusChat(props: NexusChatProps) {
  const { pinnedAgent, onPinnedAgentChange, onSessionCreated } = props
  const { t, lang } = useI18n()

  /** Localize known English server status lines for the active language. */
  const localizeStatus = (s: string): string => {
    if (lang !== 'ar') return s
    const key = STATUS_KEYS[s]
    return key ? t(key) : s
  }

  const [messages, setMessages] = useState<NxMsg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(props.sessionId)
  const [input, setInput] = useState(props.prefill ?? '')
  const [attach, setAttach] = useState<{ filename: string; dataUrl: string } | null>(null)
  const [attachError, setAttachError] = useState('')
  const [assign, setAssign] = useState<AgentAssignEvent | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const stickToBottomRef = useRef(true)
  const streamIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const assignRef = useRef<AgentAssignEvent | null>(null)
  const seqRef = useRef(0)
  /** Live status line from the server ("Picking the right specialist…") —
   *  shown next to the typing dots so waiting never feels dead. */
  const [statusText, setStatusText] = useState('')
  /** Smooth word-by-word reveal queue (see queueReveal below). */
  const revealRef = useRef<{ id: string; backlog: string; ended: boolean }>({
    id: '',
    backlog: '',
    ended: true,
  })
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollFrameRef = useRef<number | null>(null)

  const nextId = (prefix: string) => `${prefix}-${Date.now()}-${seqRef.current++}`

  /* ---------- session resume + one-time pin sync ---------- */
  // The session to resume is captured at MOUNT: page.tsx remounts the chat
  // (chatEpoch key) whenever the user switches sessions, and later
  // props.sessionId changes (e.g. when THIS chat creates its own session)
  // must NOT re-trigger a refetch that would clobber the live transcript
  // (handoff pills, tool cards and attachments are stream-only state).
  const [resumeId] = useState(props.sessionId)
  useEffect(() => {
    // Mirror the bound session for the shell (delete-the-active-chat reset).
    useActiveChatSession.getState().setSession(resumeId)
    if (!resumeId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${encodeURIComponent(resumeId)}`)
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as { session?: unknown } | null
        const s =
          data && typeof data.session === 'object' ? (data.session as Record<string, unknown>) : null
        if (cancelled || !s) return
        const rowsRaw = Array.isArray(s.messages) ? s.messages : []
        const sessionAgentSlug = typeof s.agentSlug === 'string' ? s.agentSlug : null
        const rows: NxMsg[] = rowsRaw
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
          .map((m, i): NxMsg => {
            const role = m.role === 'user' ? 'user' : m.role === 'tool' ? 'tool' : 'assistant'
            return {
              id: typeof m.id === 'string' ? m.id : `m-${i}`,
              role,
              content: typeof m.content === 'string' ? m.content : '',
              toolName: typeof m.toolName === 'string' ? m.toolName : null,
              toolData: typeof m.toolData === 'string' ? m.toolData : null,
              toolStatus: role === 'tool' ? 'done' : undefined,
              agentSlug: role === 'assistant' ? sessionAgentSlug : undefined,
              // NEXUS One: attachments persisted server-side (image/video/
              // document/code cards) survive resume.
              attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
            }
          })
        setMessages(rows)
        setSessionId(typeof s.id === 'string' ? s.id : resumeId)
        useActiveChatSession.getState().setSession(typeof s.id === 'string' ? s.id : resumeId)
        // Sync page-level pin state ONCE after the session loads.
        onPinnedAgentChange(s.agentPinned === true && sessionAgentSlug ? sessionAgentSlug : null)
      } catch {
        /* failed to load — fall back to an empty transcript */
      }
    })()
    return () => {
      cancelled = true
    }
    // Mount-per-session resume (page.tsx remounts via chatEpoch); the pin
    // sync must fire exactly once per loaded session.
  }, [resumeId])

  /* ---------- abort any live stream on unmount ---------- */
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (revealTimerRef.current) clearInterval(revealTimerRef.current)
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [])

  /* ---------- smart auto-scroll (sticks while near the bottom) ----------
   * SCROLL-GLITCH FIX — three hardening measures:
   *   1. rAF throttling: the DOM height settles within one animation frame
   *      before we pin to the bottom (no fighting mid-layout writes).
   *   2. Hysteresis: stick again at ≤140px from the bottom, but only
   *      un-stick beyond 260px — mobile rubber-banding at the bottom edge
   *      no longer randomly detaches the auto-scroll.
   *   3. `overflow-anchor:none` on .nx-scroll (globals.css) stops the
   *      browser's own scroll-anchoring from fighting our scrollTop writes.
   */
  const scrollToEnd = useCallback(() => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const el = scrollRef.current
      if (!el || !stickToBottomRef.current) return
      el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    scrollToEnd()
  }, [messages, streaming, scrollToEnd])

  /* Mobile keyboards + viewport resizes change the container height without
   * a messages update — re-stick to the bottom so the newest content stays
   * visible instead of being cut off under the composer. */
  useEffect(() => {
    const onResize = () => {
      if (stickToBottomRef.current) scrollToEnd()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [scrollToEnd])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    // Hysteresis band: easily re-stick near the bottom, hard to un-stick.
    if (distFromBottom <= 140) stickToBottomRef.current = true
    else if (distFromBottom > 260) stickToBottomRef.current = false
  }

  /* ---------- textarea auto-resize (rows 1 → 6) ---------- */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [input])

  /* ---------- streaming helpers ---------- */

  const appendToMessage = useCallback((id: string, delta: string) => {
    if (!id || !delta) return
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)))
  }, [])

  /* ---------- SMOOTH WORD-BY-WORD REVEAL (the "alive" feel) ----------
   * EVERY piece of assistant text - fast token streams, chunky
   * multi-word deltas, or ONE giant burst from a non-streaming
   * provider - is fed into a paced reveal queue. A 30ms tick
   * releases a few characters at a time with automatic catch-up
   * when the backlog grows, so the UI ALWAYS renders word-by-word:
   * the AI feels instant and never slams a wall of text.
   *
   *   pace = 2 chars + backlog/40 per 30ms tick (capped at 80)
   *   - slow streams  -> steady word-by-word typing (~1s buffer)
   *   - fast streams  -> backlog grows -> pace grows -> never lags
   *   - one-shot text -> drained in <= ~1.2s at 2x pace
   */
  const ensureRevealLoop = useCallback(() => {
    if (revealTimerRef.current) return
    revealTimerRef.current = setInterval(() => {
      const st = revealRef.current
      if (!st.id) return
      if (!st.backlog) {
        if (st.ended) {
          // Fully drained - park the loop until the next stream.
          if (revealTimerRef.current) clearInterval(revealTimerRef.current)
          revealTimerRef.current = null
          st.id = ''
        }
        return
      }
      let pace = 2 + Math.ceil(st.backlog.length / 40)
      if (st.ended) pace *= 2 // stream over -> finish briskly
      const chunk = st.backlog.slice(0, Math.min(80, pace))
      st.backlog = st.backlog.slice(chunk.length)
      appendToMessage(st.id, chunk)
    }, 30)
  }, [appendToMessage])

  /** Feed text into the reveal queue for the active bubble. */
  const queueReveal = useCallback(
    (id: string, text: string, ended = false) => {
      if (!id || !text) return
      const st = revealRef.current
      if (st.id !== id) {
        // New bubble - flush anything left from the previous one
        // instantly so no text is ever lost.
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

  /** Mark the active reveal as finished - drain the rest briskly. */
  const endReveal = useCallback(() => {
    const st = revealRef.current
    if (st.id) st.ended = true
    ensureRevealLoop()
  }, [ensureRevealLoop])

  /** Dump everything pending instantly (error / teardown paths). */
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
  const updateTool = useCallback(
    (tool: string, index: number, patch: Partial<NxMsg>) => {
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
      const hasAttach = attach != null
      if (streaming) return
      if (!trimmed && !hasAttach) return

      const userMsg: NxMsg = {
        id: nextId('local'),
        role: 'user',
        content: trimmed,
        ...(hasAttach ? { attachName: attach!.filename } : {}),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setAttach(null)
      setAttachError('')
      setStreaming(true)
      stickToBottomRef.current = true
      setStatusText('')

      abortRef.current = new AbortController()

      // STREAM WATCHDOG (defense-in-depth): if the server ever fails to
      // close the NDJSON stream, reader.read() hangs forever and the
      // composer stays locked in "generating". This timer aborts the fetch
      // after 90s of total silence and frees the UI. Declared OUTSIDE the
      // try so the finally block can always disarm it.
      let watchdog: ReturnType<typeof setTimeout> | null = null
      const armWatchdog = () => {
        if (watchdog) clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          abortRef.current?.abort()
        }, 90_000)
      }
      const disarmWatchdog = () => {
        if (watchdog) clearTimeout(watchdog)
        watchdog = null
      }

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            ...(sessionId ? { sessionId } : {}),
            // '' = auto-routing; a slug pins the session persona (idempotent).
            agentSlug: pinnedAgent ?? '',
            // Answer language — the backend ships full Arabic instructions.
            language: usePreferences.getState().language,
            ...(hasAttach
              ? { attachment: { filename: attach!.filename, dataUrl: attach!.dataUrl } }
              : {}),
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error || t('chat.requestFailed'))
        }

        // Consume the NDJSON stream.
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        armWatchdog()

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          armWatchdog()
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
              case 'agent_assign': {
                assignRef.current = event
                setAssign(event)
                setMessages((prev) => [
                  ...prev,
                  { id: nextId('assign'), role: 'agent', content: '', assign: event },
                ])
                break
              }
              case 'status': {
                // Live server status line — displayed with the typing dots
                // until the first delta lands.
                setStatusText(event.message)
                break
              }
              case 'assistant_start': {
                streamIdRef.current = event.id
                const slug = pinnedAgent ?? assignRef.current?.agentSlug ?? null
                setMessages((prev) => [
                  ...prev,
                  { id: event.id, role: 'assistant', content: '', streaming: true, agentSlug: slug },
                ])
                break
              }
              case 'assistant_delta': {
                setStatusText('')
                const id = streamIdRef.current
                // Paced reveal — every delta (tiny token or giant burst)
                // flows through the same word-by-word queue.
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
                // Full-message fallback (non-streaming providers).
                const attachments = Array.isArray(event.attachments) ? event.attachments : []
                const id = streamIdRef.current
                streamIdRef.current = null
                if (id) {
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
                  // Word-by-word reveal — same paced queue as live deltas.
                  queueReveal(id, event.content, true)
                } else {
                  const freshId = nextId('a')
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: freshId,
                      role: 'assistant',
                      content: '',
                      agentSlug: pinnedAgent ?? assignRef.current?.agentSlug ?? null,
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
                    id: nextId(`tool-${event.index}`),
                    role: 'tool',
                    content: '',
                    toolName: event.tool,
                    toolIndex: event.index,
                    toolStatus: 'running',
                    toolArgs: event.args,
                  },
                ])
                break
              }
              case 'tool_progress': {
                updateTool(event.tool, event.index, { toolMessage: event.message })
                break
              }
              case 'skill_run': {
                // Animated cloud-skill execution card. 'running' inserts the
                // card; 'done'/'error' patch it in place.
                if (event.status === 'running') {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: nextId(`skill-${event.skillName}`),
                      role: 'skill',
                      content: '',
                      skillInfo: {
                        status: 'running',
                        skill: event.skill,
                        skillName: event.skillName,
                        emoji: event.emoji,
                        action: event.action,
                        actionLabel: event.actionLabel,
                        task: event.task,
                      },
                    },
                  ])
                } else {
                  setMessages((prev) => {
                    // Patch the LAST skill card for this skill.
                    const idx = [...prev]
                      .map((m, i) => ({ m, i }))
                      .filter(({ m }) => m.role === 'skill' && m.skillInfo?.skillName === event.skillName)
                      .pop()?.i
                    if (idx === undefined) return prev
                    const copy = [...prev]
                    copy[idx] = {
                      ...copy[idx],
                      skillInfo: {
                        status: event.status,
                        skill: event.skill,
                        skillName: event.skillName,
                        emoji: event.emoji,
                        action: event.action,
                        actionLabel: event.actionLabel,
                        error: event.error,
                      },
                    }
                    return copy
                  })
                }
                break
              }
              case 'tool_result': {
                let data: string | null = null
                try {
                  data = JSON.stringify(event.result)
                } catch {
                  data = null
                }
                updateTool(event.tool, event.index, {
                  toolStatus: event.ok ? 'done' : 'error',
                  toolData: data,
                })
                break
              }
              case 'done': {
                setSessionId(event.sessionId)
                useActiveChatSession.getState().setSession(event.sessionId)
                onSessionCreated(event.sessionId)
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
            id: nextId('err'),
            role: 'assistant',
            content:
              error instanceof Error
                ? t('chat.errorPrefix', { msg: error.message })
                : t('chat.somethingWrong'),
            isError: true,
            agentSlug: pinnedAgent ?? assignRef.current?.agentSlug ?? null,
          },
        ])
      } finally {
        disarmWatchdog()
        endReveal()
        streamIdRef.current = null
        setStreaming(false)
        setStatusText('')
        setMessages((prev) =>
          prev.map((m) =>
            m.streaming
              ? { ...m, streaming: false }
              : m.toolStatus === 'running'
                ? { ...m, toolStatus: 'done' }
                : m.role === 'skill' && m.skillInfo?.status === 'running'
                  ? { ...m, skillInfo: { ...m.skillInfo, status: 'done' } }
                  : m
          )
        )
      }
    },
    [attach, sessionId, streaming, pinnedAgent, t, lang, queueReveal, endReveal, flushRevealNow, updateTool, onSessionCreated]
  )

  /* ---------- attachments (composer) ---------- */

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (file.size > 14 * 1024 * 1024) {
      setAttachError(t('chat.attachTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        setAttachError(t('chat.attachReadError'))
        return
      }
      setAttach({ filename: file.name, dataUrl })
      setAttachError('')
    }
    reader.onerror = () => setAttachError(t('chat.attachReadError'))
    reader.readAsDataURL(file)
  }

  /* ---------- keyboard ---------- */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(input)
    }
  }

  const stop = () => abortRef.current?.abort()

  /* ---------- derived ---------- */

  const headerAgent = agentOrNexus(pinnedAgent ?? assign?.agentSlug)
  const headerDivision = DIVISION_MAP[headerAgent.division]
  const isPinned = pinnedAgent != null
  const showWelcome = messages.length === 0 && !streaming
  const canSend = (input.trim().length > 0 || attach != null) && !streaming
  const placeholder = t('chat.messageAgent', { name: headerAgent.name })

  const applyCapability = (c: Capability) => {
    if (c.voice) {
      props.onOpenVoice()
      return
    }
    if (c.whatsapp) {
      props.onOpenWhatsApp()
      return
    }
    if (c.promptKey) {
      setInput(t(c.promptKey))
      textareaRef.current?.focus()
    }
  }

  /* Index of the newest handoff pill — it shimmers while its reply streams. */
  let lastAssignIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'agent') {
      lastAssignIdx = i
      break
    }
  }

  return (
    <div className="flex h-[calc(100dvh_-_111px_-_env(safe-area-inset-bottom))] flex-col md:h-screen">
      {/* ---------- Header: current agent identity ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {isPinned ? (
            <>
              <AgentAvatar agent={headerAgent} size={34} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                  <span className="truncate">{headerAgent.name}</span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    <Pin className="h-2.5 w-2.5" aria-hidden />
                    {t('chat.pinned')}
                  </span>
                </p>
                {headerDivision ? (
                  <p className="truncate text-[11px]" style={{ color: headerDivision.color }}>
                    {headerDivision.label}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onPinnedAgentChange(null)}
                aria-label={t('chat.unpinAgent', { name: headerAgent.name })}
                title={t('chat.unpin')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : assign ? (
            <>
              <AgentAvatar agent={headerAgent} size={34} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                  <span className="truncate">{headerAgent.name}</span>
                  <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {t('chat.auto')}
                  </span>
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {assign.divisionLabel ?? headerDivision?.label ?? t('chat.core')}
                </p>
              </div>
            </>
          ) : (
            <>
              <BrandMark size={26} />
              <p className="text-sm font-semibold text-zinc-100">NEXUS</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={props.onOpenAgents}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/5"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t('nav.agents')}
        </button>
      </header>

      {/* ---------- Messages / welcome ---------- */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="nx-scroll flex-1 overflow-y-auto overscroll-contain"
        aria-label="Conversation"
      >
        {showWelcome ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-10 pt-10 text-center sm:pt-16">
            <motion.div variants={stagger} initial="hidden" animate="show" className="w-full">
              <motion.div variants={fadeUp} className="flex justify-center">
                <span className="nx-aura relative grid place-items-center rounded-2xl p-2">
                  <BrandMark size={72} />
                </span>
              </motion.div>
              <motion.h1
                variants={fadeUp}
                className="font-display mt-5 text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl"
              >
                {t('chat.welcomeTitleA')} <span className="nx-gradient-text">{t('chat.welcomeTitleB')}</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
                {t('chat.welcomeSub')}
              </motion.p>

              <motion.div
                variants={stagger}
                className="mt-9 grid grid-cols-1 gap-3 text-start sm:grid-cols-2 lg:grid-cols-3"
              >
                {CAPABILITIES.map((c) => (
                  <motion.button
                    key={c.titleKey}
                    type="button"
                    variants={fadeUp}
                    onClick={() => applyCapability(c)}
                    className="nx-glow-card group p-4 text-start sm:p-5"
                  >
                    <span
                      className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
                      style={{ backgroundColor: 'rgba(255,90,95,0.12)', color: '#ff8a8d' }}
                      aria-hidden
                    >
                      <c.icon className="h-5 w-5" />
                    </span>
                    <span className="block text-sm font-semibold text-zinc-100">{t(c.titleKey)}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{t(c.descKey)}</span>
                  </motion.button>
                ))}
              </motion.div>

              <motion.div variants={fadeUp} className="mt-7 flex flex-wrap justify-center gap-2">
                {SUGGESTION_KEYS.map((key) => {
                  const s = t(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setInput(s)
                        textareaRef.current?.focus()
                      }}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-[#ff5a5f]/40 hover:bg-white/[0.06] hover:text-zinc-100"
                    >
                      {s}
                    </button>
                  )
                })}
              </motion.div>
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="nx-rise max-w-[85%] rounded-2xl rounded-ee-md bg-white/8 px-4 py-2.5">
                      {m.attachName ? (
                        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <FileText className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{m.attachName}</span>
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-100">
                        {m.content}
                      </p>
                    </div>
                  </div>
                )
              }

              if (m.role === 'agent' && m.assign) {
                return (
                  <div key={m.id} className="flex ps-11">
                    <HandoffPill assign={m.assign} live={streaming && i === lastAssignIdx} />
                  </div>
                )
              }

              if (m.role === 'skill' && m.skillInfo) {
                return (
                  <div key={m.id} className="flex ps-11">
                    <SkillRunCard info={m.skillInfo} />
                  </div>
                )
              }

              if (m.role === 'tool') {
                const info: ToolCardInfo = {
                  tool: m.toolName ?? '',
                  status: m.toolStatus ?? 'done',
                  message: m.toolMessage,
                  args: m.toolArgs,
                  data: m.toolData,
                }
                return (
                  <div key={m.id} className="flex ps-11">
                    <ToolCard info={info} />
                  </div>
                )
              }

              /* assistant */
              const agent = agentOrNexus(m.agentSlug)
              const division = DIVISION_MAP[agent.division]
              const color = division?.color ?? '#ff5a5f'
              return (
                <div key={m.id} className="nx-rise flex gap-3">
                  <AgentAvatar agent={agent} size={32} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {agent.slug !== '__nexus' ? (
                      <p className="mb-1 text-[11px] font-medium" style={{ color }}>
                        {agent.name}
                      </p>
                    ) : null}
                    {m.isError ? (
                      <p className="text-sm leading-relaxed text-red-300">{m.content}</p>
                    ) : m.streaming && !m.content ? (
                      <span
                        className="flex items-center gap-2 py-1.5"
                        role="status"
                        aria-label={localizeStatus(statusText) || t('chat.thinking')}
                      >
                        <span className="flex items-center gap-1" aria-hidden>
                          <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                          <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                          <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                        </span>
                        {statusText ? (
                          <span className="nx-status-shimmer text-xs text-zinc-500">{localizeStatus(statusText)}</span>
                        ) : null}
                      </span>
                    ) : (
                      /* Theme-aware prose: in dark mode html.dark activates the
                       * .dark .omni-prose rules; in light mode the base rules
                       * render dark text. (A hardcoded `dark` wrapper here used
                       * to force near-white bold/links on the light background
                       * — the "invisible words in light mode" bug.) */
                      <div className="text-sm text-zinc-100">
                        <Markdown content={m.content} />
                        {m.streaming ? (
                          <span
                            className="ms-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-[#ff5a5f] align-text-bottom"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    )}
                    <AttachmentList items={m.attachments} />
                  </div>
                </div>
              )
            })}

            {/* PENDING INDICATOR — the moment a message is sent, show the
                agent thinking row (avatar + dots + live status) even before
                the first stream event arrives. Never a blank pause. */}
            {streaming && (() => {
              const last = messages[messages.length - 1]
              const waitingForFirstEvent =
                !last || last.role === 'user' || (last.role === 'agent' && !streamIdRef.current)
              return waitingForFirstEvent ? (
                <div className="nx-rise flex gap-3">
                  <AgentAvatar agent={agentOrNexus(pinnedAgent ?? assign?.agentSlug)} size={32} className="mt-0.5" />
                  <div className="flex items-center gap-2 py-1.5" role="status" aria-label={localizeStatus(statusText) || t('chat.working')}>
                    <span className="flex items-center gap-1" aria-hidden>
                      <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                      <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                      <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                    </span>
                    <span className="nx-status-shimmer text-xs text-zinc-500">
                      {localizeStatus(statusText) || t('chat.thinking')}
                    </span>
                  </div>
                </div>
              ) : null
            })()}

            {streaming && messages.length === 0 ? (
              <p className="flex items-center gap-2 ps-11 text-xs text-zinc-500">
                <span className="nx-dot h-1.5 w-1.5 rounded-full bg-[#ff5a5f]" />
                {localizeStatus(statusText) || t('chat.routing')}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* ---------- Composer ---------- */}
      <div className="shrink-0 px-3 pb-3 pt-2 md:px-4 md:pb-4">
        <div className="mx-auto w-full max-w-3xl">
          {attachError ? (
            <p role="alert" className="mb-2 px-1 text-xs text-red-400">
              {attachError}
            </p>
          ) : null}
          {attach ? (
            <div className="nx-rise mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
              <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-[#ff8a8d]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{attach.filename}</span>
              <button
                type="button"
                onClick={() => setAttach(null)}
                aria-label={t('chat.removeAttachment')}
                className="shrink-0 rounded-md p-0.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          {/* ---------- Personality rail (ChatGPT-connector style) ----------
              Scrollable selector above the composer. Picking a personality
              pins it → the backend skips orchestrator routing entirely →
              replies start instantly (the speed fix). "Auto" restores the
              automatic specialist takeover. */}
          <PersonalityRail
            selected={pinnedAgent}
            onSelect={(slug) => onPinnedAgentChange(slug)}
            onOpenDirectory={props.onOpenAgents}
            disabled={streaming}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
            className="nx-composer flex items-end gap-1 rounded-2xl p-1.5"
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.md,.csv,.rtf,.json,.png,.jpg,.jpeg,.webp,.gif"
              onChange={onPickFile}
              tabIndex={-1}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={streaming}
              aria-label={t('chat.attachFile')}
              title={t('chat.attachFile')}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Paperclip className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={streaming}
              placeholder={placeholder}
              aria-label={placeholder}
              className="max-h-[144px] min-h-[40px] flex-1 resize-none bg-transparent px-1.5 py-2.5 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={props.onOpenVoice}
              disabled={streaming}
              aria-label={t('chat.voiceMode')}
              title={t('chat.voiceMode')}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Mic className="h-[18px] w-[18px]" aria-hidden />
            </button>
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label={t('chat.stopGenerating')}
                title={t('chat.stopGenerating')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff5a5f]/15 text-[#ff5a5f] transition hover:bg-[#ff5a5f]/25"
              >
                <Square className="h-4 w-4" fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t('chat.sendMessage')}
                className="nx-gradient-surface grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <ArrowUp className="h-[18px] w-[18px]" aria-hidden />
              </button>
            )}
          </form>
          <p className="mt-2 px-1 text-center text-[10px] text-zinc-600">
            {pinnedAgent
              ? t('chat.hintPinned', { name: headerAgent.name })
              : t('chat.hintAuto', { name: headerAgent.name })}
          </p>
        </div>
      </div>
    </div>
  )
}
