'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass,
  FolderKanban,
  Library,
  MessageSquare,
  Plus,
  User,
  Sparkles,
  Paperclip,
  Pencil,
  Send,
  ChevronDown,
  Zap,
  Brain,
  Eye,
  Image as ImageIcon,
  Video,
  Code,
  FileText,
  Globe,
  Mail,
  BookOpen,
  ScanEye,
  FileSearch,
  X,
  LogIn,
  UserPlus,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, applyPreferences } from '@/lib/preferences'
import { useAuth } from '@/hooks/use-auth'
import { AuthModal } from '@/components/omni/auth-modal'
import { Markdown } from '@/components/omni/markdown'
import { AttachmentCard } from '@/components/omni/chat-attachments'
import { Onboarding } from '@/components/omni/onboarding'
import { ProjectsMode } from '@/components/omni/projects-mode'
import { LibraryMode } from '@/components/omni/library-mode'
import { useToolEngine, TOOLS, type ToolId } from '@/components/omni/tool-engine'
import { VoiceModeOverlay } from '@/components/omni/voice-mode-overlay'
import { ConnectPanel } from '@/components/omni/connect-panel'
import { LegalPage } from '@/components/omni/legal-page'
import { ProfileEditModal } from '@/components/omni/profile-edit-modal'
import { Headphones, Mic } from 'lucide-react'

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
  const { theme, language, onboarded } = usePreferences()
  useEffect(() => { applyPreferences(theme, language) }, [theme, language])

  if (!onboarded) return <Onboarding />
  return <NexusApp />
}

