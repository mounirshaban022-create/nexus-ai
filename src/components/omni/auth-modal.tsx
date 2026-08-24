'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'

export interface AuthModalProps {
  open: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function AuthModal({ open, onClose, initialMode = 'signin' }: AuthModalProps) {
  const auth = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  // Sync the mode with the initialMode prop whenever the modal opens.
  // auth.clearError is a stable zustand action; intentionally omitted from deps.
  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setLocalError(null)
      auth.clearError()
    }
  }, [open, initialMode])

  // Auto-focus the first input when the modal opens.
  useEffect(() => {
    if (open && firstFieldRef.current) {
      const id = window.setTimeout(() => firstFieldRef.current?.focus(), 30)
      return () => window.clearTimeout(id)
    }
  }, [open, mode])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Show store errors inline (e.g. "Invalid email or password.").
  useEffect(() => {
    if (auth.error) setLocalError(auth.error)
  }, [auth.error])

  if (!open) return null

  const isSignup = mode === 'signup'

  function validate(): string | null {
    if (isSignup) {
      if (!name.trim()) return 'Please enter your name.'
    }
    if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    return null
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setLocalError(null)
    auth.clearError()

    const err = validate()
    if (err) {
      setLocalError(err)
      return
    }

    setSubmitting(true)
    try {
      if (isSignup) {
        await auth.signUp({ email: email.trim(), password, name: name.trim() })
      } else {
        await auth.signIn(email.trim(), password)
      }
      // Success — close modal & reset fields.
      setName('')
      setEmail('')
      setPassword('')
      onClose()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
      setLocalError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isSignup ? 'Create account' : 'Sign in'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex rounded-xl border border-border p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setLocalError(null)
                auth.clearError()
              }}
              aria-pressed={mode === 'signin'}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setLocalError(null)
                auth.clearError()
              }}
              aria-pressed={mode === 'signup'}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Create account
            </button>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-lg font-semibold">
          {isSignup ? 'Create your NEXUS account' : 'Welcome back to NEXUS'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignup
            ? 'Sign up to save chats, projects, and generated files.'
            : 'Sign in to continue where you left off.'}
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          {isSignup && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-name" className="text-xs font-medium text-foreground">
                Name
              </label>
              <Input
                id="auth-name"
                ref={firstFieldRef}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-11 rounded-xl"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-email" className="text-xs font-medium text-foreground">
              Email
            </label>
            <Input
              id="auth-email"
              ref={isSignup ? undefined : firstFieldRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-password" className="text-xs font-medium text-foreground">
              Password
            </label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-11 rounded-xl"
            />
          </div>

          {localError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {localError}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || auth.loading}
            className="mt-1 h-11 w-full gap-2 rounded-xl bg-primary text-primary-foreground"
          >
            {submitting || auth.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? 'signin' : 'signup')
            setLocalError(null)
            auth.clearError()
          }}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {isSignup
            ? 'Already have an account? Sign in'
            : "Don't have an account? Create one"}
        </button>
      </motion.div>
    </div>
  )
}
