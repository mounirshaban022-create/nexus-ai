'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Mail,
  FileText,
  Pencil,
  LogIn,
  UserPlus,
  Image as ImageIcon,
  Code,
  MessageSquare,
  Calendar,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth, type AuthUser } from '@/hooks/use-auth'
import { MemorySection } from './memory-section'

export interface ProfileActivity {
  type: 'image' | 'document' | 'code'
  url?: string
  title: string
  createdAt: string
}

export interface ProfileStats {
  messages: number
  files: number
  images: number
}

export interface ProfilePageProps {
  /** Open the profile-edit modal. */
  onEditProfile: () => void
  /** Open the auth modal in 'signin' mode. */
  onSignIn: () => void
  /** Open the auth modal in 'signup' mode. */
  onSignUp: () => void
  /** Switch the active tab back to chat (used by the empty-activity CTA). */
  onOpenChat: () => void
  /** Open the email & apps connector panel. */
  onOpenConnect: () => void
  /** Toggle light/dark theme. */
  onToggleTheme: () => void
  /** Toggle EN/AR language. */
  onToggleLanguage: () => void
  /** Re-run the onboarding flow. */
  onRerunOnboarding: () => void
  /** Open the privacy-policy legal overlay. */
  onOpenPrivacy: () => void
  /** Open the terms-of-service legal overlay. */
  onOpenTerms: () => void
  /** Current theme label (used for the pill + theme row). */
  theme: 'light' | 'dark'
  /** Current language — drives RTL layout. */
  language: 'en' | 'ar'
  /** Recent activity items for the Instagram-style grid. Defaults to []. */
  activity?: ProfileActivity[]
  /** Stat counts. Defaults to 0/0/0. */
  stats?: ProfileStats
}

const ACTIVITY_GRADIENTS: Record<ProfileActivity['type'], string> = {
  image: 'from-rose-500 to-orange-500',
  document: 'from-amber-500 to-orange-500',
  code: 'from-orange-500 to-rose-500',
}

function activityIconFor(type: ProfileActivity['type']) {
  if (type === 'image') return ImageIcon
  if (type === 'document') return FileText
  return Code
}

