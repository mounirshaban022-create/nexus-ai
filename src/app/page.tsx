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
import { VoiceChatButton } from '@/components/omni/voice-chat'

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
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

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

  const handleToolPick = (tool: ToolId, label: string) => {
    setToolMenuOpen(false)
    toolEngine.setPendingTool(tool)
    // Focus the textarea so the user can type their prompt immediately
    setTimeout(() => {
      const ta = document.querySelector('textarea[name="nexus-input"]') as HTMLTextAreaElement | null
      ta?.focus()
    }, 50)
  }

  // Voice chat: when transcript arrives, put it in the input (so user can edit) and auto-send
  const handleVoiceTranscript = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }])
  }, [])
  const handleVoiceAssistant = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: text }])
  }, [])

  const pendingToolDef = toolEngine.pendingTool ? TOOLS[toolEngine.pendingTool] : null

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Hidden file input for tool uploads — uses the tool engine's ref */}
      <input
        ref={toolEngine.fileInputRef}
        type="file"
        className="hidden"
        onChange={toolEngine.onFilePicked}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />

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
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left transition ${activeTab === t.id ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-secondary/60'}`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  <span className="text-sm">{t.label}</span>
                </button>
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
            <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium transition hover:bg-secondary">
              {intelligence === 'auto' ? <Sparkles className="h-3.5 w-3.5" /> : intelligence === 'reasoning' ? <Brain className="h-3.5 w-3.5" /> : intelligence === 'vision' ? <Eye className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              <span className="capitalize">{intelligence}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </header>

          {activeTab === 'chat' && (
            <div className="hidden items-center justify-between border-b border-border/50 px-5 py-2 lg:flex">
              <button onClick={() => setIntelOpen(!intelOpen)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition hover:bg-secondary">
                {intelligence === 'auto' ? <Sparkles className="h-4 w-4" /> : intelligence === 'reasoning' ? <Brain className="h-4 w-4" /> : intelligence === 'vision' ? <Eye className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                <span className="capitalize">Nexus {intelligence}</span>
                <ChevronDown className="h-3.5 w-3.5" />
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

          {/* ====== CONTENT AREA ====== */}
          {activeTab === 'chat' && (
            <div className="flex flex-1 flex-col min-h-0">
              {/* Conversation area */}
              <div className="omni-scroll flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6">
                  {/* Empty state */}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 shadow-lg">
                        <Sparkles className="h-7 w-7 text-white" />
                      </div>
                      <h1 className="text-2xl font-semibold">
                        {displayName !== 'Guest' ? `Hi ${displayName.split(' ')[0]}, what can I help with?` : 'What can I help you with?'}
                      </h1>
                      <p className="mt-2 text-sm text-muted-foreground">Ask anything, create something, or give Nexus a task.</p>
                      <div className="mt-8 flex flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map(s => (
                          <button key={s} onClick={() => send(s)}
                            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary"
                          >{s}</button>
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
                          <>
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                          </>
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
                    <div className="flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/8 px-3 py-1.5">
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
                  <div className="relative flex flex-1 items-end rounded-[26px] border border-border bg-card shadow-sm">
                    <button type="button" onClick={() => setToolMenuOpen(!toolMenuOpen)}
                      aria-label="Tools" className="flex h-12 w-10 items-center justify-center rounded-l-[26px] text-muted-foreground transition hover:text-foreground"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <Textarea name="nexus-input" value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                      placeholder={pendingToolDef?.placeholder || 'Message Nexus...'} rows={1}
                      className="max-h-40 min-h-[48px] flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[15px] focus-visible:ring-0"
                    />
                    <div className="flex items-center pr-1.5 pb-1">
                      <VoiceChatButton
                        onUserMessage={handleVoiceTranscript}
                        onAssistantReply={handleVoiceAssistant}
                      />
                      <button type="submit" disabled={(!input.trim() && !toolEngine.pendingFile) || sending || !!toolRunningLabel} aria-label="Send"
                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-30"
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
                              {cat.items.map(item => {
                                const Icon = item.icon
                                return (
                                  <button key={`${cat.category}-${item.tool}-${item.label}`} onClick={() => handleToolPick(item.tool, item.label)}
                                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium transition hover:bg-secondary"
                                  >
                                    <Icon className="h-3.5 w-3.5" aria-hidden />
                                    {item.label}
                                  </button>
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
                <h1 className="text-2xl font-semibold">Explore Nexus</h1>
                <p className="mt-1 text-sm text-muted-foreground">Discover everything Nexus can do.</p>
                {TOOL_MENU.map(cat => (
                  <section key={cat.category} className="mt-6">
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">{cat.category}</h2>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {cat.items.map(item => {
                        const Icon = item.icon
                        return (
                          <button key={`${cat.category}-${item.tool}-${item.label}`} onClick={() => { setActiveTab('chat'); handleToolPick(item.tool, item.label) }}
                            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left transition hover:bg-secondary"
                          >
                            <Icon className="h-5 w-5" aria-hidden />
                            <span className="text-sm font-medium">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
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
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-xl font-bold text-white">
                    {displayInitial}
                  </div>
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
                  <Button variant="outline" className="mt-6 w-full rounded-xl" onClick={() => signOut()}>Sign out</Button>
                )}
                {/* Personalization */}
                <section className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Personalization</h3>
                  <div className="space-y-1">
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
                {/* Creator */}
                <div className="mt-8 text-center">
                  <p className="text-xs text-muted-foreground">Built by Mounir Shaaban</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/60">Nexus AI © 2026</p>
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
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-2"
            >
              <Icon className={`h-[22px] w-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <span className={`text-[10px] ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
