'use client'

/**
 * NEXUS One — the unified premium chat app.
 *
 * One ChatGPT-style conversation where 255 specialist agents auto-take-over
 * for their domain (orchestrator routing), with every superpower inline:
 * images, videos, documents (Word/Excel/PDF), code, CLI, live browser,
 * email, WhatsApp and voice.
 *
 * App-router entry: auth/guest gate → marketing landing, then the shell
 * with a single View state driving every screen.
 */

import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, onAuthChange, signOut } from '@/lib/supabase'
import { usePreferences, applyPreferences } from '@/lib/preferences'
import type { View, AppUser } from '@/components/nexus/shared'
import { BrandMark } from '@/components/nexus/shared'
import { NexusShell } from '@/components/nexus/shell'
import { NexusLanding } from '@/components/nexus/landing'
import { NexusChat } from '@/components/nexus/chat'
import { NexusAuthModal } from '@/components/nexus/auth-modal'
import { AgentsDirectory, AgentsDirectoryPage } from '@/components/nexus/agents-directory'
import { VoiceOverlay } from '@/components/nexus/voice-overlay'
import { FramedPanel } from '@/components/nexus/framed-panel'
import { WhatsAppMode } from '@/components/omni/whatsapp-mode'
import { NexusSettingsMode } from '@/components/nexus/settings-mode'
import { SkillsMode } from '@/components/omni/skills-mode'
import { translate } from '@/lib/i18n'

