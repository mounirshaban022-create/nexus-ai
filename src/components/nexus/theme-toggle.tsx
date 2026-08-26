'use client'

/**
 * NEXUS — Light/Dark theme toggle (Task 6).
 *
 * Backed by next-themes `useTheme()`. The `<html>` element's `.dark` class
 * is the single source of truth for theme; this button flips it and
 * next-themes persists the choice to localStorage.
 *
 * SSR-safe: until the component has mounted (useEffect sets `mounted`),
 * it renders a neutral, identical-shape placeholder button so the
 * server-rendered HTML matches the first client render — no hydration
 * mismatch. Once mounted, the correct Sun (in dark) / Moon (in light)
 * icon renders with a brief scale+rotate animation on toggle.
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [spin, setSpin] = useState(false)

  useEffect(() => {
    // Standard React pattern for an SSR-safe "mounted" flag — next-themes'
    // useTheme() returns undefined on the server, so we need to render a
    // neutral placeholder until mounted to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = mounted && theme === 'dark'

  const handleClick = () => {
    setSpin(true)
    // Flip on the next frame so the spin animation has a chance to
    // register before the icon swaps.
    requestAnimationFrame(() => {
      setTheme(isDark ? 'light' : 'dark')
    })
    window.setTimeout(() => setSpin(false), 320)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Toggle light/dark theme"
      title="Toggle light/dark theme"
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 transition hover:border-white/25 hover:bg-white/5 hover:text-zinc-100 ${className}`}
    >
      {mounted ? (
        <span
          className="inline-flex"
          style={{
            transform: spin ? 'rotate(180deg) scale(0.7)' : 'rotate(0deg) scale(1)',
            transition: 'transform 320ms cubic-bezier(0.21, 1.02, 0.73, 1)',
          }}
        >
          {isDark ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </span>
      ) : (
        // Placeholder that occupies the same box as the eventual icon
        // (4x4 = 16px square). Prevents layout shift + hydration mismatch
        // because `useTheme()` returns undefined on the server.
        <span className="block h-4 w-4" aria-hidden />
      )}
    </button>
  )
}
