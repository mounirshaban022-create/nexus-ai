'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CircleNotch,
  EnvelopeSimple,
  ShieldCheck,
  SignIn,
  UserPlus,
  X,
} from '@phosphor-icons/react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AuthModalProps {
  open: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

export function AuthModal({ open, onClose, initialMode = 'signin' }: AuthModalProps) {
  const auth = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setLocalError(null)
      auth.clearError()
      setTimeout(() => firstFieldRef.current?.focus(), 120)
    }
  }, [open, initialMode])

  useEffect(() => {
    if (auth.error) setLocalError(null)
  }, [auth.error])

  if (!open) return null

  const isSignup = mode === 'signup'

  function validate(): string | null {
    if (isSignup && !name.trim()) return 'Please enter your name.'
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

  const errorText = localError ?? auth.error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isSignup ? 'Create account' : 'Sign in'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand header */}
        <div className="relative border-b border-border/60 bg-gradient-to-b from-primary/[0.07] to-transparent px-6 pb-5 pt-6">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <Image src="/nexus-mark.png" alt="NEXUS" width={44} height={44} className="h-11 w-11 rounded-2xl shadow-md shadow-primary/20" />
            <div>
              <h2 className="text-lg font-semibold leading-tight">
                {isSignup ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isSignup
                  ? 'Save chats, projects & files across devices'
                  : 'Continue where you left off'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex flex-col gap-3.5 px-6 py-5">
          {isSignup && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-name" className="text-xs font-medium text-foreground">
                Name
              </label>
              <div className="relative">
                <UserPlus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
                <Input
                  id="auth-name"
                  ref={firstFieldRef}
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-11 rounded-xl pl-10"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-email" className="text-xs font-medium text-foreground">
              Email
            </label>
            <div className="relative">
              <EnvelopeSimple className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
              <Input
                id="auth-email"
                ref={isSignup ? undefined : firstFieldRef}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-password" className="text-xs font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
              <Input
                id="auth-password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="h-11 rounded-xl pl-10"
              />
            </div>
          </div>

          {errorText && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {errorText}
            </p>
          )}

          {/* ONE clear primary action */}
          <Button
            type="submit"
            disabled={submitting || auth.loading}
            className="mt-1 h-12 w-full gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:brightness-110"
          >
            {submitting || auth.loading ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <SignIn className="h-4 w-4" aria-hidden />
            )}
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>

          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup')
              setLocalError(null)
              auth.clearError()
            }}
            className="mt-1 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
          >
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <span className="font-semibold text-primary">
              {isSignup ? 'Sign in' : 'Create one'}
            </span>
          </button>
        </form>
      </motion.div>
    </div>
  )
}