function formatMemberSince(iso?: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

function resolveDisplayName(user: AuthUser | null): string {
  if (user?.name && user.name.trim()) return user.name.trim()
  if (user?.email) return user.email.split('@')[0]
  return 'Guest'
}

function resolveInitial(name: string): string {
  const ch = name.trim().charAt(0)
  return ch ? ch.toUpperCase() : 'N'
}

/**
 * Instagram-style profile page.
 *
 * Reads the signed-in user from `useAuth()` directly (per spec). All
 * personalization / legal / action handlers are passed down from page.tsx —
 * the main agent will wire them in a follow-up pass.
 */
export function ProfilePage(props: ProfilePageProps) {
  const {
    onEditProfile,
    onSignIn,
    onSignUp,
    onOpenChat,
    onOpenConnect,
    onToggleTheme,
    onToggleLanguage,
    onRerunOnboarding,
    onOpenPrivacy,
    onOpenTerms,
    theme,
    language,
    activity,
    stats,
  } = props

  const auth = useAuth()
  const user: AuthUser | null = auth.user

  const [personalizationOpen, setPersonalizationOpen] = useState(true)
  const isRtl = language === 'ar'

  const displayName = resolveDisplayName(user)
  const displayInitial = resolveInitial(displayName)
  const interests = user?.interests ?? []
  const memberSince = formatMemberSince(user?.createdAt)
  const items = activity ?? []
  const counts: ProfileStats = {
    messages: stats?.messages ?? 0,
    files: stats?.files ?? 0,
    images: stats?.images ?? 0,
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="omni-scroll flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-2xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        {/* ===========================================================
            Section 1 — Header (Instagram-style)
        =========================================================== */}
        <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
          {/* Avatar */}
          {user?.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={displayName}
              width={96}
              height={96}
              className="h-20 w-20 rounded-full border-2 border-border object-cover shadow-sm sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient text-3xl font-bold text-primary-foreground ring-2 ring-border shadow-md shadow-primary/10 sm:h-24 sm:w-24">
              {displayInitial}
            </div>
          )}

          {/* Right column */}
          <div className="flex flex-1 flex-col gap-2">
            {/* Row 1 — name + Edit profile */}
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h1 className="text-xl font-semibold text-foreground">{displayName}</h1>
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditProfile}
                  className="h-9 rounded-lg px-4"
                >
                  <Pencil className="h-4 w-4" />
                  Edit profile
                </Button>
              )}
            </div>

            {/* Row 2 — stats (Instagram-style: bold number + muted label below) */}
            <div className="flex flex-row justify-center gap-6 text-sm sm:justify-start">
              <div className="flex flex-col items-center sm:items-start">
                <span className="font-bold text-foreground">{counts.messages}</span>
                <span className="text-xs text-muted-foreground">messages</span>
              </div>
              <span aria-hidden className="self-center text-muted-foreground/40">
                ·
              </span>
              <div className="flex flex-col items-center sm:items-start">
                <span className="font-bold text-foreground">{counts.files}</span>
                <span className="text-xs text-muted-foreground">files</span>
              </div>
              <span aria-hidden className="self-center text-muted-foreground/40">
                ·
              </span>
              <div className="flex flex-col items-center sm:items-start">
                <span className="font-bold text-foreground">{counts.images}</span>
                <span className="text-xs text-muted-foreground">images</span>
              </div>
            </div>

            {/* Row 3 — email + member since + location */}
            {user && (
              <div className="flex flex-wrap justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
                {user.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" aria-hidden />
                    {user.email}
                  </span>
                )}
                {memberSince && (
                  <>
                    <span aria-hidden className="text-muted-foreground/40">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" aria-hidden />
                      Member since {memberSince}
                    </span>
                  </>
                )}
                {user.location && (
                  <>
                    <span aria-hidden className="text-muted-foreground/40">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {user.location}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Row 4 — bio */}
            {user?.bio && <p className="text-sm text-foreground">{user.bio}</p>}

            {/* Row 5 — interests as chips */}
            {interests.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {interests.map((i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs capitalize text-primary"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden />
                    {i}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===========================================================
            Section 2 — Action bar
        =========================================================== */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          {user ? (
            <>
              <Button onClick={onEditProfile} className="h-10 rounded-xl">
                <Pencil className="h-4 w-4" />
                Edit profile
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void auth.signOut()
                }}
                className="h-10 rounded-xl"
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onSignIn} className="h-10 rounded-xl">
                <LogIn className="h-4 w-4" />
                Sign in
              </Button>
              <Button variant="outline" onClick={onSignUp} className="h-10 rounded-xl">
                <UserPlus className="h-4 w-4" />
                Sign up
              </Button>
            </>
          )}
        </div>

        {/* ===========================================================
            Section 3 — Activity grid (Instagram posts grid pattern)
        =========================================================== */}
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
            Recent activity
          </h2>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
              <Sparkles className="h-6 w-6 text-muted-foreground/60" aria-hidden />
              <p className="max-w-xs text-sm text-muted-foreground">
                No activity yet — start a conversation to see your creations here.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenChat}
                className="mt-1 rounded-lg"
              >
                <MessageSquare className="h-4 w-4" />
                Start chatting
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, idx) => {
                const Icon = activityIconFor(item.type)
                const grad = ACTIVITY_GRADIENTS[item.type]
                return (
                  <div
                    key={`${item.type}-${idx}-${item.createdAt}`}
                    title={item.title}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card"
                  >
                    {item.type === 'image' && item.url ? (
                      <Image
                        src={item.url}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 30vw, 200px"
                        className="object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${grad} text-white`}
                      >
                        <Icon className="h-6 w-6" aria-hidden />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ===========================================================
            Section 4 — Personalization (collapsible card)
        =========================================================== */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Header row (clickable) */}
            <button
              type="button"
              onClick={() => setPersonalizationOpen((o) => !o)}
              aria-expanded={personalizationOpen}
              aria-controls="profile-personalization-list"
              className="flex w-full items-center justify-between p-4 text-left transition hover:bg-secondary/60"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-semibold text-foreground">Personalization</span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    personalizationOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                />
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                Theme: {theme}
              </span>
            </button>

            {/* Collapsible content */}
            <AnimatePresence initial={false}>
              {personalizationOpen && (
                <motion.div
                  key="personalization-content"
                  id="profile-personalization-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="divide-y divide-border border-t border-border">
                    <button
                      type="button"
                      onClick={onOpenConnect}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Email &amp; apps
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span>Theme</span>
                      <span className="text-muted-foreground capitalize">{theme}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onToggleLanguage}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span>Language</span>
                      <span className="text-muted-foreground">
                        {language === 'en' ? 'English' : 'العربية'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onRerunOnboarding}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span>Re-run onboarding</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPrivacy}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Privacy Policy
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={onOpenTerms}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-secondary/60"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Terms of Service
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ===========================================================
            Section 5 — Memory (Phase 1 Priority 1)
            Per-user durable memory store. Lets a signed-in user view,
            add, edit, delete the facts NEXUS injects into the system
            prompt for future sessions. Guests see a sign-in CTA.
        =========================================================== */}
        <MemorySection language={language} />

        {/* ===========================================================
            Section 6 — Bottom legal footer
        =========================================================== */}
        <div className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="transition hover:text-foreground"
          >
            Privacy
          </button>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <button
            type="button"
            onClick={onOpenTerms}
            className="transition hover:text-foreground"
          >
            Terms
          </button>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span>© 2026 NEXUS AI</span>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
