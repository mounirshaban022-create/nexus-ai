'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { HomeMode } from '@/components/omni/home-mode'
import { ChatMode } from '@/components/omni/chat-mode'
import { ImageMode } from '@/components/omni/image-mode'
import { VisionMode } from '@/components/omni/vision-mode'
import { VoiceMode } from '@/components/omni/voice-mode'
import { SearchMode } from '@/components/omni/search-mode'
import { ReaderMode } from '@/components/omni/reader-mode'
import { AgentMode } from '@/components/omni/agent-mode'
import { ConnectorsMode } from '@/components/omni/connectors-mode'
import { VoiceLiveMode } from '@/components/omni/voice-live-mode'
import { OfficeMode } from '@/components/omni/office-mode'
import { DocumentsMode } from '@/components/omni/documents-mode'
import { AiModelsMode } from '@/components/omni/ai-models-mode'
import { CodeMode } from '@/components/omni/code-mode'
import { VideoMode } from '@/components/omni/video-mode'
import { AbilityPicker } from '@/components/omni/ability-picker'
import { AuthModal } from '@/components/omni/auth-modal'
import { isSupabaseConfigured, getCurrentUser, onAuthChange, signOut } from '@/lib/supabase'
import { MODES, MODE_MAP, type ModeId } from '@/components/omni/modes'

/** Single subtle ambient glow — premium restraint. */
function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden />
  )
}

const GROUPS: Array<{ label: string; ids: ModeId[] }> = [
  { label: '', ids: ['chat', 'voice-live', 'agent'] },           // Primary — no label
  { label: 'Create', ids: ['code', 'video', 'image', 'office', 'documents'] },
  { label: 'Tools', ids: ['search', 'reader', 'vision', 'voice'] },
  { label: 'Platform', ids: ['models', 'connectors'] },
]

// BUILD VERSION — visible proof of which version is running
const BUILD_VERSION = 'v25'

