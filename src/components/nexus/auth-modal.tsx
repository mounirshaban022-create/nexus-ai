'use client'

/**
 * NEXUS One — premium auth modal (Dialog).
 *
 * Sign in / Create account against /api/auth/signin|signup with inline
 * errors, loading state, gradient submit, mode toggle-link and a
 * "Continue as guest" escape hatch.
 */

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { BrandMark } from './shared'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#ff5a5f]/50 focus:ring-4 focus:ring-[#ff5a5f]/10'

export function NexusAuthModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/${mode === 'signin' ? 'signin' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'signin' ? { email, password } : { email, password, name: name || undefined }
        ),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        return
      }
      onOpenChange(false)
    } catch {
      setError('Network error — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#101012] text-zinc-100 sm:max-w-sm">
        {/* Brand + title */}
        <div className="flex flex-col items-center pb-1 pt-1 text-center">
          <span className="nx-aura relative grid place-items-center rounded-2xl p-2">
            <BrandMark size={44} />
          </span>
          <DialogTitle className="font-display mt-2 text-xl font-bold tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </DialogTitle>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            {mode === 'signin'
              ? 'Sign in to continue your conversations.'
              : 'One account for every superpower.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'signup' ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={80}
                className={inputClass}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Password</span>
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters, 1 digit' : 'Your password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={inputClass}
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-300"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="nx-gradient-surface flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Toggle-link + guest escape hatch */}
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={switchMode}
            className="w-full rounded-lg py-1.5 text-center text-sm text-zinc-400 transition hover:text-zinc-100"
          >
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <span className="font-medium text-zinc-200">Create one</span>
              </>
            ) : (
              <>
                Already have an account? <span className="font-medium text-zinc-200">Sign in</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-lg py-1 text-center text-xs text-zinc-600 transition hover:text-zinc-400"
          >
            Continue as guest →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
