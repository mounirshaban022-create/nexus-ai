'use client'

/**
 * NEXUS — The Agency (task 5-a).
 *
 * App-router entry: auth/guest gate → marketing landing, then the dark
 * agency shell with a single View state driving every screen (home, roster,
 * division, agent, chat, whatsapp, settings).
 */

import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, onAuthChange, signOut } from '@/lib/supabase'
import { usePreferences, applyPreferences } from '@/lib/preferences'
import type { View } from '@/components/agency/shared'
import { AppShell } from '@/components/agency/shell'
import { AgencyLanding } from '@/components/agency/landing'
import { AgencyHome } from '@/components/agency/home'
import { AgencyRoster } from '@/components/agency/roster'
import { AgencyDivisionView } from '@/components/agency/division-view'
import { AgencyAgentProfile } from '@/components/agency/agent-profile'
import { AgencyChat } from '@/components/agency/agency-chat'
import { AgencyOnboarding } from '@/components/agency/onboarding'
import { AgencyAuthModal } from '@/components/agency/auth-modal'
import { WhatsAppMode } from '@/components/omni/whatsapp-mode'
import { SettingsMode } from '@/components/omni/settings-mode'

const ONBOARDING_KEY = 'agency-onboarding-done'
const FAVORITES_KEY = 'agency-favorite-divisions'

export default function Page() {
  // Apply saved theme + language preferences (from Settings). The agency
  // shell is always dark; these classes only affect nested shadcn popups.
  const savedTheme = usePreferences((s) => s.theme)
  const savedLanguage = usePreferences((s) => s.language)
  useEffect(() => {
    applyPreferences(savedTheme, savedLanguage)
  }, [savedTheme, savedLanguage])

  // Navigation model — one View drives the whole app.
  const [view, setView] = useState<View>({ type: 'home' })

  // Auth state (DB cookie sessions via the client bridge).
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setAuthChecked(true))
    const unsubscribe = onAuthChange((u) => {
      setUser(u)
      if (u) setShowAuth(false)
    })
    return unsubscribe
  }, [])

  // First visit → onboarding overlay over the shell.
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Bumped when onboarding completes so AgencyHome remounts and picks up the
  // freshly pinned divisions (it reads localStorage on mount).
  const [homeEpoch, setHomeEpoch] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!localStorage.getItem(ONBOARDING_KEY)) setShowOnboarding(true)
      } catch {
        /* localStorage blocked */
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleAuthOpenChange = useCallback((open: boolean) => {
    setShowAuth(open)
    // Cookie-session auth has no live events — re-fetch the user once the
    // modal closes so an in-modal sign-in is picked up immediately.
    if (!open) {
      getCurrentUser()
        .then((u) => setUser(u))
        .catch(() => {})
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    await signOut()
    setUser(null)
    setView({ type: 'home' })
  }, [])

  const handleOnboardingComplete = useCallback((favoriteDivisions: string[]) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteDivisions))
      localStorage.setItem(ONBOARDING_KEY, 'true')
    } catch {
      /* localStorage blocked */
    }
    setShowOnboarding(false)
    setHomeEpoch((e) => e + 1)
  }, [])

  // While the session cookie is being checked: minimal dark splash so a
  // signed-in user never sees the marketing landing flash.
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <span className="h-3 w-3 animate-pulse rounded-full bg-amber-400" aria-hidden />
        <span className="sr-only">Loading NEXUS — The Agency</span>
      </div>
    )
  }

  // Signed out and not exploring as guest → marketing landing.
  if (!user && !isGuest) {
    return (
      <>
        <AgencyLanding onJoin={() => setShowAuth(true)} onGuest={() => setIsGuest(true)} />
        {showAuth && <AgencyAuthModal open onOpenChange={handleAuthOpenChange} />}
      </>
    )
  }

  // The app shell + view switch.
  return (
    <>
      <AppShell
        view={view}
        setView={setView}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onSignOut={handleSignOut}
      >
        {view.type === 'home' && <AgencyHome key={homeEpoch} user={user} setView={setView} />}

        {view.type === 'roster' && (
          <AgencyRoster
            key={`roster:${view.query ?? ''}|${view.division ?? ''}`}
            initialQuery={view.query}
            initialDivision={view.division}
            setView={setView}
          />
        )}

        {view.type === 'division' && (
          <AgencyDivisionView
            key={`division:${view.divisionId}`}
            divisionId={view.divisionId}
            setView={setView}
          />
        )}

        {view.type === 'agent' && (
          <AgencyAgentProfile
            key={`agent:${view.agentSlug}`}
            agentSlug={view.agentSlug}
            setView={setView}
          />
        )}

        {view.type === 'chat' && (
          <AgencyChat
            key={`chat:${view.agentSlug ?? '__nexus'}::${view.sessionId ?? 'new'}`}
            agentSlug={view.agentSlug}
            sessionId={view.sessionId}
            setView={setView}
          />
        )}

        {view.type === 'whatsapp' && (
          <div className="p-4 md:p-6">
            {/* Legacy light-themed component — the white card on the dark
                shell makes it read as an intentional framed surface. */}
            <div className="mx-auto w-full max-w-6xl rounded-2xl bg-white p-4 text-zinc-900 md:p-6">
              <WhatsAppMode />
            </div>
          </div>
        )}

        {view.type === 'settings' && (
          <div className="p-4 md:p-6">
            <div className="mx-auto w-full max-w-6xl rounded-2xl bg-white p-4 text-zinc-900 md:p-6">
              <SettingsMode />
            </div>
          </div>
        )}
      </AppShell>

      {showOnboarding && <AgencyOnboarding onComplete={handleOnboardingComplete} />}
      {showAuth && <AgencyAuthModal open onOpenChange={handleAuthOpenChange} />}
    </>
  )
}
