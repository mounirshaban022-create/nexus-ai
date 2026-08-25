'use client'

/**
 * The Agency — auth modal (task 5-a).
 *
 * Dark Dialog with Sign in / Create account tabs wired to the modern
 * cookie-session API routes. The parent re-fetches the user when the modal
 * closes, so a successful submit only needs to close itself.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AuthTab = 'signin' | 'signup'

export function AgencyAuthModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [tab, setTab] = useState<AuthTab>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const switchTab = (value: string) => {
    setTab(value as AuthTab)
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const isSignIn = tab === 'signin'
      const res = await fetch(isSignIn ? '/api/auth/signin' : '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          isSignIn ? { email, password } : { name: name.trim(), email, password }
        ),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.')
        return
      }
      // Success — auth state refreshes when the modal closes (page.tsx).
      onOpenChange(false)
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'h-11 rounded-xl border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20 dark:border-zinc-800 dark:bg-zinc-900'
  const labelClass = 'text-xs font-medium uppercase tracking-wide text-zinc-500'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-zinc-800 bg-[#111114] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight">
            Join the Agency
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            One account — every specialist.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={switchTab}>
          <TabsList className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 dark:bg-zinc-900">
            <TabsTrigger
              value="signin"
              className="rounded-lg text-zinc-400 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 dark:text-zinc-400 dark:data-[state=active]:bg-zinc-100 dark:data-[state=active]:text-zinc-950"
            >
              Sign in
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              className="rounded-lg text-zinc-400 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 dark:text-zinc-400 dark:data-[state=active]:bg-zinc-100 dark:data-[state=active]:text-zinc-950"
            >
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="agency-signin-email" className={labelClass}>
                  Email
                </Label>
                <Input
                  id="agency-signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-signin-password" className={labelClass}>
                  Password
                </Label>
                <Input
                  id="agency-signin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className={inputClass}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="agency-signup-name" className={labelClass}>
                  Name
                </Label>
                <Input
                  id="agency-signup-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-signup-email" className={labelClass}>
                  Email
                </Label>
                <Input
                  id="agency-signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-signup-password" className={labelClass}>
                  Password
                </Label>
                <Input
                  id="agency-signup-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 letter + 1 digit"
                  className={inputClass}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </TabsContent>
        </Tabs>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mx-auto block text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-300"
        >
          Continue as guest instead
        </button>
      </DialogContent>
    </Dialog>
  )
}
