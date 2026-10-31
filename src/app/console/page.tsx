'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard, Users, MessagesSquare, Images, Mail, FileText,
  FlaskConical, Plug, ShieldCheck, LogOut, RefreshCw, Lock, Activity,
} from 'lucide-react'
import { api } from './console-types'
import { OverviewView } from './views/overview'
import { UsersView } from './views/users'
import { ConversationsView } from './views/conversations'
import { GenerationsView } from './views/generations'
import { MessagingView } from './views/messaging'
import { DocumentsView } from './views/documents'
import { StudioView } from './views/studio'
import { IntegrationsView } from './views/integrations'

type Tab = 'overview' | 'users' | 'conversations' | 'generations' | 'messaging' | 'documents' | 'studio' | 'integrations'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, hint: 'Live platform KPIs' },
  { id: 'users', label: 'Accounts', icon: Users, hint: 'Users, guests & control' },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare, hint: 'Full user ↔ AI transcripts' },
  { id: 'generations', label: 'Generations', icon: Images, hint: 'Media & document vault' },
  { id: 'messaging', label: 'Messaging', icon: Mail, hint: 'Email & WhatsApp' },
  { id: 'documents', label: 'Documents', icon: FileText, hint: 'Premium template studio' },
  { id: 'studio', label: 'AI Studio', icon: FlaskConical, hint: 'Capability lab' },
  { id: 'integrations', label: 'Integrations', icon: Plug, hint: 'Vercel · GitHub · Supabase' },
]

function LoginGate({ onReady }: { onReady: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/console/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Login failed')
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_55%)]" />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">NEXUS Console</h1>
            <p className="text-xs text-slate-400">Enterprise administration gate</p>
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">Console password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter the console password"
          autoFocus
          className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
        />
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          {busy ? 'Verifying…' : 'Unlock console'}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
          Sessions last 12 hours. All console actions are audited.
        </p>
      </form>
    </div>
  )
}

export default function ConsolePage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    api<{ authed: boolean }>('/session')
      .then(r => setAuthed(r.authed))
      .catch(() => setAuthed(false))
  }, [])

  // Live pulse: refresh overview every 30s while visible.
  useEffect(() => {
    if (!authed) return
    const t = setInterval(() => setPulse(p => !p), 30_000)
    return () => clearInterval(t)
  }, [authed])

  const logout = useCallback(async () => {
    await fetch('/api/console/session', { method: 'DELETE', credentials: 'include' })
    setAuthed(false)
  }, [])

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Activity className="mr-2 h-5 w-5 animate-pulse text-emerald-500" /> Connecting to console…
      </div>
    )
  }
  if (!authed) return <LoginGate onReady={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.06),transparent_50%)]" />
      <div className="relative mx-auto flex max-w-[1500px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800/70 bg-slate-900/40 px-3 py-5 lg:flex">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">NEXUS Console</p>
              <p className="text-[10px] uppercase tracking-widest text-emerald-400/80">Command center</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1">
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  tab === n.id
                    ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <n.icon className={`h-4 w-4 ${tab === n.id ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="flex-1 font-medium">{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-800/70 pt-3">
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-7">
          {/* Mobile nav */}
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                  tab === n.id ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25' : 'bg-slate-800/60 text-slate-400'
                }`}
              >
                <n.icon className="h-3.5 w-3.5" /> {n.label}
              </button>
            ))}
          </div>

          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {NAV.find(n => n.id === tab)?.label}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{NAV.find(n => n.id === tab)?.hint}</p>
            </div>
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

          {tab === 'overview' && <OverviewView pulse={pulse} refreshKey={refreshKey} />}
          {tab === 'users' && <UsersView refreshKey={refreshKey} />}
          {tab === 'conversations' && <ConversationsView refreshKey={refreshKey} />}
          {tab === 'generations' && <GenerationsView refreshKey={refreshKey} />}
          {tab === 'messaging' && <MessagingView refreshKey={refreshKey} />}
          {tab === 'documents' && <DocumentsView refreshKey={refreshKey} />}
          {tab === 'studio' && <StudioView refreshKey={refreshKey} />}
          {tab === 'integrations' && <IntegrationsView refreshKey={refreshKey} />}
        </main>
      </div>
    </div>
  )
}
