'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Clock,
  LogOut,
  Mail,
  MessageSquare,
  Shield,
  Sparkles,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isSupabaseConfigured, getCurrentUser, signOut } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

const CREATOR = { name: 'Mounir Shaaban', role: 'Creator & Developer' }

export function ProfileMode() {
  const { toast } = useToast()
  const [user, setUser] = useState<{ email?: string; id?: string; created_at?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser().then((u) => { setUser(u); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    toast({ title: 'Signed out' })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="omni-dot h-2 w-2 rounded-full bg-primary" />
        <p className="ml-2 text-sm text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="omni-scroll h-full overflow-y-auto">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
            <User className="h-8 w-8 text-muted-foreground" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold">You&apos;re browsing as a guest</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in from Settings to sync your chats, documents, and preferences across devices.
          </p>
          <Button
            onClick={() => toast({ title: 'Open Settings to sign in', description: 'Settings → Account → Sign in' })}
            className="mt-5 rounded-xl bg-primary text-primary-foreground"
          >
            Go to Settings
          </Button>
        </div>
      </div>
    )
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Recently'

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        {/* Profile Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-xl font-bold text-white shadow-lg">
              {(user.email ?? '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                {user.email}
                <BadgeCheck className="h-4 w-4 text-emerald-500" aria-label="verified" />
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden /> Member since {memberSince}
              </p>
              <Badge variant="secondary" className="mt-2 gap-1 text-[11px]">
                <Sparkles className="h-3 w-3" aria-hidden /> NEXUS AI Member
              </Badge>
            </div>
          </div>
        </motion.div>

        {/* Account Details */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Email</h4>
            <p className="mt-2 truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4" /> Security</h4>
            <p className="mt-2 text-sm text-muted-foreground">Row-Level Security active · Data encrypted in transit</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Activity</h4>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-lg font-bold">∞</p>
              <p className="text-[11px] text-muted-foreground">AI Models</p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-lg font-bold">30</p>
              <p className="text-[11px] text-muted-foreground">Connectors</p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-lg font-bold">15</p>
              <p className="text-[11px] text-muted-foreground">Abilities</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <Button onClick={handleSignOut} variant="outline" className="mt-4 w-full gap-2 rounded-xl">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>

        {/* Creator footer */}
        <div className="mt-6 mb-4 text-center">
          <p className="text-xs text-muted-foreground">Built with ❤️ by</p>
          <p className="mt-1 text-sm font-semibold">{CREATOR.name}</p>
          <p className="text-[11px] text-muted-foreground">{CREATOR.role} · NEXUS AI © 2026</p>
        </div>
      </div>
    </div>
  )
}
