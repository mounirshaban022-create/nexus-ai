'use client'

/**
 * The Agency — application shell (task 5-a).
 *
 * Always-dark editorial chrome: fixed 264px sidebar on md+ (division rail,
 * search, account block), sticky top bar + Sheet navigation on mobile.
 * Amber (#fbbf24) is the single brand accent on zinc-950.
 */

import { useState } from 'react'
import {
  Hexagon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  AGENCY_DIVISIONS,
  AGENCY_STATS,
  DivisionIcon,
  type View,
} from './shared'

/** Visible proof of which version is running (rendered at sidebar bottom). */
const BUILD_VERSION = 'agency-v1'

export interface AppShellUser {
  email?: string
  name?: string
}

/** Shared sidebar body — rendered in the desktop aside and the mobile sheet. */
function SidebarContent({
  view,
  setView,
  onNavigate,
  user,
  onSignIn,
  onSignOut,
}: {
  view: View
  setView: (v: View) => void
  /** Navigation that should also dismiss the mobile sheet. */
  onNavigate: (v: View) => void
  user: AppShellUser | null
  onSignIn: () => void
  onSignOut: () => void
}) {
  const [query, setQuery] = useState('')

  const handleSearchChange = (value: string) => {
    setQuery(value)
    // Live-search: typing jumps to the roster (kept subtle — empty input does
    // not navigate so the box can be cleared without losing your place).
    if (value.trim()) {
      setView({ type: 'roster', query: value })
    }
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onNavigate({ type: 'roster', query: query.trim() || undefined })
  }

  const navItemClass = (active: boolean) =>
    `flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition md:h-9 ${
      active
        ? 'bg-zinc-800/80 font-medium text-zinc-100'
        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100'
    }`

  return (
    <>
      {/* Logo block */}
      <div className="flex shrink-0 items-center gap-3 px-4 pt-5 pr-10 pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400">
          <Hexagon className="h-5 w-5 text-zinc-950" fill="currentColor" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-none tracking-tight text-zinc-100">
            NEXUS
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            The Agency
          </p>
        </div>
      </div>

      {/* Primary action + search */}
      <div className="shrink-0 space-y-3 px-4">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'chat', agentSlug: null })}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New conversation
        </button>
        <form onSubmit={submitSearch} role="search" aria-label="Search specialists">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={`Search ${AGENCY_STATS.agents} specialists…`}
              aria-label={`Search ${AGENCY_STATS.agents} specialists`}
              className="h-10 rounded-xl border-zinc-800 bg-zinc-900 pl-9 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-400/50 focus-visible:ring-amber-400/20 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </form>
      </div>

      {/* Scrollable navigation: primary + divisions + channels */}
      <nav className="agency-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Agency">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            aria-current={view.type === 'home' ? 'page' : undefined}
            className={navItemClass(view.type === 'home')}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Home</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'roster' })}
            aria-current={view.type === 'roster' ? 'page' : undefined}
            className={navItemClass(view.type === 'roster')}
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">All Agents</span>
            <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-400">
              {AGENCY_STATS.agents}
            </span>
          </button>
        </div>

        <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Divisions
        </p>
        <div className="space-y-0.5">
          {AGENCY_DIVISIONS.map((d) => {
            const active = view.type === 'division' && view.divisionId === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onNavigate({ type: 'division', divisionId: d.id })}
                aria-current={active ? 'page' : undefined}
                className={navItemClass(active)}
                title={`${d.label} — ${d.count} specialists`}
              >
                <DivisionIcon division={d} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="text-xs tabular-nums text-zinc-500">{d.count}</span>
              </button>
            )
          })}
        </div>

        <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Channels
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'whatsapp' })}
            aria-current={view.type === 'whatsapp' ? 'page' : undefined}
            className={navItemClass(view.type === 'whatsapp')}
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            <span className="truncate">WhatsApp</span>
          </button>
        </div>
      </nav>

      {/* Pinned bottom: settings + account + build version */}
      <div className="shrink-0 border-t border-zinc-800/60 p-3">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'settings' })}
          aria-current={view.type === 'settings' ? 'page' : undefined}
          className={navItemClass(view.type === 'settings')}
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Settings</span>
        </button>

        {user ? (
          <div className="mt-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-zinc-950"
              aria-hidden
            >
              {(user.name || user.email || '?').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400" title={user.email}>
              {user.email}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 px-3 text-sm font-medium text-amber-400 transition hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Join the Agency
          </button>
        )}

        <p className="px-2 pt-3 text-[10px] text-zinc-600" aria-hidden>
          NEXUS · {BUILD_VERSION}
        </p>
      </div>
    </>
  )
}

export function AppShell({
  view,
  setView,
  user,
  onSignIn,
  onSignOut,
  children,
}: {
  view: View
  setView: (v: View) => void
  user: AppShellUser | null
  onSignIn: () => void
  onSignOut: () => void
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  /** Sidebar navigation that also dismisses the mobile sheet. */
  const navigate = (v: View) => {
    setView(v)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Fixed ambient glow — the agency signature */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.05),transparent_55%)]"
      />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-zinc-800/60 bg-[#0c0c0f] md:flex">
        <SidebarContent
          view={view}
          setView={setView}
          onNavigate={navigate}
          user={user}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800/60 bg-[#0c0c0f]/90 px-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-800/70 hover:text-zinc-100"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400">
            <Hexagon className="h-4 w-4 text-zinc-950" fill="currentColor" aria-hidden />
          </span>
          <span className="font-display text-base font-bold tracking-tight text-zinc-100">
            NEXUS
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate({ type: 'chat', agentSlug: null })}
          aria-label="New conversation"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-zinc-800/70 hover:text-zinc-100"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {/* Mobile navigation sheet (same content as the desktop sidebar) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="agency-scroll w-[280px] gap-0 overflow-y-auto border-zinc-800/60 bg-[#0c0c0f] p-0 text-zinc-100"
        >
          <SheetTitle className="sr-only">Agency navigation</SheetTitle>
          <SidebarContent
            view={view}
            setView={setView}
            onNavigate={navigate}
            user={user}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
          />
        </SheetContent>
      </Sheet>

      {/* Main content — no footer: this is an app, not a marketing page */}
      <div className="md:ml-[264px]">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  )
}