// ============ APP (post-onboarding) ============
function NexusApp() {
  const { theme, language, toggleTheme, toggleLanguage, name, interests, commStyle, resetOnboarding } = usePreferences()
  useEffect(() => { applyPreferences(theme, language) }, [theme, language])

  // Real auth
  const { user, signOut, fetchMe } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceMounted, setVoiceMounted] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null)
  const [profileEditOpen, setProfileEditOpen] = useState(false)

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('chat')

  // Intelligence selector
  const [intelligence, setIntelligence] = useState<Intelligence>('auto')
  const [intelOpen, setIntelOpen] = useState(false)

  // Tool menu (the + bottom-sheet)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [toolRunningLabel, setToolRunningLabel] = useState<string | null>(null)

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

  // Send: routes through tool engine if a tool is pending, else plain chat
  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || sending) return
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: msg }])
    setInput('')
    setSending(true)
    try {
      // If a tool is pending, route to the tool engine
      if (toolEngine.pendingTool) {
        await toolEngine.execute(msg)
        return
      }
      // Otherwise: plain chat stream
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const e = JSON.parse(line)
            if (e.type === 'assistant') {
              setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: e.content, attachments: e.attachments }])
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `⚠️ ${err.message || 'Something went wrong.'}` }])
    } finally {
      setSending(false)
    }
  }, [input, sending, toolEngine])

  const TABS: Array<{ id: TabId; label: string; icon: any }> = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'profile', label: 'Profile', icon: User },
  ]

  const INTEL_OPTIONS: Array<{ id: Intelligence; label: string; desc: string; icon: any }> = [
    { id: 'auto', label: 'Auto', desc: 'Best model for the task', icon: Sparkles },
    { id: 'fast', label: 'Fast', desc: 'Quick everyday conversations', icon: Zap },
    { id: 'reasoning', label: 'Reasoning', desc: 'Complex analysis & hard problems', icon: Brain },
    { id: 'vision', label: 'Vision', desc: 'Images & visual understanding', icon: Eye },
  ]

  const TOOL_MENU: Array<{ category: string; items: ToolMenuItem[] }> = [
    { category: 'Create', items: [
      { label: 'Image', icon: ImageIcon, tool: 'image' },
      { label: 'Video', icon: Video, tool: 'video' },
      { label: 'Writing', icon: FileText, tool: 'office' },
    ]},
    { category: 'Understand', items: [
      { label: 'Upload file', icon: Paperclip, tool: 'upload' },
      { label: 'Camera', icon: ScanEye, tool: 'vision' },
      { label: 'Vision', icon: Eye, tool: 'vision' },
      { label: 'Document analysis', icon: FileSearch, tool: 'documents' },
    ]},
    { category: 'Think', items: [
      { label: 'Deep research', icon: Globe, tool: 'search' },
      { label: 'Reasoning', icon: Brain, tool: 'agent' },
      { label: 'Data analysis', icon: BookOpen, tool: 'code' },
    ]},
    { category: 'Work', items: [
      { label: 'Code', icon: Code, tool: 'code' },
      { label: 'Documents', icon: FileText, tool: 'documents' },
      { label: 'Office', icon: FileText, tool: 'office' },
    ]},
    { category: 'Connect', items: [
      { label: 'Web search', icon: Globe, tool: 'search' },
      { label: 'Connected apps', icon: Plus, tool: 'connectors' },
      { label: 'Email', icon: Mail, tool: 'email' },
    ]},
  ]

  // Premium gradient per tool — warm, cohesive, no blue/indigo.
  const TOOL_GRADIENT: Record<string, string> = {
    image:      'from-rose-500 to-orange-500',
    video:      'from-orange-500 to-amber-500',
    office:     'from-pink-500 to-rose-500',
    upload:     'from-amber-500 to-orange-500',
    vision:     'from-orange-500 to-rose-500',
    documents:  'from-rose-500 to-pink-500',
    search:     'from-amber-500 to-yellow-500',
    agent:      'from-fuchsia-500 to-pink-500',
    code:       'from-amber-500 to-yellow-500',
    connectors: 'from-rose-500 to-red-500',
    email:      'from-orange-500 to-amber-500',
  }

  const SUGGESTIONS = [
    'Research something',
    'Analyze a file',
    'Create something',
    'Help me code',
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
    toolEngine.setPendingTool(tool)
    // Focus the textarea so the user can type their prompt immediately
    setTimeout(() => {
      const ta = document.querySelector('textarea[name="nexus-input"]') as HTMLTextAreaElement | null
      ta?.focus()
    }, 50)
  }

  const pendingToolDef = toolEngine.pendingTool ? TOOLS[toolEngine.pendingTool] : null

  return (
    <div className="nexus-shell bg-background">
      {/* Hidden file input for tool uploads — uses the tool engine's ref */}
      <input
        ref={toolEngine.fileInputRef}
        type="file"
        className="hidden"
        onChange={toolEngine.onFilePicked}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />

      {/* Voice overlay is lazy-mounted — its hooks only evaluate once opened */}
      {voiceMounted && (
        <VoiceModeOverlay open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      )}

      <ConnectPanel open={connectOpen} onClose={() => setConnectOpen(false)} />

      <ProfileEditModal open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />

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
            <button onClick={() => { setActiveTab('chat'); setMessages([]); toolEngine.clear() }} className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium transition hover:bg-secondary">
              <Plus className="h-4 w-4" /> New Chat
            </button>
          </div>
          <nav className="flex-1 space-y-1 p-3" aria-label="Navigation">
            {TABS.map(t => {
              const Icon = t.icon
              const active = activeTab === t.id
              return (
                <motion.button
                  key={t.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left transition ${active ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-secondary/60'}`}
                >
                  {active && <motion.span layoutId="side-active" className="absolute left-0 h-5 w-1 rounded-full bg-primary" style={{ top: '50%', transform: 'translateY(-50%)' }} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                  <Icon className={`h-[18px] w-[18px] ${active ? 'text-primary' : ''}`} aria-hidden />
                  <span className="text-sm">{t.label}</span>
                </motion.button>
              )
            })}
          </nav>
          <div className="border-t border-border p-3">
            <button onClick={() => setActiveTab('profile')} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-secondary">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{displayInitial}</span>
              <span className="truncate text-xs font-medium">{displayName}</span>
            </button>
          </div>
        </aside>

        {/* ====== MAIN CONTENT ====== */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Wrap chat header + intel dropdown in a relative container so the
              absolute intel dropdown anchors against the chat header instead
              of the viewport. */}
          <div className="relative">
          {/* Mobile header */}
          <header className="flex items-center justify-between px-4 py-2.5 lg:hidden">
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
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-primary transition hover:bg-secondary"
              >
                <Headphones className="h-4 w-4" />
              </button>
              <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium transition hover:bg-secondary">
                {intelligence === 'auto' ? <Sparkles className="h-3.5 w-3.5" /> : intelligence === 'reasoning' ? <Brain className="h-3.5 w-3.5" /> : intelligence === 'vision' ? <Eye className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                <span className="capitalize">{intelligence}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </header>

          {activeTab === 'chat' && (
            <div className="hidden items-center justify-between border-b border-border/50 px-5 py-2 lg:flex">
              <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition hover:bg-secondary">
                {intelligence === 'auto' ? <Sparkles className="h-4 w-4" /> : intelligence === 'reasoning' ? <Brain className="h-4 w-4" /> : intelligence === 'vision' ? <Eye className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                <span className="capitalize">Nexus {intelligence}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setVoiceOpen(true)} aria-label="Voice mode"
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-secondary"
              >
                <Headphones className="h-3.5 w-3.5" />
                <span>Voice</span>
              </button>
            </div>
          )}

          <AnimatePresence>
            {intelOpen && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="absolute right-4 top-12 z-50 w-64 rounded-2xl border border-border bg-popover p-2 shadow-xl lg:right-8 lg:top-16"
              >
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Choose intelligence</p>
                {INTEL_OPTIONS.map(o => {
                  const Icon = o.icon
                  return (
                    <button key={o.id} onClick={() => { setIntelligence(o.id); setIntelOpen(false) }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${intelligence === o.id ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <div>
                        <p className="text-sm font-medium">{o.label}</p>
                        <p className="text-[11px] text-muted-foreground">{o.desc}</p>
                      </div>
                      {intelligence === o.id && <Sparkles className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* ====== CONTENT AREA ====== */}
          {activeTab === 'chat' && (
            <div className="flex flex-1 flex-col min-h-0">
              {/* Conversation area */}
              <div className="omni-scroll flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6">
                  {/* Empty state */}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                        className="relative mb-6"
                      >
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                          <Image src="/nexus-onboarding-hero.png" alt="Nexus" width={140} height={93} className="h-20 w-auto rounded-2xl shadow-xl shadow-primary/15 ring-1 ring-border/50" />
                        </motion.div>
                        <motion.span aria-hidden className="absolute -inset-3 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent blur-2xl" animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 3, repeat: Infinity }} />
                      </motion.div>
                      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-2xl font-semibold">
                        {displayName !== 'Guest' ? `Hi ${displayName.split(' ')[0]}, what can I help with?` : 'What can I help you with?'}
                      </motion.h1>
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-2 text-sm text-muted-foreground">Ask anything, create something, or give Nexus a task.</motion.p>
                      <div className="mt-8 flex flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((s, i) => (
                          <motion.button
                            key={s}
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.2 + i * 0.06 }}
                            whileHover={{ scale: 1.04, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => send(s)}
                            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                          >{s}</motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Messages */}
                  <div className="flex flex-col gap-6">
                    {messages.map(m => (
                      <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        {m.role === 'user' ? (
                          <div className="max-w-[85%] rounded-3xl rounded-tr-lg bg-secondary px-4 py-2.5 text-[15px]">{m.content}</div>
                        ) : (
                          <div className="max-w-[90%]">
                            <Markdown content={m.content} />
                            {m.attachments?.map((a, i) => <AttachmentCard key={i} attachment={a} />)}
                          </div>
                        )}
                      </div>
                    ))}
                    {(sending || toolRunningLabel) && (
                      <div className="flex items-center gap-2 px-1">
                        {toolRunningLabel ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
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
                  {/* Pending tool banner */}
                  {pendingToolDef && (
                    <div className="flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5">
                      {(() => {
                        const Icon = TOOL_MENU.flatMap(c => c.items).find(i => i.tool === toolEngine.pendingTool)?.icon || Sparkles
                        return <Icon className="h-3.5 w-3.5 text-primary" />
                      })()}
                      <span className="text-xs font-medium text-primary">{pendingToolDef.label}</span>
                      {toolEngine.pendingFile && (
                        <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                          <Paperclip className="h-2.5 w-2.5" />
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
                  <div className="relative flex flex-1 items-end rounded-3xl border border-border bg-card shadow-sm">
                    <button type="button" onClick={() => setToolMenuOpen(!toolMenuOpen)}
                      aria-label="Tools" className="flex h-12 w-10 items-center justify-center rounded-l-3xl text-muted-foreground transition hover:text-foreground"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <Textarea name="nexus-input" value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                      placeholder={pendingToolDef?.placeholder || 'Message Nexus...'} rows={1}
                      className="max-h-40 min-h-[48px] flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[15px] focus-visible:ring-0"
                    />
                    <div className="flex items-center pr-1.5 pb-1">
                      <button type="button" onClick={() => setVoiceOpen(true)}
                        aria-label="Open voice mode"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      >
                        <Mic className="h-[18px] w-[18px]" />
                      </button>
                      <button type="submit" disabled={(!input.trim() && !toolEngine.pendingFile) || sending || !!toolRunningLabel} aria-label="Send"
                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-30"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Tool menu bottom sheet */}
              <AnimatePresence>
                {toolMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setToolMenuOpen(false)} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                      className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-background pb-safe"
                    >
                      <div className="mx-auto max-w-2xl px-4 py-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Tools</h3>
                          <button onClick={() => setToolMenuOpen(false)} className="text-xs text-muted-foreground">Close</button>
                        </div>
                        {TOOL_MENU.map(cat => (
                          <div key={cat.category} className="mb-4">
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
                                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                                  >
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-white`}>
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
          )}

          {/* Explore page */}
          {activeTab === 'explore' && (
            <div className="omni-scroll flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-8">
                <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-semibold">Explore Nexus</motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="mt-1 text-sm text-muted-foreground">Discover everything Nexus can do.</motion.p>
                {TOOL_MENU.map((cat, ci) => (
                  <motion.section
                    key={cat.category}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + ci * 0.06 }}
                    className="mt-6"
                  >
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">{cat.category}</h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {cat.items.map((item, idx) => {
                        const Icon = item.icon
                        const grad = TOOL_GRADIENT[item.tool] || 'from-orange-500 to-rose-500'
                        return (
                          <motion.button
                            key={`${cat.category}-${item.tool}-${item.label}`}
                            whileHover={{ y: -3, scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onClick={() => { setActiveTab('chat'); handleToolPick(item.tool, item.label) }}
                            className="group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
                          >
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-md`}>
                              <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="text-sm font-semibold">{item.label}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.section>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {activeTab === 'projects' && (
            <ProjectsMode />
          )}

          {/* Library */}
          {activeTab === 'library' && (
            <LibraryMode />
          )}

          {/* Profile */}
          {activeTab === 'profile' && (
            <div className="omni-scroll flex-1 overflow-y-auto">
              <div className="mx-auto max-w-md px-4 py-8">
                <div className="flex flex-col items-center">
                  {user?.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={displayName}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full border-2 border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-xl font-bold text-white">
                      {displayInitial}
                    </div>
                  )}
                  <h2 className="mt-3 text-lg font-bold">{displayName}</h2>
                  {user && <span className="text-xs text-muted-foreground">{user.email}</span>}
                  {user && user.createdAt && (
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  <span className="mt-1 text-[11px] text-muted-foreground capitalize">{commStyle} style</span>
                </div>
                {!user ? (
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <Button className="rounded-xl bg-primary text-primary-foreground" onClick={() => openAuth('signin')}>
                      <LogIn className="mr-1.5 h-4 w-4" /> Sign in
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => openAuth('signup')}>
                      <UserPlus className="mr-1.5 h-4 w-4" /> Sign up
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col gap-2">
                    <Button className="rounded-xl bg-primary text-primary-foreground" onClick={() => setProfileEditOpen(true)}>
                      <Pencil className="mr-1.5 h-4 w-4" /> Edit profile
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => signOut()}>Sign out</Button>
                  </div>
                )}
                {/* Personalization */}
                <section className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Personalization</h3>
                  <div className="space-y-1">
                    <button onClick={() => setConnectOpen(true)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> Email & apps</span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={toggleTheme} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span>Theme</span><span className="text-muted-foreground capitalize">{theme}</span>
                    </button>
                    <button onClick={toggleLanguage} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span>Language</span><span className="text-muted-foreground">{language === 'en' ? 'English' : 'العربية'}</span>
                    </button>
                    <button onClick={() => resetOnboarding()} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span>Re-run onboarding</span>
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => setLegalPage('privacy')} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Privacy Policy</span>
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => setLegalPage('terms')} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-secondary">
                      <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Terms of Service</span>
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </section>
                {/* Interests */}
                {interests.length > 0 && (
                  <section className="mt-6">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Your interests</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {interests.map(i => (
                        <span key={i} className="rounded-full border border-border bg-card px-3 py-1 text-xs capitalize text-muted-foreground">{i}</span>
                      ))}
                    </div>
                  </section>
                )}
                {/* Tiny legal footer — the “Built by” credit lives in the desktop footer (Part E) */}
                <div className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                  <button onClick={() => setLegalPage('privacy')} className="transition hover:text-foreground">Privacy</button>
                  <span aria-hidden>·</span>
                  <button onClick={() => setLegalPage('terms')} className="transition hover:text-foreground">Terms</button>
                  <span aria-hidden>·</span>
                  <span>© 2026 NEXUS AI</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ====== MOBILE BOTTOM NAV ====== */}
      <nav className="flex items-stretch justify-around border-t border-border bg-background/95 backdrop-blur lg:hidden" aria-label="Primary">
        {TABS.map(t => {
          const Icon = t.icon
          const active = activeTab === t.id
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} aria-current={active ? 'page' : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5"
            >
              {active && (
                <motion.span layoutId="nav-active" className="absolute inset-x-2 inset-y-1 -z-10 rounded-full bg-primary/10" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
              )}
              <motion.div animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Icon className={`h-[22px] w-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              </motion.div>
              <span className={`text-[10px] ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ====== DESKTOP FOOTER ====== */}
      <footer className="mt-auto hidden h-10 items-center justify-between border-t bg-background/95 px-6 py-3 text-xs text-muted-foreground lg:flex">
        <span>NEXUS AI · by Mounir Shaaban</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setLegalPage('privacy')} className="transition hover:text-foreground">Privacy</button>
          <span aria-hidden>·</span>
          <button onClick={() => setLegalPage('terms')} className="transition hover:text-foreground">Terms</button>
          <span aria-hidden>·</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  )
}