export default function Page() {
  // Apply saved theme + language preferences (from Settings). The nexus
  // shell is always dark; these classes only affect nested shadcn popups.
  const savedTheme = usePreferences((s) => s.theme)
  const savedLanguage = usePreferences((s) => s.language)
  useEffect(() => {
    applyPreferences(savedTheme, savedLanguage)
  }, [savedTheme, savedLanguage])

  // Navigation model — one View drives the whole app.
  const [view, setView] = useState<View>({ type: 'chat' })

  // Auth state (DB cookie sessions via the client bridge).
  const [user, setUser] = useState<AppUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u as AppUser | null))
      .catch(() => {})
      .finally(() => setAuthChecked(true))
    const unsubscribe = onAuthChange((u) => {
      setUser(u as AppUser | null)
      if (u) setShowAuth(false)
    })
    return unsubscribe
  }, [])

  const handleAuthOpenChange = useCallback((open: boolean) => {
    setShowAuth(open)
    // Cookie-session auth has no live events — re-fetch the user once the
    // modal closes so an in-modal sign-in is picked up immediately.
    if (!open) {
      getCurrentUser()
        .then((u) => setUser(u as AppUser | null))
        .catch(() => {})
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    await signOut()
    setUser(null)
    setIsGuest(false)
    setView({ type: 'chat' })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Chat session state — shared between shell (sidebar list) and the  */
  /* chat view (active conversation).                                  */
  /* ---------------------------------------------------------------- */

  // Bumped whenever a message lands in a NEW session → sidebar refetches.
  const [sessionRefresh, setSessionRefresh] = useState(0)
  // Remounts the chat component fresh (New chat / switch session).
  const [chatEpoch, setChatEpoch] = useState(0)
  // The session the chat view is currently bound to.
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  // Pinned specialist for the current chat (null = auto-routing).
  const [pinnedAgent, setPinnedAgent] = useState<string | null>(null)
  // Composer prefill (e.g. suggestion chip / opener prompt).
  const [prefill, setPrefill] = useState<string | undefined>(undefined)
  // Overlays.
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // ?voice=1 deep link — the voice overlay's "Open voice in a new tab"
  // escape hatch (for embedded previews where the browser blocks the mic)
  // lands here and jumps straight into voice mode in a first-party tab,
  // where the browser will prompt for microphone permission.
  // NOTE: must stay an effect (not a lazy initializer) — the server-rendered
  // HTML can't know the query param, so setting it during first render would
  // cause a hydration mismatch.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('voice') === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link read is client-only by design
        setVoiceOpen(true)
      }
    } catch {
      /* no-op */
    }
  }, [])

  const handleNewChat = useCallback(() => {
    setActiveSessionId(undefined)
    setPinnedAgent(null)
    setPrefill(undefined)
    setChatEpoch((e) => e + 1)
    setView({ type: 'chat' })
  }, [])

  const handleSessionSelect = useCallback((id: string) => {
    setActiveSessionId(id)
    setPrefill(undefined)
    setChatEpoch((e) => e + 1)
    setView({ type: 'chat', sessionId: id })
  }, [])

  const handleSessionCreated = useCallback((id: string) => {
    setActiveSessionId((current) => (current === id ? current : id))
    setSessionRefresh((n) => n + 1)
  }, [])

  const handlePinAgent = useCallback((slug: string) => {
    setPinnedAgent(slug)
    setDirectoryOpen(false)
  }, [])

  const handleUnpinAgent = useCallback(() => {
    setPinnedAgent(null)
  }, [])

  const handleNewChatWith = useCallback((slug: string) => {
    setActiveSessionId(undefined)
    setPinnedAgent(slug)
    setPrefill(undefined)
    setDirectoryOpen(false)
    setChatEpoch((e) => e + 1)
    setView({ type: 'chat' })
  }, [])

  /* Hand a skill prompt to the chat composer. The chat consumes `prefill`
   * on mount only (useState initializer), so bump chatEpoch to remount it —
   * same pattern as handleNewChat / handleSessionSelect. */
  const handleUseSkillInChat = useCallback((prompt: string) => {
    setPrefill(prompt)
    setChatEpoch((e) => e + 1)
    setView({ type: 'chat' })
  }, [])

  // While the session cookie is being checked: minimal dark splash so a
  // signed-in user never sees the marketing landing flash.
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <BrandMark size={44} className="animate-pulse" />
        <span className="sr-only">Loading NEXUS</span>
      </div>
    )
  }

  // Signed out and not exploring as guest → marketing landing.
  if (!user && !isGuest) {
    return (
      <>
        <NexusLanding onJoin={() => setShowAuth(true)} onGuest={() => setIsGuest(true)} />
        {showAuth && <NexusAuthModal open onOpenChange={handleAuthOpenChange} />}
        {/* ?voice=1 deep link works from the landing too — voice chat is a
            guest-capable flow (sessions are server-side and unauthenticated). */}
        <VoiceOverlay open={voiceOpen} onOpenChange={setVoiceOpen} />
      </>
    )
  }

  // The app shell + view switch.
  return (
    <>
      <NexusShell
        view={view}
        setView={setView}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onSignOut={handleSignOut}
        refreshKey={sessionRefresh}
        onNewChat={handleNewChat}
        onSessionSelect={handleSessionSelect}
      >
        {view.type === 'chat' && (
          <NexusChat
            key={`chat:${chatEpoch}`}
            sessionId={activeSessionId}
            prefill={prefill}
            pinnedAgent={pinnedAgent}
            onPinnedAgentChange={setPinnedAgent}
            onSessionCreated={handleSessionCreated}
            onOpenAgents={() => setDirectoryOpen(true)}
            onOpenVoice={() => setVoiceOpen(true)}
            onOpenWhatsApp={() => setView({ type: 'whatsapp' })}
          />
        )}

        {view.type === 'agents' && (
          <AgentsDirectoryPage
            pinnedSlug={pinnedAgent}
            onPin={handlePinAgent}
            onUnpin={handleUnpinAgent}
            onNewChatWith={handleNewChatWith}
            onBack={() => setView({ type: 'chat' })}
          />
        )}

        {view.type === 'whatsapp' && (
          <FramedPanel
            fill
            dark
            title="WhatsApp Business"
            description="Connect your number, automate replies with the NEXUS agent, and chat with customers."
          >
            {/* WhatsAppMode is built on shadcn semantic tokens — the .dark
                wrapper resolves them to dark values on the dark framed panel. */}
            <div className="dark flex h-full min-h-0 flex-1 flex-col">
              <WhatsAppMode />
            </div>
          </FramedPanel>
        )}

        {view.type === 'skills' && (
          <FramedPanel
            fill
            dark
            title="Agent Skills"
            description="79 CLI-Anything skills that connect NEXUS to real apps — from Blender and LibreOffice to browser automation and n8n."
          >
            <SkillsMode onUseInChat={handleUseSkillInChat} />
          </FramedPanel>
        )}

        {view.type === 'settings' && (
          <FramedPanel
            fill
            dark
            title={translate('settings.settings', savedLanguage)}
            description={translate('settings.settingsDesc', savedLanguage)}
          >
            <NexusSettingsMode />
          </FramedPanel>
        )}
      </NexusShell>

      {/* Global overlays */}
      <AgentsDirectory
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
        pinnedSlug={pinnedAgent}
        onPin={handlePinAgent}
        onUnpin={handleUnpinAgent}
        onNewChatWith={handleNewChatWith}
      />
      <VoiceOverlay open={voiceOpen} onOpenChange={setVoiceOpen} />
      {showAuth && <NexusAuthModal open onOpenChange={handleAuthOpenChange} />}
    </>
  )
}
