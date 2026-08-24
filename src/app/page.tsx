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
import { SettingsMode } from '@/components/omni/settings-mode'
import { ProfileMode } from '@/components/omni/profile-mode'
import { AiModelsMode } from '@/components/omni/ai-models-mode'
import { CodeMode } from '@/components/omni/code-mode'
import { VideoMode } from '@/components/omni/video-mode'
import { AbilityPicker } from '@/components/omni/ability-picker'
import { AuthModal } from '@/components/omni/auth-modal'
import { isSupabaseConfigured, getCurrentUser, onAuthChange, signOut } from '@/lib/supabase'
import { usePreferences, applyPreferences } from '@/lib/preferences'
import { MODES, MODE_MAP, type ModeId } from '@/components/omni/modes'

/** Single subtle ambient glow — premium restraint. */
function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden />
  )
}

// Instagram/Facebook IA: 5 primary destinations, everything else secondary
const PRIMARY_TABS: Array<{ id: ModeId; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'agent', label: 'Agent' },
  { id: 'voice-live', label: 'Voice' },
  { id: 'search', label: 'Search' },
  { id: 'home', label: 'More' },
]

const SECONDARY_MODES: ModeId[] = [
  'image', 'video', 'code', 'office', 'documents',
  'reader', 'vision', 'voice',
  'profile', 'settings', 'models', 'connectors',
]

// Desktop sidebar groups (cleaner)
const GROUPS: Array<{ label: string; ids: ModeId[] }> = [
  { label: '', ids: ['chat', 'agent', 'voice-live'] },
  { label: 'Create', ids: ['image', 'video', 'code', 'office', 'documents'] },
  { label: 'Tools', ids: ['search', 'reader', 'vision', 'voice'] },
  { label: 'Account', ids: ['profile', 'settings', 'models', 'connectors'] },
]

// BUILD VERSION — visible proof of which version is running
const BUILD_VERSION = 'v25'

export default function Page() {
  // Apply saved theme + language preferences (from Settings)
  const savedTheme = usePreferences((s) => s.theme)
  const savedLanguage = usePreferences((s) => s.language)
  useEffect(() => {
    applyPreferences(savedTheme, savedLanguage)
  }, [savedTheme, savedLanguage])

  // Auth state — reactive to sign-in/out anywhere in the app
  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    getCurrentUser().then(setUser).catch(() => {})
    const unsubscribe = onAuthChange((u) => setUser(u))
    return unsubscribe
  }, [])


  // App opens straight into Chat — ChatGPT style
  const [activeMode, setActiveMode] = useState<ModeId>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Show onboarding for first-time users
  const [showOnboarding, setShowOnboarding] = useState(false)

  const completeOnboarding = () => {
    localStorage.setItem('nexus-onboarded', 'true')
    setShowOnboarding(false)
  }

  // Check onboarding after mount (deferred to avoid cascading renders)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!localStorage.getItem('nexus-onboarded')) {
          setShowOnboarding(true)
        }
      } catch { /* localStorage blocked */ }
    }, 100)
    return () => clearTimeout(timer)
  }, [])
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
        {/* Desktop sidebar — ChatGPT style: collapsible, clean */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-300 lg:flex ${
            sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'
          }`}
        >
          {/* Top: collapse toggle + new chat */}
          <div className="flex items-center gap-2 px-3 pt-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-secondary"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {!sidebarCollapsed && (
              <span className="text-sm font-bold tracking-tight">NEXUS</span>
            )}
          </div>

          {/* New Chat button (ChatGPT's primary action) */}
          <div className="px-3 pt-3">
            <button
              onClick={() => setActiveMode('chat')}
              className={`flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-secondary/50 transition hover:bg-secondary ${
                sidebarCollapsed ? 'justify-center px-0' : 'px-3'
              }`}
              aria-label="New chat"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {!sidebarCollapsed && <span className="text-sm font-medium">New Chat</span>}
            </button>
          </div>

          {/* Mode list — clean, no group headers when collapsed */}
          <nav className="omni-scroll mt-3 flex-1 overflow-y-auto px-2" aria-label="AI abilities">
            {GROUPS.map((group) => (
              <div key={group.label || 'main'} className="mb-1">
                {!sidebarCollapsed && group.label && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {group.label}
                  </p>
                )}
                {(sidebarCollapsed ? group.ids.slice(0, 4) : group.ids).map((id) => {
                  const m = MODE_MAP[id]
                  if (!m) return null
                  const Icon = m.icon
                  const active = activeMode === id
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveMode(id)}
                      aria-current={active ? 'page' : undefined}
                      title={sidebarCollapsed ? m.label : undefined}
                      className={`flex h-9 w-full items-center rounded-lg transition ${
                        sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                      } ${
                        active
                          ? 'bg-secondary font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }`}
                    >
                      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary' : ''}`} aria-hidden />
                      {!sidebarCollapsed && <span className="truncate text-sm">{m.label}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Bottom: user profile / sign-in (ChatGPT pattern) */}
          <div className="border-t border-border p-2">
            {user ? (
              <button
                onClick={() => setActiveMode('profile')}
                className={`flex h-10 w-full items-center rounded-lg transition hover:bg-secondary ${
                  sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2'
                }`}
                aria-label="Profile"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {(user.email ?? '?')[0].toUpperCase()}
                </span>
                {!sidebarCollapsed && (
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-medium">{user.email}</span>
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={() => setActiveMode('settings')}
                className={`flex h-10 w-full items-center rounded-lg transition hover:bg-secondary ${
                  sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2'
                }`}
                aria-label="Sign in"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">?</span>
                {!sidebarCollapsed && <span className="text-xs font-medium">Sign in</span>}
              </button>
            )}
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header: minimal (ChatGPT pattern) */}
          <header className="flex items-center justify-between border-b border-border/50 px-4 py-2 lg:hidden">
            <button
              onClick={() => setActiveMode('home')}
              className="flex items-center gap-2"
              aria-label="NEXUS AI home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nexus-icon.png" alt="" className="h-7 w-7 rounded-lg" />
              <span className="text-sm font-bold">NEXUS</span>
            </button>
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
                {activeMode === 'settings' && <SettingsMode />}
                {activeMode === 'profile' && <ProfileMode />}
                {activeMode === 'models' && <AiModelsMode />}
                {activeMode === 'code' && <CodeMode />}
                {activeMode === 'video' && <VideoMode />}
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs — Instagram/Facebook pattern: 5 primary destinations */}
      <nav className="flex items-stretch justify-around border-t border-border bg-background/95 backdrop-blur lg:hidden" aria-label="Primary">
        {PRIMARY_TABS.map(({ id, label }) => {
          const m = MODE_MAP[id]
          const Icon = m.icon
          const active = activeMode === id || (id === 'home' && SECONDARY_MODES.includes(activeMode as any))
          return (
            <button
              key={id}
              onClick={() => setActiveMode(id)}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-2"
            >
              <Icon className={`h-[22px] w-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <span className={`text-[10px] ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Onboarding */}
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
