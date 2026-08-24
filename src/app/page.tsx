'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass,
  FolderOpen,
  Books,
  ChatCircleText,
  Plus,
  UserCircle,
  Sparkle,
  PaperclipHorizontal,
  PenNib,
  PaperPlaneRight,
  CaretDown,
  Lightning,
  Brain,
  Eye,
  ImageSquare,
  VideoCamera,
  Code,
  GlobeHemisphereWest,
  EnvelopeSimple,
  BookOpenText,
  Eyes,
  Stack,
  X,
  SignIn,
  UserPlus,
  CircleNotch,
  CaretRight,
  MagicWand,
  Check,
  Headphones,
  Microphone,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, applyPreferences, t } from '@/lib/preferences'
import { useAuth } from '@/hooks/use-auth'
import { AuthModal } from '@/components/omni/auth-modal'
import { Markdown } from '@/components/omni/markdown'
import { AttachmentCard } from '@/components/omni/chat-attachments'
import { Onboarding } from '@/components/omni/onboarding'
import { ProjectsMode } from '@/components/omni/projects-mode'
import { LibraryMode } from '@/components/omni/library-mode'
import { useToolEngine, TOOLS, type ToolId } from '@/components/omni/tool-engine'
import { VoiceModeOverlay } from '@/components/omni/voice-mode-overlay'
import { StudioMode } from '@/components/omni/studio-mode'
import { ConnectPanel } from '@/components/omni/connect-panel'
import { LegalPage } from '@/components/omni/legal-page'
import { ProfileEditModal } from '@/components/omni/profile-edit-modal'
import { AuthLanding } from '@/components/omni/auth-landing'
import { ProfilePage } from '@/components/omni/profile-page'
import { ArtifactPanel, useArtifact, type Artifact } from '@/components/omni/artifact-panel'

// ============ TYPES ============
type TabId = 'chat' | 'projects' | 'explore' | 'library' | 'profile'
type Intelligence = 'auto' | 'fast' | 'reasoning' | 'vision'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: any[]
}

interface ToolMenuItem {
  label: string
  icon: any
  tool: ToolId
}

// ============ MAIN COMPONENT ============
export default function Page() {
  const { theme, language, onboarded, guestMode, setGuestMode } = usePreferences()
  useEffect(() => { applyPreferences(theme, language) }, [theme, language])

  if (!onboarded) return <Onboarding />
  // Dedicated auth landing page (Instagram-style) — shown after onboarding,
  // before the chat, until the user signs in or picks "Continue as guest".
  // Big companies (Instagram, Twitter, Linear) show a dedicated login screen
  // first; this gate satisfies that expectation.
  return <AuthGate
    isGuest={!!guestMode}
    onContinueAsGuest={() => setGuestMode(true)}
    language={language}
    onToggleLanguage={() => usePreferences.getState().setLanguage(language === 'en' ? 'ar' : 'en')}
  />
}

// ============ AUTH GATE ============
function AuthGate({ isGuest, onContinueAsGuest, language, onToggleLanguage }: {
  isGuest: boolean
  onContinueAsGuest: () => void
  language: 'en' | 'ar'
  onToggleLanguage: () => void
}) {
  const { user } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null)

  const openAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  // Listen for "open legal page" requests (Privacy / Terms)
  useEffect(() => {
    const handler = (e: Event) => {
      const tp = (e as CustomEvent<'privacy' | 'terms'>).detail
      if (tp === 'privacy' || tp === 'terms') setLegalPage(tp)
    }
    window.addEventListener('nexus:open-legal', handler as EventListener)
    return () => window.removeEventListener('nexus:open-legal', handler as EventListener)
  }, [])

  // If the user is signed in OR has chosen guest mode, show the app.
  if (user || isGuest) {
    return <NexusApp />
  }

  // Otherwise, show the dedicated auth landing page.
  return (
    <>
      <AuthLanding
        onSignIn={() => openAuth('signin')}
        onSignUp={() => openAuth('signup')}
        onContinueAsGuest={onContinueAsGuest}
        onOpenPrivacy={() => setLegalPage('privacy')}
        onOpenTerms={() => setLegalPage('terms')}
        language={language}
        onToggleLanguage={onToggleLanguage}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
      {legalPage !== null && (
        <LegalPage type={legalPage} onClose={() => setLegalPage(null)} language={language} />
      )}
    </>
  )
}

