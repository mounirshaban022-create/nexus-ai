'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, LogIn, Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn, signUp, signInWithGoogle, isSupabaseConfigured } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isSupabaseConfigured) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-label="Sign in">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-bold">Accounts coming soon</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            To enable user accounts: create a free project at{' '}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              supabase.com
            </a>
            , then add the credentials to .env and run supabase-schema.sql.
          </p>
          <Button onClick={onClose} className="mt-4 w-full">Got it</Button>
        </motion.div>
      </div>
    )
  }

  const submit = async () => {
    if (!email.trim() || !password) {
      toast({ title: 'Enter email and password', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        toast({ title: 'Welcome back!' })
      } else {
        await signUp(email, password)
        toast({ title: 'Account created! Check your email to confirm.' })
      }
      onClose()
    } catch (e) {
      toast({ title: 'Authentication failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-label="Sign in">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{mode === 'signin' ? 'Sign in' : 'Create account'}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Button onClick={() => signInWithGoogle().catch(e => toast({ title: 'Google sign-in failed', description: (e as Error).message, variant: 'destructive' }))} variant="outline" className="w-full gap-2 rounded-xl">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </Button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="h-11 rounded-xl" />
        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 chars)" className="mt-2 h-11 rounded-xl" onKeyDown={e => e.key === 'Enter' && submit()} />

        <Button onClick={submit} disabled={loading} className="mt-3 w-full gap-2 rounded-xl bg-primary text-primary-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>

        <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </motion.div>
    </div>
  )
}
