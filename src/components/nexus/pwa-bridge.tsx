'use client'

/**
 * PWA glue — registers the NEXUS service worker once on mount, and
 * surfaces a lightweight in-app "Install NEXUS" button whenever the
 * browser fires `beforeinstallprompt` (Chrome/Edge/Android; Safari on
 * iOS installs via Share → Add to Home Screen with no event).
 *
 * Rendered inside the root layout so every page gets install support.
 */

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW is progressive enhancement — never block the app */
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setInstallEvent(null))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!installEvent || dismissed) return null

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await installEvent.prompt()
          await installEvent.userChoice
        } catch {
          /* user closed the native dialog */
        }
        setInstallEvent(null)
      }}
      className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition hover:border-[#ff5a5f]/40"
    >
      <Download className="h-3.5 w-3.5 text-[#ff8a8d]" aria-hidden />
      Install NEXUS app
      <span
        role="button"
        tabIndex={0}
        aria-label="Dismiss install prompt"
        onClick={(e) => {
          e.stopPropagation()
          setDismissed(true)
        }}
        onKeyDown={(e) => e.key === 'Enter' && setDismissed(true)}
        className="ms-1 grid h-4 w-4 place-items-center rounded-full hover:bg-muted"
      >
        <X className="h-3 w-3" aria-hidden />
      </span>
    </button>
  )
}