// ============ APP (post-onboarding) ============
function NexusApp() {
  const { theme, language, toggleTheme, toggleLanguage, name, interests, commStyle, resetOnboarding } = usePreferences()
  const { toast } = useToast()
  useEffect(() => { applyPreferences(theme, language) }, [theme, language])

  // Real auth
  const { user, signOut, fetchMe } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceMounted, setVoiceMounted] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioMounted, setStudioMounted] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null)
  const [profileEditOpen, setProfileEditOpen] = useState(false)

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  /** Tabs the user has VISITED — mounted once, then kept in the DOM with
   *  display:none. This is the fix for the "glitchy navigation": every
   * tab switch used to fully unmount/remount the mode (re-fetching data,
   * flashing loading spinners, losing scroll and form state). Now the
   * first visit mounts a tab lazily and it stays alive forever. */
  const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(() => new Set(['chat']))
  const mountTab = useCallback((tab: TabId) => {
    setMountedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }, [])

  // Intelligence selector
  const [intelligence, setIntelligence] = useState<Intelligence>('auto')
  const [intelOpen, setIntelOpen] = useState(false)

  // Tool menu (the + bottom-sheet)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingActive, setStreamingActive] = useState(false)
  const [toolRunningLabel, setToolRunningLabel] = useState<string | null>(null)

  // Document attachment (paperclip): any file the user attaches goes to
  // the chat with the message — the server parses it and the AI can read,
  // edit, or run PDF operations on it directly in the conversation.
  const [chatAttachment, setChatAttachment] = useState<{ dataUrl: string; filename: string; size: number } | null>(null)
  const chatFileInputRef = useRef<HTMLInputElement>(null)

  const onChatFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Attachments up to 12MB.', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setChatAttachment({ dataUrl: reader.result as string, filename: file.name, size: file.size })
    }
    reader.readAsDataURL(file)
  }, [toast])

  // AUTO-SCROLL (streaming UX): follow the assistant's output as it
  // streams in — unless the user deliberately scrolled up to read.
  //   - conversationRef: the chat's overflow-y-auto container
  //   - userScrolledUp: set true when >100px above the bottom; the next
  //     user-sent message resets it so we always jump to the fresh reply.
  const conversationRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  const scrollToBottom = useCallback((force = false) => {
    const el = conversationRef.current
    if (!el) return
    if (force || !userScrolledUp.current) {
      el.scrollTo({ top: el.scrollHeight })
    }
  }, [])

  const handleConversationScroll = useCallback(() => {
    const el = conversationRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUp.current = distanceFromBottom > 100
  }, [])

  // Follow the stream: every new message / delta / tool status updates
  // the DOM — this effect runs after commit and keeps the view pinned to
  // the bottom (when the user hasn't scrolled away).
  useEffect(() => {
    if (!userScrolledUp.current) {
      const el = conversationRef.current
      if (el) el.scrollTo({ top: el.scrollHeight })
    }
  }, [messages, streamingActive, toolRunningLabel])

  // Phase 1 P3: project binding + session continuity.
  //   - activeProjectId: when set, the NEXT chat POST includes this projectId,
  //     so the new session is stamped with the project binding on creation.
  //     Cleared when the user starts a "loose" new chat (no project binding).
  //   - currentChatSessionId: tracks the sessionId returned by the most recent
  //     /api/chat `done` event. Passed in the next message's POST body so the
  //     server resumes the existing session (with its message history +
  //     project context) instead of creating a new one each turn. This fixes
  //     the pre-existing chat-continuity gap (previously every message created
  //     a new session, so follow-up questions lost context).
  //   - activeProjectName: derived from the project list for the chat badge UI.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null)
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null)

  // Phase 1 P2: artifact panel state — tracks the currently-open document/code
  // artifact and queues AI-applied patches (ARTIFACT_PATCH events from the
  // chat stream) so the ArtifactPanel can apply them to the open artifact.
  const {
    artifact: openArtifactState,
    openArtifact,
    closeArtifact,
    pendingPatch,
    enqueuePatch,
    clearPatch,
  } = useArtifact()

  // Tool engine — routes the next message to the right /api/* route
  const toolEngine = useToolEngine(
    // onAssistant: push assistant message into the conversation
    useCallback((msg: { content: string; attachments?: any[] }) => {
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: msg.content, attachments: msg.attachments }])
    }, []),
    // onToolRunning: show a status line above the composer
    useCallback((running: boolean, label?: string) => {
      setToolRunningLabel(running ? (label || 'Working…') : null)
    }, []),
  )

  // Send: routes through tool engine if a tool is pending, else plain chat.
  // Allows empty text when a tool with a file attachment is pending — e.g.
  // user picks a PDF via "Upload file" and just hits Send to get a summary,
  // without being forced to type a question first.
  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    const hasPendingFile = !!toolEngine.pendingFile
    const hasPendingTool = !!toolEngine.pendingTool
    // Block only when there's truly nothing to send
    if (sending) return
    if (!msg && !hasPendingFile && !chatAttachment) return

    // REBUILT ATTACHMENT FLOW: If a chat attachment exists AND a tool is
    // pending, CANCEL the pending tool — the user clearly wants the AI to
    // process the attached file in chat, not run a tool. This fixes the
    // bug where attachments were silently dropped when a tool was active.
    let effectiveHasPendingTool = hasPendingTool
    if (hasPendingTool && chatAttachment) {
      toolEngine.clear()
      effectiveHasPendingTool = false
    }

    // Display the user's text (or the file name as a placeholder)
    const userDisplay = msg || (hasPendingFile ? `📄 ${toolEngine.pendingFile?.name ?? ''}`.trim() : '') || (chatAttachment ? `📎 ${chatAttachment.filename}` : '')
    if (userDisplay) {
      setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: userDisplay }])
    }
    // The user just sent a message — always jump to the bottom and resume
    // following the incoming reply (even if they had scrolled up before).
    userScrolledUp.current = false
    setInput('')
    // Capture + clear the attachment for THIS request (it travels with the
    // message; the server parses it and gives the AI full document powers).
    const attachmentForRequest = chatAttachment
    setChatAttachment(null)
    setSending(true)
    try {
      // If a tool is pending (and NO attachment — attachment cancels tools
      // above), route to the tool engine
      if (effectiveHasPendingTool) {
        await toolEngine.execute(msg)
        return
      }
      // Otherwise: plain chat stream
      // Phase 1 P2: when an artifact is open, pass its current state to the
      // server so the AI can emit ARTIFACT_PATCH directives for targeted
      // edits instead of regenerating the whole document via create_document.
      const openArtifactPayload = openArtifactState
        ? {
            artifactId: openArtifactState.artifactId ?? openArtifactState.id,
            type: openArtifactState.type,
            title: openArtifactState.title,
            // Send the CURRENT version content (latest from AI patches +
            // user edits). The ArtifactPanel holds the version stack but
            // the chat request only needs the latest content for the prompt.
            content: (openArtifactState.content ?? '').slice(0, 20000),
          }
        : null
      // Phase 1 P3: include the session id (for continuity) and the active project
      // id (for new sessions being created inside a project). When resuming an
      // existing session, sessionId is set and projectId is omitted — the
      // server reads session.projectId as the authoritative binding. When
      // starting a new conversation in a project, sessionId is null and
      // projectId is set — the server creates a new session bound to that
      // project.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          language,
          sessionId: currentChatSessionId,
          projectId: activeProjectId,
          openArtifact: openArtifactPayload,
          attachment: attachmentForRequest ? { dataUrl: attachmentForRequest.dataUrl, filename: attachmentForRequest.filename } : null,
        }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamingId: string | null = null

      // Helper: process one NDJSON line. Returns true if a streaming bubble
      // was opened (so the caller can hide the shimmer placeholder).
      //
      // WORD-BY-WORD RENDERING: raw deltas arrive in irregular bursts (a
      // multi-word chunk, then silence, then another). To make replies feel
      // ALIVE, deltas are fed into a smooth-drip queue that emits one small
      // fragment (~1-2 words) every ~24ms — like a person typing. The
      // queue always drains fully before the bubble finalizes.
      let dripQueue: string[] = []
      let dripTimer: number | null = null
      let dripTargetId: string | null = null
      let dripDone = false // set when assistant_end arrives
      const appendToMessage = (id: string, fragment: string) => {
        setMessages(prev => {
          if (!id) return prev
          const next = [...prev]
          const idx = next.findIndex(m => m.id === id)
          if (idx >= 0) {
            const m = next[idx]
            next[idx] = { ...m, content: (m.content || '') + fragment }
          }
          return next
        })
      }
      const startDrip = () => {
        if (dripTimer !== null) return
        dripTimer = window.setInterval(() => {
          if (dripQueue.length === 0) {
            // Nothing queued — pause the timer (restarted on next delta)
            if (dripTimer !== null) { window.clearInterval(dripTimer); dripTimer = null }
            return
          }
          // 1 word per 45ms = ~22 words/sec — clearly visible typing effect
          const frag = dripQueue.shift()!
          if (dripTargetId) appendToMessage(dripTargetId, frag)
          // Catch-up: only when the queue is VERY backed up (>60 words)
          // to keep total render time bounded for very long responses
          if (dripQueue.length > 60) {
            const frag2 = dripQueue.shift()!
            if (dripTargetId) appendToMessage(dripTargetId, frag2)
          }
        }, 45)
      }
      const queueDelta = (id: string, delta: string) => {
        dripTargetId = id
        // Split the delta into word-ish fragments (keep trailing spaces)
        const words = delta.match(/\S+\s*|\s+/g) ?? [delta]
        dripQueue.push(...words)
        startDrip()
      }
      /** Flushes remaining drip text into the message. Called when the
       *  drip finishes naturally OR when we need the full text NOW
       *  (e.g. applying attachments). */
      const flushDrip = (keepAlive = false) => {
        if (dripTimer !== null) { window.clearInterval(dripTimer); dripTimer = null }
        const rest = dripQueue.join('')
        dripQueue = []
        if (rest && dripTargetId) appendToMessage(dripTargetId, rest)
        if (!keepAlive) dripTargetId = null
      }

      const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        try {
          const e = JSON.parse(trimmed)
          // Streaming chat protocol: assistant_start opens a bubble, deltas append, end finalizes.
          if (e.type === 'assistant_start') {
            // Capture streamingId in a local const so the setMessages updater
            // closure below references the SAME value even if streamingId is
            // later mutated by another event before React runs the updater.
            const id = `a-${Date.now()}`
            streamingId = id
            setStreamingActive(true)
            setMessages(prev => [...prev, { id, role: 'assistant', content: '', attachments: [] }])
          } else if (e.type === 'assistant_delta') {
            const delta = e.delta ?? ''
            if (!delta) return
            // Smooth word-by-word drip (feels alive vs. burst-append)
            if (streamingId) queueDelta(streamingId, delta)
          } else if (e.type === 'assistant_end') {
            // DON'T flush the drip here — let the word-by-word rendering
            // finish naturally (it looks alive). Instead, mark done and
            // let attachments apply once the drip queue drains.
            dripDone = true
            // Attachments apply after the drip completes (poll via timeout)
            const id = streamingId
            if (id) {
              const atts = e.attachments ?? []
              setStreamingActive(false)
              // Wait for the drip queue to drain before applying attachments
              // (max 3s safety timeout, then force-flush)
              const waitForDrip = () => {
                if (dripQueue.length === 0 || !dripTimer) {
                  // Drip finished (or never started) — flush + apply attachments
                  flushDrip()
                  setMessages(prev => {
                    const next = [...prev]
                    const idx = next.findIndex(m => m.id === id)
                    if (idx >= 0) {
                      const m = next[idx]
                      if (!m.content && atts.length === 0) {
                        next.splice(idx, 1)
                      } else {
                        next[idx] = { ...m, attachments: atts }
                      }
                    }
                    return next
                  })
                  streamingId = null
                } else {
                  // Still dripping — check again in 100ms
                  setTimeout(waitForDrip, 100)
                }
              }
              // Start checking, but with a 3s safety timeout that force-flushes
              setTimeout(waitForDrip, 50)
              setTimeout(() => {
                if (streamingId === id && dripQueue.length > 0) {
                  flushDrip()
                  setMessages(prev => {
                    const next = [...prev]
                    const idx = next.findIndex(m => m.id === id)
                    if (idx >= 0) {
                      const m = next[idx]
                      if (!m.content && atts.length === 0) {
                        next.splice(idx, 1)
                      } else {
                        next[idx] = { ...m, attachments: atts }
                      }
                    }
                    return next
                  })
                  streamingId = null
                }
              }, 3000)
            } else {
              // No streaming id (shouldn't happen, but safety) — flush now
              flushDrip()
            }
          } else if (e.type === 'assistant') {
            // Legacy non-streamed path (creator-identity shortcut, etc.)
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: e.content, attachments: e.attachments }])
          } else if (e.type === 'artifact_patch') {
            // Phase 1 P2: AI applied a targeted find/replace edit to the
            // open artifact. Queue it for the ArtifactPanel to apply +
            // push as a new version (preserves undo/redo history).
            enqueuePatch({
              artifactId: e.artifactId,
              find: e.find,
              replace: e.replace,
              note: e.note,
            })
          } else if (e.type === 'done') {
            // Phase 1 P3: capture the sessionId returned by the server so the
            // next message resumes this session (with its message history +
            // project context) instead of creating a new one each turn.
            if (typeof e.sessionId === 'string' && e.sessionId) {
              setCurrentChatSessionId(e.sessionId)
            }
          }
        } catch {}
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? '' // keep the last (possibly partial) line for next chunk
        for (const line of lines) handleLine(line)
      }
      // FLUSH: the reader's final chunk often contains a partial line (no
      // trailing '\n' because the stream was closed) AND the TextDecoder
      // may still hold an incomplete UTF-8 sequence (common with Arabic,
      // where chars are 2+ bytes). Both need to be flushed here, otherwise
      // the last 1-2 tokens (e.g. "تك اليوم؟" in an Arabic reply) get lost
      // and the assistant message looks truncated mid-word.
      buf += decoder.decode() // flush remaining UTF-8 bytes
      if (buf.trim()) handleLine(buf)
      buf = ''
      // NOTE: we intentionally do NOT flush the drip here. The reader loop
      // finishing just means the NETWORK stream is done — the word-by-word
      // rendering should continue at its own pace. The assistant_end
      // handler's waitForDrip mechanism handles cleanup. Only flush if
      // assistant_end was never received (abnormal end).
      if (!dripDone) flushDrip()
    } catch (err: any) {
      setStreamingActive(false)
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `⚠️ ${err.message || 'Something went wrong.'}` }])
    } finally {
      setSending(false)
      setStreamingActive(false)
    }
  }, [input, sending, toolEngine, openArtifactState, enqueuePatch, currentChatSessionId, activeProjectId])

  const tr = t[language]
  const TABS: Array<{ id: TabId; label: string; icon: any }> = [
    { id: 'chat', label: tr.chat, icon: ChatCircleText },
    { id: 'projects', label: tr.projects, icon: FolderOpen },
    { id: 'explore', label: tr.explore, icon: Compass },
    { id: 'library', label: tr.library, icon: Books },
    { id: 'profile', label: tr.profile, icon: UserCircle },
  ]

  const INTEL_OPTIONS: Array<{ id: Intelligence; label: string; desc: string; icon: any }> = [
    { id: 'auto', label: tr.intelAuto, desc: tr.intelAutoDesc, icon: Sparkle },
    { id: 'fast', label: tr.intelFast, desc: tr.intelFastDesc, icon: Lightning },
    { id: 'reasoning', label: tr.intelReasoning, desc: tr.intelReasoningDesc, icon: Brain },
    { id: 'vision', label: tr.intelVision, desc: tr.intelVisionDesc, icon: Eye },
  ]

  const TOOL_MENU: Array<{ category: string; items: ToolMenuItem[] }> = [
    { category: 'Create', items: [
      { label: 'Image', icon: ImageSquare, tool: 'image' },
      { label: 'Video', icon: VideoCamera, tool: 'video' },
      // THE one document tool — Studio does everything the old scattered
      // tools did (Writing / Office / Documents / Upload / Document
      // analysis) in a single Claude-canvas + Canva-class suite.
      { label: 'Studio', icon: Stack, tool: 'studio' },
    ]},
    { category: 'Understand', items: [
      { label: 'Camera', icon: Eyes, tool: 'vision' },
      { label: 'Vision', icon: Eye, tool: 'vision' },
    ]},
    { category: 'Think', items: [
      { label: 'Deep research', icon: GlobeHemisphereWest, tool: 'search' },
      { label: 'Reasoning', icon: Brain, tool: 'agent' },
    ]},
    { category: 'Work', items: [
      { label: 'Code', icon: Code, tool: 'code' },
      { label: 'Data analysis', icon: BookOpenText, tool: 'code' },
    ]},
    { category: 'Connect', items: [
      { label: 'Web search', icon: GlobeHemisphereWest, tool: 'search' },
      { label: 'Connected apps', icon: Plus, tool: 'connectors' },
      { label: 'Email', icon: EnvelopeSimple, tool: 'email' },
    ]},
  ]

  // Premium gradient per tool — warm, cohesive, no blue/indigo.
  const TOOL_GRADIENT: Record<string, string> = {
    image:      'from-rose-500 to-orange-500',
    video:      'from-orange-500 to-amber-500',
    studio:     'from-fuchsia-500 to-pink-500',
    vision:     'from-orange-500 to-rose-500',
    search:     'from-amber-500 to-yellow-500',
    agent:      'from-fuchsia-500 to-pink-500',
    code:       'from-amber-500 to-yellow-500',
    connectors: 'from-rose-500 to-red-500',
    email:      'from-orange-500 to-amber-500',
  }

  const SUGGESTIONS: Array<{ title: string; subtitle: string; icon: any; tool?: ToolId }> = [
    { title: tr.suggestResearch, subtitle: tr.suggestResearchSub, icon: GlobeHemisphereWest, tool: 'search' },
    { title: tr.suggestAnalyze, subtitle: tr.suggestAnalyzeSub, icon: Stack, tool: 'studio' },
    { title: tr.suggestCreate, subtitle: tr.suggestCreateSub, icon: MagicWand, tool: 'image' },
    { title: tr.suggestCode, subtitle: tr.suggestCodeSub, icon: Code, tool: 'code' },
  ]

  // Display name priority: auth user → preferences name → 'Guest'
  const displayName = user?.name || name.trim() || (user?.email ? user.email.split('@')[0] : 'Guest')
  const displayInitial = (user?.name?.[0] || user?.email?.[0] || name.trim()[0] || 'G').toUpperCase()

  const openAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  // Lazy-mount the voice overlay so its hooks don't re-evaluate on every keystroke
  // until the user actually opens voice mode.
  useEffect(() => {
    if (voiceOpen) setVoiceMounted(true)
  }, [voiceOpen])

  // Same lazy-mount pattern for the Studio (BlockNote + Excalidraw are heavy).
  useEffect(() => {
    if (studioOpen) setStudioMounted(true)
  }, [studioOpen])

  // Listen for "open connect panel" requests from inline email cards
  useEffect(() => {
    const handler = () => setConnectOpen(true)
    window.addEventListener('nexus:open-connect', handler)
    return () => window.removeEventListener('nexus:open-connect', handler)
  }, [])

  // Listen for "open legal page" requests (Privacy / Terms) — mirrors the
  // nexus:open-connect pattern; e.detail.type is 'privacy' | 'terms'.
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<'privacy' | 'terms'>).detail
      if (t === 'privacy' || t === 'terms') setLegalPage(t)
    }
    window.addEventListener('nexus:open-legal', handler as EventListener)
    return () => window.removeEventListener('nexus:open-legal', handler as EventListener)
  }, [])

  // Listen for "send this message" requests from answer follow-up chips
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<string>).detail
      if (typeof q === 'string' && q.trim()) send(q)
    }
    window.addEventListener('nexus:send-message', handler as EventListener)
    return () => window.removeEventListener('nexus:send-message', handler as EventListener)
  }, [send])

  const handleToolPick = (tool: ToolId, label: string) => {
    setToolMenuOpen(false)
    // Connectors opens the Connect panel directly (no prompt needed)
    if (tool === 'connectors') {
      setConnectOpen(true)
      return
    }
    // Studio opens the unified creative suite directly (docs + canvas +
    // AI + import/export) — replaces the old scattered document tools.
    if (tool === 'studio') {
      setStudioOpen(true)
      return
    }
    toolEngine.setPendingTool(tool)
    // Focus the textarea so the user can type their prompt immediately
    setTimeout(() => {
      const ta = document.querySelector('textarea[name="nexus-input"]') as HTMLTextAreaElement | null
      ta?.focus()
    }, 50)
  }

  const pendingToolDef = toolEngine.pendingTool ? TOOLS[toolEngine.pendingTool] : null

  /** Unified tab switch — closes every overlay (Intelligence dropdown,
   *  tool bottom-sheet, ...) so nothing can orphan on top of the target
   *  tab and block navigation (the "stuck nav" glitch). Also marks the
   *  tab as mounted (keep-alive). */
  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
    setIntelOpen(false)
    setToolMenuOpen(false)
    mountTab(tab)
  }, [mountTab])

  return (
    <div className="nexus-shell bg-background">
      {/* Hidden file input for tool uploads — uses the tool engine's ref */}
      <input
        ref={toolEngine.fileInputRef}
        type="file"
        className="hidden"
        onChange={toolEngine.onFilePicked}
      />

      {/* Hidden file input for chat attachments (paperclip) — parsed
          server-side; the AI can read/edit/PDF-operate on the file. */}
      <input
        ref={chatFileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
        className="hidden"
        onChange={onChatFilePicked}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />

      {/* Voice overlay is lazy-mounted — its hooks only evaluate once opened */}
      {voiceMounted && (
        <VoiceModeOverlay open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      )}

      {/* NEXUS Studio — the unified document + canvas suite (BlockNote +
          Excalidraw), lazy-mounted like the voice overlay. */}
      {studioMounted && (
        <StudioMode open={studioOpen} onClose={() => setStudioOpen(false)} />
      )}

      <ConnectPanel open={connectOpen} onClose={() => setConnectOpen(false)} />

      <ProfileEditModal open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />

      {/* Phase 1 P2: artifact side panel — opens when a user clicks "Open" on
          a document/code attachment, supports in-place editing + version
          history + AI-applied ARTIFACT_PATCH directives from the chat stream. */}
      <ArtifactPanel
        artifact={openArtifactState}
        onClose={closeArtifact}
        patch={pendingPatch}
      />

      {legalPage !== null && (
        <LegalPage
          type={legalPage}
          onClose={() => setLegalPage(null)}
          language={language}
        />
      )}

      {/* ====== DESKTOP SIDEBAR ====== */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
          <div className="px-4 pt-5 pb-2">
            <Image
              src="/nexus-header-logo.png"
              alt="Nexus"
              width={120}
              height={40}
              priority
              className="h-8 w-auto"
            />
          </div>
          <div className="px-3 pt-2">
            <button onClick={() => { switchTab('chat'); setMessages([]); toolEngine.clear(); setCurrentChatSessionId(null); setActiveProjectId(null); setActiveProjectName(null); setChatAttachment(null) }} className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 text-sm font-medium transition hover:border-primary/30 hover:bg-secondary/60 hover:shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span>{tr.newChat}</span>
              <kbd className="ml-auto rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
            </button>
          </div>
          <nav className="flex-1 space-y-1 p-3" aria-label="Navigation">
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => switchTab(tab.id)}
                  className={`relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left transition ${active ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-secondary/60'}`}
                >
                  {active && <motion.span layoutId="side-active" className="absolute left-0 h-5 w-1 rounded-full bg-primary" style={{ top: '50%', transform: 'translateY(-50%)' }} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                  <Icon size={18} weight={active ? 'fill' : 'duotone'} className={active ? 'text-primary' : ''} aria-hidden />
                  <span className="text-sm">{tab.label}</span>
                </motion.button>
              )
            })}
          </nav>
          <div className="border-t border-border p-3">
            <button onClick={() => switchTab('profile')} className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-secondary hover:ring-1 hover:ring-border">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-primary-foreground ring-2 ring-border">{displayInitial}</span>
              <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-[11px] text-muted-foreground">{user?.email || 'Guest mode'}</span>
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          </div>
        </aside>

        {/* ====== MAIN CONTENT ====== */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Wrap chat header + intel dropdown in a relative container so the
              absolute intel dropdown anchors against the chat header instead
              of the viewport. */}
          <div className="relative">
          {/* Mobile header — solid bg (no backdrop-blur to avoid repaint cost on scroll) */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background px-4 py-2.5 lg:hidden">
            <Image
              src="/nexus-header-logo.png"
              alt="Nexus"
              width={112}
              height={37}
              priority
              className="h-7 w-auto"
            />
            <div className="flex items-center gap-2">
              <button onClick={() => setVoiceOpen(true)} aria-label="Voice mode"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-primary transition hover:bg-secondary"
              >
                <Headphones className="h-4 w-4" />
              </button>
              <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-secondary">
                {intelligence === 'auto' ? <Sparkle size={14} weight="fill" /> : intelligence === 'reasoning' ? <Brain size={14} weight="fill" /> : intelligence === 'vision' ? <Eye size={14} weight="fill" /> : <Lightning size={14} weight="fill" />}
                <span className="capitalize">{intelligence}</span>
                <CaretDown className="h-3 w-3" />
              </button>
            </div>
          </header>

          {/* Desktop chat sub-header — stays mounted (hidden when the chat tab
              is inactive) so switching tabs doesn't cause a 41px layout jump. */}
          <div
            className="hidden items-center justify-between border-b border-border/50 px-5 py-2 lg:flex"
            style={activeTab === 'chat' ? undefined : { display: 'none' }}
          >
              <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition hover:bg-secondary">
                {intelligence === 'auto' ? <Sparkle size={16} weight="fill" /> : intelligence === 'reasoning' ? <Brain size={16} weight="fill" /> : intelligence === 'vision' ? <Eye size={16} weight="fill" /> : <Lightning size={16} weight="fill" />}
                <span className="capitalize">Nexus {intelligence}</span>
                <CaretDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setVoiceOpen(true)} aria-label="Voice mode"
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-secondary"
              >
                <Headphones className="h-3.5 w-3.5" />
                <span>Voice</span>
              </button>
          </div>

          <AnimatePresence>
            {intelOpen && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="absolute right-4 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl lg:right-8 lg:top-16"
              >
                <div className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">Intelligence</p>
                </div>
                <div className="p-2">
                  {INTEL_OPTIONS.map(o => {
                    const Icon = o.icon
                    return (
                      <button key={o.id} onClick={() => { setIntelligence(o.id); setIntelOpen(false) }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${intelligence === o.id ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${intelligence === o.id ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{o.desc}</p>
                        </div>
                        {intelligence === o.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* ====== CONTENT AREA ====== */}
          {/* The chat tab stays MOUNTED (display:none when inactive) instead of
              unmounting — switching to Projects/Explore/Profile and back used to
              reset the conversation scroll position to the top (navigation
              glitch) and re-run entrance animations. Keeping it in the DOM
              preserves scroll, composer text, and streaming state. */}
          <div
            className="flex flex-1 flex-col min-h-0"
            style={activeTab === 'chat' ? undefined : { display: 'none' }}
          >
            {/* Conversation area */}
            <div
              ref={conversationRef}
              onScroll={handleConversationScroll}
              className="omni-scroll flex-1 overflow-y-auto"
            >
                <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-8">
                  {/* Empty state — compact on mobile so the bottom nav stays
                      visible without the page scrolling past the viewport. */}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 sm:py-14">
                      {/* Premium app-icon mark with a soft brand glow */}
                      <div className="relative mb-5 sm:mb-6">
                        <div aria-hidden className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-2xl" />
                        <Image src="/nexus-mark.png" alt="Nexus" width={72} height={72} priority className="h-14 w-14 sm:h-16 sm:w-16 rounded-[1.25rem] shadow-lg shadow-primary/20 ring-1 ring-black/5" />
                      </div>
                      <h1 className="text-[26px] sm:text-3xl leading-tight font-semibold tracking-tight text-center">
                        {displayName !== 'Guest' ? (
                          language === 'ar'
                            ? <>{tr.emptyTitleUser} <span className="text-brand-gradient">{displayName.split(' ')[0]}</span>، بمَ يمكنني مساعدتك؟</>
                            : <>{tr.emptyTitleUser} <span className="text-brand-gradient">{displayName.split(' ')[0]}</span>, what can I help with?</>
                        ) : (
                          language === 'ar'
                            ? <>{tr.emptyTitleGuest} <span className="text-brand-gradient">Nexus</span> أن يُساعدك؟</>
                            : <>{tr.emptyTitleGuest} <span className="text-brand-gradient">Nexus</span> help with?</>
                        )}
                      </h1>
                      <p className="mt-2.5 sm:mt-3 text-[13px] sm:text-sm text-muted-foreground/90 text-center max-w-md">{tr.emptyHelp}</p>
                      <div className="mt-6 sm:mt-8 grid w-full max-w-2xl grid-cols-2 gap-2.5 sm:gap-3">
                        {SUGGESTIONS.map((s, i) => {
                          const Icon = s.icon
                          return (
                            <button
                              key={s.title}
                              onClick={() => send(s.title)}
                              className="group flex items-start gap-2.5 sm:gap-3 rounded-2xl border border-border/80 bg-card/80 p-3.5 sm:p-4 text-left backdrop-blur-sm transition-all duration-200 hover:border-primary/35 hover:bg-card hover:shadow-lg hover:shadow-primary/[0.06] active:scale-[0.98]"
                            >
                              <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-primary/10 text-primary">
                                <Icon className="h-4 w-4" aria-hidden />
                              </span>
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-xs sm:text-sm font-medium">{s.title}</span>
                                <span className="text-[10px] sm:text-[11px] text-muted-foreground">{s.subtitle}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* Messages */}
                  <div className="flex flex-col gap-5 sm:gap-7">
                    {messages.map(m => (
                      <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        {m.role === 'user' ? (
                          <div className="max-w-[85%] rounded-3xl rounded-tr-md bg-primary/[0.08] border border-primary/15 px-4 py-2.5 text-[15px] leading-relaxed">{m.content}</div>
                        ) : (
                          <div className="max-w-[90%]">
                            {streamingActive && !m.content && m.id === messages[messages.length - 1]?.id ? (
                              /* Typing indicator — bridges the gap between the bubble
                                 opening and the first token arriving (Z.ai latency or
                                 anonymous-fallback handoff). */
                              <span className="inline-flex items-center gap-1 py-2" aria-label="Assistant is typing">
                                <span className="nexus-typing-dot" />
                                <span className="nexus-typing-dot" />
                                <span className="nexus-typing-dot" />
                              </span>
                            ) : (
                              <Markdown content={m.content} />
                            )}
                            {streamingActive && m.id === messages[messages.length - 1]?.id && !!m.content && (
                              <span className="nexus-caret align-middle" aria-hidden />
                            )}
                            {m.attachments?.map((a, i) => <AttachmentCard key={i} attachment={a} onOpenArtifact={openArtifact} />)}
                          </div>
                        )}
                      </div>
                    ))}
                    {((sending && !streamingActive) || toolRunningLabel) && (
                      <div className="flex items-center gap-2 px-1">
                        {toolRunningLabel ? (
                          <>
                            <CircleNotch className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">{toolRunningLabel}</span>
                          </>
                        ) : (
                          <div className="flex flex-col gap-2 rounded-2xl bg-secondary/60 px-4 py-3">
                            <span className="omni-shimmer h-3 w-24 rounded-full" />
                            <span className="omni-shimmer h-3 w-32 rounded-full" />
                            <span className="omni-shimmer h-3 w-20 rounded-full" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ====== COMPOSER ====== */}
              <div className="border-t border-border bg-background">
                <form className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-3" onSubmit={e => { e.preventDefault(); send() }}>
                  {/* Phase 1 P3: active-project banner — shows when the user is
                      chatting inside a project. Click X to start a loose chat
                      (clears the project binding; the NEXT message creates a
                      new session without a project). The current session's
                      project binding is preserved server-side on the session
                      row, so resuming it later still applies the project
                      context. */}
                  {activeProjectId && activeProjectName && (
                    <div className="flex items-center gap-2 self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
                      <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{activeProjectName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          // Clear the binding for the NEXT message. Doesn't
                          // affect the current session's existing project
                          // binding (server-side). Just stops future new
                          // sessions from inheriting the project context.
                          setActiveProjectId(null)
                          setActiveProjectName(null)
                        }}
                        className="ml-0.5 rounded-full p-0.5 text-amber-700/70 transition hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
                        aria-label="Clear project binding"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {/* Pending tool banner */}
                  {pendingToolDef && (
                    <div className="flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5">
                      {(() => {
                        const Icon = TOOL_MENU.flatMap(c => c.items).find(i => i.tool === toolEngine.pendingTool)?.icon || Sparkle
                        return <Icon className="h-3.5 w-3.5 text-primary" />
                      })()}
                      <span className="text-xs font-medium text-primary">{pendingToolDef.label}</span>
                      {toolEngine.pendingFile && (
                        <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                          <PaperclipHorizontal className="h-2.5 w-2.5" />
                          {toolEngine.pendingFile.name.slice(0, 20)}
                          <button type="button" onClick={() => toolEngine.clearPendingFile()} className="ml-0.5">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      )}
                      <button type="button" onClick={() => toolEngine.clear()} className="ml-1 text-primary/70 hover:text-primary">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {/* Tool error */}
                  {toolEngine.toolError && (
                    <p className="self-start text-xs text-destructive">{toolEngine.toolError}</p>
                  )}
                  {/* Chat attachment chip — the attached document travels with
                      the next message; the AI can read, edit, or run PDF ops on it. */}
                  {chatAttachment && (
                    <div className="flex items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                      <PaperclipHorizontal className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      <span className="max-w-[220px] truncate text-xs font-medium text-emerald-700">{chatAttachment.filename}</span>
                      <span className="text-[10px] text-emerald-600/70">{(chatAttachment.size / 1024).toFixed(0)}KB · AI can edit this</span>
                      <button type="button" onClick={() => setChatAttachment(null)} aria-label="Remove attachment" className="text-emerald-700/70 hover:text-emerald-700">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="relative flex flex-1 items-end rounded-3xl border border-border/70 bg-card shadow-sm transition-colors duration-200 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-md focus-within:shadow-primary/5">
                    <button type="button" onClick={() => setToolMenuOpen(!toolMenuOpen)}
                      aria-label="Tools" className="flex h-12 w-10 items-center justify-center rounded-l-3xl text-muted-foreground transition hover:text-foreground"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <Textarea name="nexus-input" value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                      placeholder={pendingToolDef?.placeholder || tr.messageNexus} rows={1}
                      className="max-h-40 min-h-[48px] flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[15px] focus-visible:ring-0"
                    />
                    <div className="flex items-center pr-1.5 pb-1">
                      <button type="button" onClick={() => chatFileInputRef.current?.click()}
                        aria-label="Attach a document or PDF"
                        title="Attach a document — the AI can read, edit, and transform it"
                        className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-secondary ${chatAttachment ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <PaperclipHorizontal className="h-[18px] w-[18px]" />
                      </button>
                      <button type="button" onClick={() => setVoiceOpen(true)}
                        aria-label="Open voice mode"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      >
                        <Microphone className="h-[18px] w-[18px]" />
                      </button>
                      <button type="submit" disabled={(!input.trim() && !toolEngine.pendingFile && !chatAttachment) || sending || !!toolRunningLabel} aria-label="Send"
                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-30"
                      >
                        <PaperPlaneRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Tool menu bottom sheet */}
              <AnimatePresence>
                {toolMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setToolMenuOpen(false)} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                      className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-background pb-safe shadow-2xl"
                    >
                      <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
                      <div className="mx-auto max-w-2xl px-4 py-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-semibold">{tr.tools}</h3>
                          <button onClick={() => setToolMenuOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {TOOL_MENU.map(cat => (
                          <div key={cat.category} className="mb-4 last:mb-0">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">{cat.category}</p>
                            <div className="flex flex-wrap gap-2">
                              {cat.items.map((item, idx) => {
                                const Icon = item.icon
                                const grad = TOOL_GRADIENT[item.tool] || 'from-orange-500 to-rose-500'
                                return (
                                  <motion.button
                                    key={`${cat.category}-${item.tool}-${item.label}`}
                                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ delay: idx * 0.03, duration: 0.25 }}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => handleToolPick(item.tool, item.label)}
                                    className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-border bg-card px-3 py-2 text-xs font-medium transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                                  >
                                    <span aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-br ${grad} opacity-0 transition-opacity duration-200 group-hover:opacity-10`} />
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-white shadow-sm`}>
                                      <Icon className="h-3 w-3" aria-hidden />
                                    </span>
                                    {item.label}
                                  </motion.button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

          {/* Explore page — keep-alive: mounts on first visit, stays mounted */}
          {mountedTabs.has('explore') && (
            <div
              className="omni-scroll flex-1 overflow-y-auto"
              style={activeTab === 'explore' ? undefined : { display: 'none' }}
            >
              <div className="mx-auto max-w-2xl px-4 py-8">
                <h1 className="text-2xl font-semibold">Explore Nexus</h1>
                <p className="mt-1 text-sm text-muted-foreground">Discover everything Nexus can do.</p>
                {TOOL_MENU.map(cat => (
                  <section key={cat.category} className="mt-6">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">{cat.category}</h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {cat.items.map((item) => {
                        const Icon = item.icon
                        const grad = TOOL_GRADIENT[item.tool] || 'from-orange-500 to-rose-500'
                        return (
                          <button
                            key={`${cat.category}-${item.tool}-${item.label}`}
                            onClick={() => { switchTab('chat'); handleToolPick(item.tool, item.label) }}
                            className="group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
                          >
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-md`}>
                              <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="text-sm font-semibold">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}

          {/* Projects — keep-alive: mounts on first visit, stays mounted */}
          {mountedTabs.has('projects') && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={activeTab === 'projects' ? undefined : { display: 'none' }}
            >
              <ProjectsMode
                language={language}
                isAuthenticated={!!user}
                active={activeTab === 'projects'}
                onSignIn={() => openAuth('signin')}
                onStartProjectChat={(projectId, projectName) => {
                  // Phase 1 P3: starting a new conversation inside a project.
                  // Set the project binding so the next /api/chat POST stamps
                  // projectId on the new session. Clear the session id (new
                  // session) and the messages (fresh chat). Then switch to
                  // the chat tab — the user types their first message and
                  // the project context is injected server-side.
                  setActiveProjectId(projectId)
                  setActiveProjectName(projectName)
                  setCurrentChatSessionId(null)
                  setMessages([])
                  toolEngine.clear()
                  switchTab('chat')
                }}
              />
            </div>
          )}

          {/* Library — keep-alive: mounts on first visit, stays mounted */}
          {mountedTabs.has('library') && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={activeTab === 'library' ? undefined : { display: 'none' }}
            >
              <LibraryMode active={activeTab === 'library'} />
            </div>
          )}

          {/* Profile — keep-alive: mounts on first visit, stays mounted */}
          {mountedTabs.has('profile') && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={activeTab === 'profile' ? undefined : { display: 'none' }}
            >
              <ProfilePage
                onEditProfile={() => setProfileEditOpen(true)}
                onSignIn={() => openAuth('signin')}
                onSignUp={() => openAuth('signup')}
                onOpenChat={() => { switchTab('chat'); setMessages([]); toolEngine.clear(); setCurrentChatSessionId(null); setActiveProjectId(null); setActiveProjectName(null) }}
                onOpenConnect={() => setConnectOpen(true)}
                onToggleTheme={toggleTheme}
                onToggleLanguage={toggleLanguage}
                onRerunOnboarding={() => { resetOnboarding(); usePreferences.getState().setGuestMode(false) }}
                onOpenPrivacy={() => setLegalPage('privacy')}
                onOpenTerms={() => setLegalPage('terms')}
                theme={theme}
                language={language}
              />
            </div>
          )}
        </main>
      </div>

      {/* ====== MOBILE BOTTOM NAV ======
          Clean, no framer-motion springs, no shared layoutId pill (those
          caused janky repaints on low-end phones and visual messiness).
          Active state is just: top indicator bar + colored icon/label. */}
      <nav className="flex items-stretch justify-around border-t border-border bg-background lg:hidden" aria-label="Primary">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => switchTab(tab.id)} aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 pb-2.5 pt-3 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {active && (
                <span aria-hidden className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />
              )}
              <Icon size={22} weight={active ? 'fill' : 'duotone'} className="transition-transform" aria-hidden />
              <span className={`text-[11px] leading-none transition-colors ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ====== DESKTOP FOOTER ====== */}
      <footer className="nexus-footer relative mt-auto hidden h-11 items-center justify-between border-t bg-background px-6 text-xs text-muted-foreground lg:flex">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground/80">{tr.allSystemsOperational}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold text-brand-gradient">NEXUS AI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">{tr.version}</span>
          <button onClick={() => setLegalPage('privacy')} className="transition hover:text-foreground">{tr.privacy}</button>
          <span aria-hidden>·</span>
          <button onClick={() => setLegalPage('terms')} className="transition hover:text-foreground">{tr.terms}</button>
          <span aria-hidden>·</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  )
}
