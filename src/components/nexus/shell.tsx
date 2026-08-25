'use client'

/**
 * NEXUS One — ChatGPT-style premium app shell.
 *
 * Desktop: fixed 264px dark sidebar (brand, New chat, live search, session
 * history with agent emoji dots, Agents/WhatsApp/Settings nav, user block).
 * Mobile: sticky h-14 top bar with a hamburger that opens the same content
 * in a Sheet.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  LogOut,
  Menu,
  MessageCircle,
  Pin,
  Plus,
  Puzzle,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { AppUser, SessionItem, View } from './shared'
import { AGENCY_STATS, BrandLockup, DIVISION_MAP, agentOrNexus, tint } from './shared'

export interface NexusShellProps {
  view: View
  setView: (v: View) => void
  user: AppUser | null
  onSignIn: () => void
  onSignOut: () => void
  /** bump to refetch the session list */
  refreshKey: number
  onNewChat: () => void
  onSessionSelect: (id: string) => void
  children: React.ReactNode
}

/* ------------------------------------------------------------------ */
/* Relative time ("2m", "3h", "5d"…) via Intl.RelativeTimeFormat        */
/* ------------------------------------------------------------------ */

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 45) return 'now'
  if (abs < 3_600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3_600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 30 * 86_400) return rtf.format(Math.round(diffSec / (7 * 86_400)), 'week')
  return rtf.format(Math.round(diffSec / (30 * 86_400)), 'month')
}

/* ------------------------------------------------------------------ */
/* Sidebar content (shared by desktop aside + mobile Sheet)             */
/* ------------------------------------------------------------------ */

interface SidebarContentProps {
  view: View
  setView: (v: View) => void
  user: AppUser | null
  onSignIn: () => void
  onSignOut: () => void
  sessions: SessionItem[]
  loading: boolean
  query: string
  setQuery: (q: string) => void
  activeSessionId: string | undefined
  onNewChat: () => void
  onSessionSelect: (id: string) => void
  onNavigate: () => void
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  iconClassName = 'text-zinc-400',
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
  badge?: string
  iconClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active ? 'bg-white/8 font-medium text-zinc-100' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconClassName}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: SessionItem
  active: boolean
  onSelect: () => void
}) {
  const agent = agentOrNexus(session.agentSlug)
  const division = DIVISION_MAP[agent.division]
  const dotBg = agent.slug === '__nexus' ? 'rgba(255,255,255,0.07)' : tint(division?.color ?? '#ff5a5f', 0.16)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      title={session.title || 'Untitled conversation'}
      className={`group relative flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
        active ? 'bg-[rgba(255,90,95,0.12)]' : 'hover:bg-white/5'
      }`}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: 'linear-gradient(180deg, #f5a623, #ff2a68)' }}
        />
      ) : null}
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] leading-none"
        style={{ backgroundColor: dotBg }}
      >
        {agent.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-300 group-hover:text-zinc-200">
        {session.title || 'New conversation'}
      </span>
      {session.agentPinned ? (
        <Pin className="h-3 w-3 shrink-0 text-zinc-500" aria-label="Pinned specialist" />
      ) : null}
      <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{relTime(session.updatedAt)}</span>
    </button>
  )
}