export default function Page() {
  // Auto-detect Arabic locale → RTL layout
  useEffect(() => {
    const lang = navigator.language || 'en'
    if (lang.startsWith('ar')) {
      document.documentElement.dir = 'rtl'
      document.documentElement.lang = 'ar'
    }
  }, [])

  // Auth state
  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    getCurrentUser().then(setUser)
    return onAuthChange(setUser)
  }, [])

  // App opens straight into Chat — ChatGPT style
  const [activeMode, setActiveMode] = useState<ModeId>('chat')
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null)

  const openMode = useCallback((mode: ModeId, payload?: string) => {
    if (mode === 'chat' && payload) {
      setChatInitialPrompt(payload)
    }
    setActiveMode(mode)
  }, [])

  const mode = MODE_MAP[activeMode]

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <AuroraBackground />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — organized ability list */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-4">
            { }
            <img
              src="/nexus-icon.png"
              alt="NEXUS AI logo"
              className="omni-glow h-9 w-9 rounded-xl"
            />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight">
                NEXUS <span className="omni-text-gradient">AI</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Infinite connections</p>
            </div>
          </div>

          <nav className="omni-scroll flex-1 overflow-y-auto p-3" aria-label="AI abilities">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </p>
                {group.ids.map((id) => {
                  const m = MODE_MAP[id]
                  if (!m) return null
                  const Icon = m.icon
                  const active = activeMode === id
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveMode(id)}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? 'bg-gradient-to-r from-violet-500/18 via-fuchsia-500/10 to-transparent text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="mode-indicator"
                          className="absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-400"
                          aria-hidden
                        />
                      )}
                      <span
                        className={`icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                          active
                            ? m.accentBorder
                            : 'border-border/50 opacity-70 group-hover:opacity-100'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${active ? m.accentText : 'text-muted-foreground'}`} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">
                          {m.tagline}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="p-3">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  {(user.email ?? '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{user.email}</p>
                  <button onClick={() => signOut()} className="text-[11px] text-muted-foreground hover:text-foreground">
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-left transition hover:bg-secondary"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">?</span>
                <span className="text-sm font-medium">Sign in</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header: logo + ability picker */}
          <header className="flex items-center justify-between border-b border-border/50 px-4 py-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nexus-icon.png" alt="NEXUS AI" className="h-7 w-7 rounded-lg" />
            <AbilityPicker activeMode={activeMode} onSelect={setActiveMode} />
          </header>

          {/* Mode content */}
          <main className="min-h-0 flex-1">
            {/* Chat + Agent + Voice stay mounted to preserve their live state */}
            <div
              className={`h-full min-h-0 ${activeMode === 'chat' ? 'block' : 'hidden'}`}
              aria-hidden={activeMode !== 'chat'}
            >
              <ChatMode
                initialPrompt={chatInitialPrompt}
                onInitialPromptConsumed={() => setChatInitialPrompt(null)}
                headerSlot={
                  <div className="hidden lg:block">
                    <AbilityPicker activeMode={activeMode} onSelect={setActiveMode} />
                  </div>
                }
              />
            </div>
            <div
              className={`h-full min-h-0 ${activeMode === 'agent' ? 'block' : 'hidden'}`}
              aria-hidden={activeMode !== 'agent'}
            >
              <AgentMode />
            </div>
            <div
              className={`h-full min-h-0 ${activeMode === 'voice-live' ? 'block' : 'hidden'}`}
              aria-hidden={activeMode !== 'voice-live'}
            >
              <VoiceLiveMode />
            </div>

            {activeMode !== 'chat' && activeMode !== 'agent' && activeMode !== 'voice-live' && (
              <motion.div
                key={activeMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="h-full min-h-0"
              >
                {activeMode === 'home' && <HomeMode onOpenMode={openMode} />}
                {activeMode === 'connectors' && <ConnectorsMode />}
                {activeMode === 'image' && <ImageMode />}
                {activeMode === 'vision' && <VisionMode />}
                {activeMode === 'voice' && <VoiceMode />}
                {activeMode === 'search' && <SearchMode />}
                {activeMode === 'reader' && <ReaderMode />}
                {activeMode === 'office' && <OfficeMode />}
                {activeMode === 'documents' && <DocumentsMode />}
                {activeMode === 'models' && <AiModelsMode />}
                {activeMode === 'code' && <CodeMode />}
                {activeMode === 'video' && <VideoMode />}
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar — ChatGPT pattern (4 primary + menu) */}
      <nav
        className="flex items-stretch justify-around border-t border-border/50 bg-background/95 backdrop-blur lg:hidden"
        aria-label="Primary"
      >
        {[
          { id: 'chat' as ModeId, label: 'Chat' },
          { id: 'voice-live' as ModeId, label: 'Voice' },
          { id: 'agent' as ModeId, label: 'Agent' },
          { id: 'search' as ModeId, label: 'Search' },
          { id: 'home' as ModeId, label: 'More' },
        ].map(({ id, label }) => {
          const m = MODE_MAP[id]
          const Icon = m.icon
          const active = activeMode === id || (id === 'home' && ['code', 'video', 'image', 'office', 'reader', 'vision', 'voice', 'models', 'connectors', 'home'].includes(activeMode))
          return (
            <button
              key={id}
              onClick={() => setActiveMode(id)}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5"
            >
              <Icon
                className={`h-[22px] w-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`}
                aria-hidden
              />
              <span
                className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Auth modal — re-check user after auth attempt */}
      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false)
            // Re-check auth state after modal closes (sign-in may have completed)
            getCurrentUser().then(setUser).catch(() => {})
          }}
        />
      )}

      {/* Footer — desktop only (mobile has bottom nav) */}
      <footer className="mt-auto hidden shrink-0 border-t border-border/50 lg:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-1.5">
          <p className="text-[11px] text-muted-foreground/70">NEXUS AI · {BUILD_VERSION}</p>
          <p className="text-[11px] text-muted-foreground/70">{mode.label}</p>
        </div>
      </footer>
    </div>
  )
}
