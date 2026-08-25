'use client'

/**
 * NEXUS One — ChatGPT-style premium app shell (fully i18n'd EN/ع).
 *
 * Desktop: fixed 264px dark sidebar (brand, New chat, live search, session
 * history with agent emoji dots + inline-delete, Agents/WhatsApp/Skills/
 * Settings nav, user block with the EN/ع language quick-switch).
 * Mobile: sticky h-14 top bar (hamburger → Sheet: history + search + nav +
 * user) PLUS a fixed bottom tab bar (Chat / Agents / Skills / Settings) for
 * fast one-tap navigation. All layout uses logical CSS properties so the
 * whole shell mirrors correctly under RTL (dir="rtl").
 */

import { useEffect, useMemo, useState } from 'react'
import {
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Pin,
  Plus,
  Puzzle,
  Search,
  Settings,
  Settings2,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/lib/i18n'
import { usePreferences } from '@/lib/preferences'
import type { AppUser, SessionItem, View } from './shared'
import { AGENCY_STATS, BrandLockup, DIVISION_MAP, agentOrNexus, tint, useActiveChatSession } from './shared'
import { ThemeToggle } from './theme-toggle'

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
/* Relative time ("2m", "3h", "5d"…) via Intl.RelativeTimeFormat —      */
/* locale-aware so Arabic rows read "قبل ٣ د".                          */
/* ------------------------------------------------------------------ */

const rtfCache = new Map<string, Intl.RelativeTimeFormat>()

function getRtf(locale: string): Intl.RelativeTimeFormat {
  let v = rtfCache.get(locale)
  if (!v) {
    v = new Intl.RelativeTimeFormat(locale === 'en' ? undefined : locale, {
      numeric: 'auto',
      style: 'narrow',
    })
    rtfCache.set(locale, v)
  }
  return v
}

function relTime(iso: string, locale: string, nowLabel: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = getRtf(locale)
  if (abs < 45) return nowLabel
  if (abs < 3_600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3_600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 30 * 86_400) return rtf.format(Math.round(diffSec / (7 * 86_400)), 'week')
  return rtf.format(Math.round(diffSec / (30 * 86_400)), 'month')
}

/* ------------------------------------------------------------------ */
/* Language quick-switch — EN ⇄ ع (visible on desktop sidebar + sheet)  */
/* ------------------------------------------------------------------ */

function LanguageToggle() {
  const { t, lang } = useI18n()
  return (
    <button
      type="button"
      onClick={() => usePreferences.getState().setLanguage(lang === 'ar' ? 'en' : 'ar')}
      aria-label={t('settings.language')}
      title={t('settings.language')}
      className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-[12px] font-bold text-zinc-400 transition hover:border-white/25 hover:bg-white/5 hover:text-zinc-100"
    >
      <span dir="ltr" className="leading-none">
        {lang === 'ar' ? 'EN' : 'ع'}
      </span>
    </button>
  )
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
  onDeleteSession: (id: string) => void
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
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
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
  onDelete,
}: {
  session: SessionItem
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { t, lang } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const agent = agentOrNexus(session.agentSlug)
  const division = DIVISION_MAP[agent.division]
  const dotBg = agent.slug === '__nexus' ? 'rgba(255,255,255,0.07)' : tint(division?.color ?? '#ff5a5f', 0.16)
  const locale = lang === 'ar' ? 'ar' : 'en'

  /* Inline confirm — the row swaps to a destructive "Delete? Yes / No"
   * mini bar so a conversation is never destroyed by a single tap. */
  if (confirming) {
    return (
      <div className="flex min-h-[44px] w-full items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5">
        <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-zinc-300">
          {t('common.deleteChatConfirm')}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded-md bg-red-500/90 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-red-500"
        >
          {t('common.yes')}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
        >
          {t('common.no')}
        </button>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      aria-current={active ? 'page' : undefined}
      title={session.title || t('nav.untitled')}
      className={`group relative flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-[#ff5a5f]/50 ${
        active ? 'bg-[rgba(255,90,95,0.12)]' : 'hover:bg-white/5'
      }`}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
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
        {session.title || t('nav.untitled')}
      </span>
      {session.agentPinned ? (
        <Pin className="h-3 w-3 shrink-0 text-zinc-500" aria-label={t('nav.pinnedSpecialist')} />
      ) : null}
      <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">
        {relTime(session.updatedAt, locale, t('common.now'))}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setConfirming(true)
        }}
        aria-label={t('common.deleteChat')}
        title={t('common.deleteChat')}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-600 opacity-70 transition hover:bg-red-500/15 hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
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
  onDeleteSession,
  onNavigate,
}: SidebarContentProps) {
  const { t } = useI18n()
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
          {t('nav.newChat')}
        </button>
      </div>

      {/* Search */}
      <div className="mt-3 px-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder={t('nav.searchChats')}
            aria-label={t('nav.searchChats')}
            className="h-9 w-full rounded-xl border border-white/8 bg-white/[0.04] ps-9 pe-3 text-[13px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-[#ff5a5f]/40 focus:bg-white/[0.06]"
          />
        </div>
      </div>

      {/* Sessions + nav (scrollable rail) */}
      <nav className="nx-scroll mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" aria-label={t('nav.conversations')}>
        {loading && sessions.length === 0 ? (
          <div className="space-y-1.5 p-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs leading-relaxed text-zinc-600">{t('nav.noConversations')}</p>
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
                onDelete={() => onDeleteSession(s.id)}
              />
            ))}
          </div>
        )}

        <div className="my-3 border-t border-white/8" role="separator" />

        <div className="space-y-0.5">
          <NavItem
            icon={Users}
            label={t('nav.agents')}
            badge={String(AGENCY_STATS.agents)}
            active={view.type === 'agents'}
            onClick={() => go({ type: 'agents' })}
          />
          <NavItem
            icon={MessageCircle}
            label={t('nav.whatsapp')}
            active={view.type === 'whatsapp'}
            onClick={() => go({ type: 'whatsapp' })}
            iconClassName="text-emerald-400"
          />
          <NavItem
            icon={Puzzle}
            label={t('nav.skills')}
            badge="79"
            active={view.type === 'skills'}
            onClick={() => go({ type: 'skills' })}
          />
          <NavItem
            icon={Settings}
            label={t('nav.settings')}
            active={view.type === 'settings'}
            onClick={() => go({ type: 'settings' })}
          />
        </div>
      </nav>

      {/* User block + language quick-switch */}
      <div className="shrink-0 border-t border-white/8 p-2">
        {user ? (
          <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
            <span
              aria-hidden
              className="nx-gradient-surface grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1" title={user.email}>
              <span className="block truncate text-[13px] text-zinc-300">{user.name || user.email}</span>
              {user.name ? <span className="block truncate text-[11px] text-zinc-600">{user.email}</span> : null}
            </span>
            <ThemeToggle />
            <LanguageToggle />
            <button
              type="button"
              onClick={onSignOut}
              aria-label={t('nav.signOut')}
              title={t('nav.signOut')}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignIn}
              className="nx-gradient-surface flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold"
            >
              {t('nav.signIn')}
            </button>
            <ThemeToggle />
            <LanguageToggle />
          </div>
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
  const { t, isRTL } = useI18n()
  const { toast } = useToast()

  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  /** local refetch trigger (used to restore the list after a failed delete) */
  const [reload, setReload] = useState(0)

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
    const timer = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [refreshKey, reload])

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

  /* Delete a conversation: optimistic removal + toast; if the deleted row is
   * the ACTIVE session, reset the chat view via onNewChat(). `view.sessionId`
   * covers sidebar selections; the active-chat mirror covers sessions created
   * INSIDE the chat (never present in the view object). On failure the list
   * is refetched and an error toast is shown. */
  const handleDeleteSession = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    const activeId = activeSessionId ?? useActiveChatSession.getState().sessionId
    if (activeId === id) onNewChat()
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      toast({ title: t('common.chatDeleted') })
    } catch {
      setReload((n) => n + 1)
      toast({ title: t('common.deleteFailed'), variant: 'destructive' })
    }
  }

  /* Bottom tab bar → same view switch as the desktop nav. */
  const goTab = (type: 'chat' | 'agents' | 'skills' | 'settings') => {
    if (type === 'chat') setView({ type: 'chat' })
    else if (type === 'agents') setView({ type: 'agents' })
    else if (type === 'skills') setView({ type: 'skills' })
    else setView({ type: 'settings' })
    setMobileOpen(false)
  }

  const tabs: { type: 'chat' | 'agents' | 'skills' | 'settings'; icon: LucideIcon; label: string }[] = [
    { type: 'chat', icon: MessageSquare, label: t('nav.chat') },
    { type: 'agents', icon: Users, label: t('nav.agents') },
    { type: 'skills', icon: Puzzle, label: t('nav.skills') },
    { type: 'settings', icon: Settings2, label: t('nav.settings') },
  ]

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
      onDeleteSession={(id) => {
        void handleDeleteSession(id)
      }}
      onNavigate={() => setMobileOpen(false)}
    />
  )

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100">
      {/* Desktop sidebar — border-e mirrors to the left edge under RTL */}
      <aside className="hidden w-[264px] shrink-0 border-e border-white/8 bg-[#0c0c0e] md:flex">
        {sidebar}
      </aside>

      {/* Mobile top bar + main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-[#0c0c0e]/90 px-2 backdrop-blur-md md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('nav.openNav')}
            className="grid h-10 w-10 place-items-center rounded-xl text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <BrandLockup height={20} />
          <button
            type="button"
            onClick={onNewChat}
            aria-label={t('nav.newChat')}
            title={t('nav.newChat')}
            className="nx-gradient-surface grid h-9 w-9 place-items-center rounded-xl"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {/* Non-chat views get bottom padding so the fixed tab bar never
         * covers their content (the chat view computes its own exact height).
         *
         * Layout fix: flex-1 (NOT min-h-screen) — the mobile column already
         * adds the 56px top bar above main, so min-h-screen here made the
         * document 56px taller than the viewport on every screen (a phantom
         * scroll + rubber-band on mobile). flex-1 still stretches main to
         * fill the viewport via the column's root-level min-h-screen. */}
        <main
          className={`flex min-h-0 w-full min-w-0 flex-1 flex-col ${
            view.type === 'chat' ? '' : 'pb-[calc(55px_+_env(safe-area-inset-bottom))] md:pb-0'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar — fast one-tap navigation (safe-area aware) */}
      <nav
        aria-label={t('nav.bottomNav')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#0c0c0e]/90 backdrop-blur-md md:hidden"
      >
        <div className="flex h-[54px] items-stretch pb-[env(safe-area-inset-bottom)]">
          {tabs.map((tab) => {
            const isActive = view.type === tab.type
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => goTab(tab.type)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 outline-none transition focus-visible:bg-white/5"
              >
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute top-0 h-[2.5px] w-9 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #f5a623, #ff5a5f, #ff2a68)' }}
                  />
                ) : null}
                <tab.icon
                  className={`h-[19px] w-[19px] transition ${isActive ? 'text-[#ff5a5f]' : 'text-zinc-500'}`}
                  aria-hidden
                />
                <span
                  className={`max-w-full truncate px-1 text-[10px] leading-none transition ${
                    isActive ? 'font-semibold text-zinc-100' : 'text-zinc-500'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Mobile nav sheet — history + search + nav + user (opens from the
          inline-start edge: left in LTR, right in RTL, matching the hamburger) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={isRTL ? 'right' : 'left'}
          className="w-[282px] gap-0 border-white/8 bg-[#0c0c0e] p-0 text-zinc-100 sm:max-w-[282px]"
        >
          <SheetTitle className="sr-only">{t('nav.sheetTitle')}</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
    </div>
  )
}