function SidebarContent({
  view,
  setView,
  user,
  onSignIn,
  onSignOut,
  sessions,
  loading,
  query,
  setQuery,
  activeSessionId,
  onNewChat,
  onSessionSelect,
  onNavigate,
}: SidebarContentProps) {
  const go = (v: View) => {
    setView(v)
    onNavigate()
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-x-hidden">
      {/* Brand */}
      <div className="px-4 pb-3 pt-4">
        <BrandLockup height={22} />
      </div>

      {/* New chat */}
      <div className="px-2">
        <button
          type="button"
          onClick={() => {
            onNewChat()
            onNavigate()
          }}
          className="nx-gradient-surface flex min-h-[42px] w-full items-center gap-2 rounded-xl px-3.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="mt-3 px-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 w-full rounded-xl border border-white/8 bg-white/[0.04] pl-9 pr-3 text-[13px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-[#ff5a5f]/40 focus:bg-white/[0.06]"
          />
        </div>
      </div>

      {/* Sessions + nav (scrollable rail) */}
      <nav className="nx-scroll mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" aria-label="Conversations">
        {loading && sessions.length === 0 ? (
          <div className="space-y-1.5 p-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs leading-relaxed text-zinc-600">
            No conversations yet — start one above.
          </p>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={activeSessionId === s.id}
                onSelect={() => {
                  onSessionSelect(s.id)
                  onNavigate()
                }}
              />
            ))}
          </div>
        )}

        <div className="my-3 border-t border-white/8" role="separator" />

        <div className="space-y-0.5">
          <NavItem
            icon={Users}
            label="Agents"
            badge={String(AGENCY_STATS.agents)}
            active={view.type === 'agents'}
            onClick={() => go({ type: 'agents' })}
          />
          <NavItem
            icon={MessageCircle}
            label="WhatsApp"
            active={view.type === 'whatsapp'}
            onClick={() => go({ type: 'whatsapp' })}
            iconClassName="text-emerald-400"
          />
          <NavItem
            icon={Puzzle}
            label="Skills"
            badge="79"
            active={view.type === 'skills'}
            onClick={() => go({ type: 'skills' })}
          />
          <NavItem
            icon={Settings}
            label="Settings"
            active={view.type === 'settings'}
            onClick={() => go({ type: 'settings' })}
          />
        </div>
      </nav>

      {/* User block */}
      <div className="shrink-0 border-t border-white/8 p-2">
        {user ? (
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <span
              aria-hidden
              className="nx-gradient-surface grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1" title={user.email}>
              <span className="block truncate text-[13px] text-zinc-300">
                {user.name || user.email}
              </span>
              {user.name ? <span className="block truncate text-[11px] text-zinc-600">{user.email}</span> : null}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="nx-gradient-surface flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

export function NexusShell(props: NexusShellProps) {
  const { view, setView, user, onSignIn, onSignOut, refreshKey, onNewChat, onSessionSelect, children } = props

  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  /* Fetch the session list on mount and whenever refreshKey bumps.
   * Deferred via setTimeout (codebase idiom) to keep effects side-effect free. */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/chat/sessions?kind=chat')
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as { sessions?: unknown } | null
        const rows = Array.isArray(data?.sessions) ? data.sessions : []
        if (cancelled) return
        setSessions(
          rows
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .map(
              (s): SessionItem => ({
                id: typeof s.id === 'string' ? s.id : '',
                title: typeof s.title === 'string' ? s.title : '',
                kind: typeof s.kind === 'string' ? s.kind : 'chat',
                agentSlug: typeof s.agentSlug === 'string' ? s.agentSlug : null,
                agentPinned: s.agentPinned === true,
                updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
                messageCount: typeof s.messageCount === 'number' ? s.messageCount : 0,
                preview: typeof s.preview === 'string' ? s.preview : '',
              })
            )
            .filter((s) => s.id)
        )
      } catch {
        /* offline — keep the current list */
      }
      if (!cancelled) setLoading(false)
    }
    const t = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [refreshKey])

  /* Live client-side filter over the fetched sessions. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true
      if (s.preview.toLowerCase().includes(q)) return true
      return agentOrNexus(s.agentSlug).name.toLowerCase().includes(q)
    })
  }, [sessions, query])

  const activeSessionId = view.type === 'chat' ? view.sessionId : undefined

  const sidebar = (
    <SidebarContent
      view={view}
      setView={setView}
      user={user}
      onSignIn={onSignIn}
      onSignOut={onSignOut}
      sessions={filtered}
      loading={loading}
      query={query}
      setQuery={setQuery}
      activeSessionId={activeSessionId}
      onNewChat={onNewChat}
      onSessionSelect={onSessionSelect}
      onNavigate={() => setMobileOpen(false)}
    />
  )

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-[264px] shrink-0 border-r border-white/8 bg-[#0c0c0e] md:flex">
        {sidebar}
      </aside>

      {/* Mobile top bar + main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-[#0c0c0e]/90 px-2 backdrop-blur-md md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="grid h-10 w-10 place-items-center rounded-xl text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <BrandLockup height={20} />
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            title="New chat"
            className="nx-gradient-surface grid h-9 w-9 place-items-center rounded-xl"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <main className="flex min-h-screen w-full min-w-0 flex-col">{children}</main>
      </div>

      {/* Mobile nav sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[282px] gap-0 border-r border-white/8 bg-[#0c0c0e] p-0 text-zinc-100 sm:max-w-[282px]"
        >
          <SheetTitle className="sr-only">NEXUS navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
    </div>
  )
}
