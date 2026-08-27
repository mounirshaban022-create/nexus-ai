'use client'

/**
 * NEXUS One — premium dark Settings & Profile.
 *
 * Replaces the legacy light SettingsMode card with a full NEXUS One
 * experience: a profile hero (avatar upload + inline edit), an activity
 * stats row, the EMAIL CONNECTOR (Gmail / Outlook / any IMAP+SMTP account
 * with live verification — the "Hermes-style" connector), appearance
 * (language + dark-by-design note), bring-your-own-key AI providers,
 * legal + creator credit, and sign-out.
 *
 * Rendered inside a `FramedPanel fill dark`; this component owns a single
 * internal nx-scroll so the page never double-scrolls. Every label runs
 * through the i18n hook (EN/AR) so the whole surface flips with the
 * language preference.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Brain,
  Camera,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Languages,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { usePreferences } from '@/lib/preferences'
import { useI18n } from '@/lib/i18n'
import { useTheme } from 'next-themes'
import { getCurrentUser, signOut } from '@/lib/supabase'
import { BRAND, tint } from './shared'
import { NexusAuthModal } from './auth-modal'
import { LegalPage } from '@/components/omni/legal-page'

/* ------------------------------------------------------------------ */
/* Types + constants                                                   */
/* ------------------------------------------------------------------ */

interface ProfileUser {
  id: string
  email: string
  name?: string | null
  avatarUrl?: string | null
  bio?: string | null
  location?: string | null
  timezone?: string | null
  createdAt?: string | null
}

interface EmailAccountRow {
  id: string
  label: string
  email: string
  imapHost: string
  smtpHost: string
  status: string
  statusMessage?: string | null
  createdAt: string
}

interface EmailPresetRow {
  id: string
  label: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  hint: string
}

interface ProviderRow {
  id: string
  providerId: string
  label: string
  baseUrl: string
  defaultModel: string
  status: string
  statusMessage?: string | null
}

interface ProviderPresetRow {
  id: string
  label: string
  baseUrl: string
  defaultModel: string
  models: string[]
  freeNote: string
  keyUrl: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Providers that need no API key (mirrors ANONYMOUS_PROVIDER_IDS server-side). */
const ANONYMOUS_PROVIDER_IDS = new Set(['llm7', 'ovhcloud', 'kilocode'])

/** Vendored CLI-Anything skills — constant, matches the Skills browser. */
const SKILLS_COUNT = 79

const GMAIL_DEFAULT_HINT =
  'Enable 2FA, then create an App Password at myaccount.google.com/apppasswords'

const inputClass =
  'w-full min-h-[42px] rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#ff5a5f]/50 focus:ring-4 focus:ring-[#ff5a5f]/10'
const fieldLabelClass = 'mb-1.5 block text-xs font-medium text-zinc-400'

const EASE = [0.21, 1.02, 0.73, 1] as const

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatMemberSince(iso: string | null | undefined, lang: 'en' | 'ar'): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function isValidAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false
  return url.startsWith('/') || url.startsWith('http') || url.startsWith('data:')
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon: Icon,
  title,
  desc,
  accent = '#ff5a5f',
  delay = 0,
  children,
}: {
  icon: LucideIcon
  title: string
  desc?: string
  accent?: string
  delay?: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: EASE }}
      className="nx-glow-card p-5"
    >
      <header className="flex items-start gap-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8"
          style={{ background: tint(accent, 0.12), color: accent }}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-zinc-100">{title}</h2>
          {desc && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>}
        </div>
      </header>
      <div className="mt-4">{children}</div>
    </motion.section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  accent,
  delay,
}: {
  icon: LucideIcon
  label: string
  value: number | null
  loading: boolean
  accent: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      className="nx-glow-card p-4"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: tint(accent, 0.14), color: accent }}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        {loading ? (
          <span className="h-7 w-10 animate-pulse rounded-md bg-white/10" aria-hidden />
        ) : (
          <span className="font-display text-2xl font-bold leading-none tracking-tight text-zinc-100">
            {value === null ? '—' : value.toLocaleString()}
          </span>
        )}
      </div>
      <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
    </motion.div>
  )
}

function StatusDot({ status }: { status: string }) {
  const ok = status === 'connected'
  const error = status === 'error'
  return (
    <span
      className="relative flex h-2.5 w-2.5 shrink-0"
      role="img"
      aria-label={ok ? 'connected' : error ? 'error' : status}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          ok ? 'bg-emerald-400' : error ? 'bg-red-400' : 'bg-amber-400'
        }`}
      />
      {ok && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50" aria-hidden />
      )}
    </span>
  )
}

/** Dark ghost pill row (used for both preset pickers). */
function PresetPill({
  active,
  children,
  onClick,
  title,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-h-[34px] rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-[#ff5a5f]/45 bg-[#ff5a5f]/12 text-zinc-100'
          : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Email connect dialog                                                */
/* ------------------------------------------------------------------ */

function EmailConnectDialog({
  open,
  onOpenChange,
  presets,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: EmailPresetRow[]
  onConnected: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const { t } = useI18n()

  const [presetId, setPresetId] = useState('gmail')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState('imap.gmail.com')
  const [imapPort, setImapPort] = useState('993')
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Fresh form every time the dialog opens (Gmail defaults). */
  useEffect(() => {
    if (!open) return
    setPresetId('gmail')
    setEmail('')
    setPassword('')
    setImapHost('imap.gmail.com')
    setImapPort('993')
    setSmtpHost('smtp.gmail.com')
    setSmtpPort('465')
    setSmtpSecure(true)
    setError(null)
  }, [open])

  const selectedPreset = presets.find((p) => p.id === presetId)

  const applyPreset = (p: EmailPresetRow) => {
    setPresetId(p.id)
    setError(null)
    if (p.id === 'custom') return
    setImapHost(p.imapHost)
    setImapPort(String(p.imapPort))
    setSmtpHost(p.smtpHost)
    setSmtpPort(String(p.smtpPort))
    setSmtpSecure(p.smtpSecure)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (!password) {
      setError(t('settings.password') + ' — ' + (langPasswordHint(selectedPreset?.id) ?? ''))
      return
    }
    const iPort = parseInt(imapPort, 10)
    const sPort = parseInt(smtpPort, 10)
    if (!imapHost.trim() || !smtpHost.trim() || !(iPort >= 1 && iPort <= 65535) || !(sPort >= 1 && sPort <= 65535)) {
      setError('Fill in the IMAP and SMTP host/port for your provider.')
      return
    }

    const label =
      selectedPreset && selectedPreset.id !== 'custom'
        ? selectedPreset.label
        : email.trim().split('@')[1] || 'Email account'

    setSubmitting(true)
    try {
      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          email: email.trim(),
          imapHost: imapHost.trim(),
          imapPort: iPort,
          smtpHost: smtpHost.trim(),
          smtpPort: sPort,
          smtpSecure,
          username: email.trim(),
          password,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        verification?: { ok?: boolean; message?: string }
      }
      if (!res.ok) {
        setError(data.error || 'Could not connect that account.')
        return
      }
      const verification = data.verification ?? {}
      if (verification.ok) {
        toast({
          title: t('settings.emailConnected'),
          description: t('settings.connectionOk'),
        })
        onOpenChange(false)
        await onConnected()
      } else {
        setError(
          `${t('settings.connectionFailed')} — ${verification.message || 'check your credentials.'}`
        )
        // The failed attempt is saved with an error status — refresh the
        // list underneath so the row (and its status message) is visible.
        await onConnected()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function langPasswordHint(id: string | undefined): string {
    if (id === 'gmail') return 'use a Google App Password'
    if (id === 'outlook') return 'use a Microsoft App Password'
    return 'required'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto border-white/10 bg-[#101012] text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-left text-lg tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: tint('#ff5a5f', 0.14), color: '#ff5a5f' }}
              aria-hidden
            >
              <Mail className="h-4 w-4" />
            </span>
            {t('settings.emailConnect')}
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-zinc-500">
            {t('settings.emailDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Provider presets */}
          <div>
            <span className={fieldLabelClass} aria-hidden>
              Gmail · Outlook · IMAP
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Email provider presets">
              {(presets.length > 0
                ? presets
                : [
                    {
                      id: 'gmail',
                      label: 'Gmail',
                      imapHost: 'imap.gmail.com',
                      imapPort: 993,
                      smtpHost: 'smtp.gmail.com',
                      smtpPort: 465,
                      smtpSecure: true,
                      hint: GMAIL_DEFAULT_HINT,
                    },
                  ]
              ).map((p) => (
                <PresetPill key={p.id} active={presetId === p.id} onClick={() => applyPreset(p)}>
                  {p.id === 'custom' ? 'Custom IMAP' : p.label.split(' ')[0]}
                </PresetPill>
              ))}
            </div>
          </div>

          {/* Credentials */}
          <label className="block">
            <span className={fieldLabelClass}>{t('settings.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('settings.emailHint')}
              autoComplete="email"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={fieldLabelClass}>{t('settings.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••• •••• •••• ••••"
              autoComplete="new-password"
              className={inputClass}
            />
          </label>

          {/* Preset hint */}
          <p className="flex items-start gap-2 rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/[0.07] px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-[#f5c46a]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {selectedPreset?.hint ?? GMAIL_DEFAULT_HINT}
          </p>

          {/* Server settings */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_5.5rem]">
            <label className="block">
              <span className={fieldLabelClass}>{t('settings.imapHost')}</span>
              <input
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.gmail.com"
                spellCheck={false}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>{t('settings.port')}</span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                min={1}
                max={65535}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>{t('settings.smtpHost')}</span>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                spellCheck={false}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>{t('settings.port')}</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                min={1}
                max={65535}
                className={inputClass}
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="nx-gradient-surface flex min-h-[44px] flex-[2] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('settings.verifying')}
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" aria-hidden />
                  {t('settings.connect')}
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Add AI provider dialog                                              */
/* ------------------------------------------------------------------ */

function AddProviderDialog({
  open,
  onOpenChange,
  presets,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: ProviderPresetRow[]
  onDone: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const { t } = useI18n()

  const [providerId, setProviderId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProviderId(presets[0]?.id ?? 'llm7')
    setApiKey('')
    setModel('')
    setError(null)
    // presets may still be loading when the dialog opens — fall back once.
    if (!presets[0]?.id) {
      const t = setTimeout(() => setProviderId((cur) => cur || 'llm7'), 0)
      return () => clearTimeout(t)
    }
  }, [open, presets])

  const selected = presets.find((p) => p.id === providerId)
  const isAnonymous = ANONYMOUS_PROVIDER_IDS.has(providerId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !providerId) return
    setError(null)
    if (!isAnonymous && !apiKey.trim()) {
      setError('API key is required for this provider.')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, string> = { providerId }
      if (apiKey.trim()) body.apiKey = apiKey.trim()
      if (model.trim()) body.defaultModel = model.trim()
      const res = await fetch('/api/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        verification?: { ok?: boolean; message?: string }
      }
      if (!res.ok) {
        setError(data.error || 'Could not add that provider.')
        return
      }
      const verification = data.verification ?? {}
      if (verification.ok) {
        toast({ title: t('settings.connected'), description: verification.message })
      } else {
        toast({
          title: t('settings.connectionFailed'),
          description: verification.message,
          variant: 'destructive',
        })
      }
      onOpenChange(false)
      await onDone()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto border-white/10 bg-[#101012] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-left text-lg tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: tint('#f5a623', 0.12), color: '#f5a623' }}
              aria-hidden
            >
              <Bot className="h-4 w-4" />
            </span>
            {t('settings.addProvider')}
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-zinc-500">
            {t('settings.aiProvidersDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Provider preset pills */}
          <div>
            <span className={fieldLabelClass} aria-hidden>
              Provider
            </span>
            <div
              className="nx-scroll flex max-h-32 flex-wrap gap-1.5 overflow-y-auto p-0.5"
              role="group"
              aria-label="AI provider presets"
            >
              {(presets.length > 0
                ? presets
                : [
                    {
                      id: 'llm7',
                      label: 'LLM7.io (No Key)',
                      baseUrl: '',
                      defaultModel: '',
                      models: [],
                      freeNote: '',
                      keyUrl: '',
                    },
                  ]
              ).map((p) => (
                <PresetPill key={p.id} active={providerId === p.id} onClick={() => setProviderId(p.id)}>
                  {p.label}
                </PresetPill>
              ))}
            </div>
          </div>

          {/* Selected provider info */}
          {selected && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5">
              <p className="text-[11px] leading-relaxed text-zinc-400">{selected.freeNote}</p>
              <p className="mt-1.5 truncate font-mono text-[10px] text-zinc-600" title={selected.baseUrl}>
                {selected.baseUrl}
              </p>
              {selected.keyUrl && (
                <a
                  href={selected.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 transition hover:underline dark:text-[#ff8a80]"
                >
                  Get a key <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </div>
          )}

          {/* API key */}
          <label className="block">
            <span className={fieldLabelClass}>
              {t('settings.apiKey')}
              {isAnonymous && <span className="ml-1.5 font-normal text-zinc-600">(optional)</span>}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isAnonymous ? 'No key needed — works anonymously' : 'sk-…'}
              autoComplete="off"
              className={inputClass}
            />
          </label>

          {/* Model */}
          <label className="block">
            <span className={fieldLabelClass}>
              {t('settings.model')}
              <span className="ml-1.5 font-normal text-zinc-600">(optional)</span>
            </span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selected?.defaultModel || 'model-id'}
              list="nx-provider-models"
              spellCheck={false}
              className={`${inputClass} font-mono text-[13px]`}
            />
            <datalist id="nx-provider-models">
              {(selected?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="nx-gradient-surface flex min-h-[44px] flex-[2] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('settings.verifying')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden />
                  {t('settings.addProvider')}
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function NexusSettingsMode() {
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const prefs = usePreferences()
  const { theme, setTheme } = useTheme()

  /* ---------------- user + profile ---------------- */
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)

  /* inline profile edit */
  const [editing, setEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', bio: '', location: '', timezone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  /* ---------------- stats ---------------- */
  const [stats, setStats] = useState<{
    conversations: number | null
    memories: number | null
    creations: number | null
  }>({ conversations: null, memories: null, creations: null })
  const [statsLoading, setStatsLoading] = useState(false)

  /* ---------------- email connector ---------------- */
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountRow[]>([])
  const [emailPresets, setEmailPresets] = useState<EmailPresetRow[]>([])
  const [emailLoading, setEmailLoading] = useState(true)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null)

  /* ---------------- AI providers ---------------- */
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [providerPresets, setProviderPresets] = useState<ProviderPresetRow[]>([])
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)

  /* ---------------- legal ---------------- */
  const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null)

  /* ---------------- sign out ---------------- */
  const [signingOut, setSigningOut] = useState(false)

  /* --------------- data loading --------------- */

  const loadUser = useCallback(async () => {
    try {
      const u = await getCurrentUser()
      setUser((u as ProfileUser | null) ?? null)
    } catch {
      setUser(null)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  /** Activity stats — signed-in users only; guests see "—". */
  useEffect(() => {
    if (userLoading || !user) return
    let cancelled = false
    setStatsLoading(true)
    const load = async () => {
      const [sessionsR, memoriesR, libraryR] = await Promise.allSettled([
        fetch('/api/chat/sessions?kind=chat'),
        fetch('/api/memory'),
        fetch('/api/library'),
      ])
      if (cancelled) return
      const next = { conversations: null as number | null, memories: null as number | null, creations: null as number | null }
      if (sessionsR.status === 'fulfilled' && sessionsR.value.ok) {
        const d = (await sessionsR.value.json().catch(() => null)) as { sessions?: unknown[] } | null
        if (Array.isArray(d?.sessions)) next.conversations = d.sessions.length
      }
      if (memoriesR.status === 'fulfilled' && memoriesR.value.ok) {
        const d = (await memoriesR.value.json().catch(() => null)) as { memories?: unknown[] } | null
        if (Array.isArray(d?.memories)) next.memories = d.memories.length
      }
      if (libraryR.status === 'fulfilled' && libraryR.value.ok) {
        const d = (await libraryR.value.json().catch(() => null)) as { items?: unknown[] } | null
        if (Array.isArray(d?.items)) next.creations = d.items.length
      }
      if (!cancelled) setStats(next)
    }
    void load().finally(() => {
      if (!cancelled) setStatsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userLoading, user])

  const loadEmail = useCallback(async () => {
    setEmailLoading(true)
    try {
      const res = await fetch('/api/email/accounts')
      const data = (await res.json().catch(() => ({}))) as {
        accounts?: EmailAccountRow[]
        presets?: EmailPresetRow[]
      }
      if (res.ok) {
        setEmailAccounts(Array.isArray(data.accounts) ? data.accounts : [])
        setEmailPresets(Array.isArray(data.presets) ? data.presets : [])
      }
    } catch {
      /* best-effort */
    } finally {
      setEmailLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEmail()
  }, [loadEmail])

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-providers')
      const data = (await res.json().catch(() => ({}))) as {
        providers?: ProviderRow[]
        presets?: ProviderPresetRow[]
      }
      if (res.ok) {
        setProviders(Array.isArray(data.providers) ? data.providers : [])
        setProviderPresets(Array.isArray(data.presets) ? data.presets : [])
      }
    } catch {
      /* best-effort */
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  /* --------------- profile actions --------------- */

  /** Mirror profile fields into the local preferences store (chat uses these). */
  const mirrorProfile = useCallback(
    (patch: { name?: string; bio?: string; location?: string; timezone?: string; avatarUrl?: string }) => {
      const s = usePreferences.getState()
      s.completeOnboarding({
        name: patch.name ?? s.name,
        interests: s.interests,
        commStyle: s.commStyle,
        bio: patch.bio ?? s.bio,
        location: patch.location ?? s.location,
        timezone: patch.timezone ?? s.timezone,
        avatarUrl: patch.avatarUrl ?? s.avatarUrl,
      })
    },
    []
  )

  const startEdit = useCallback(() => {
    setProfileForm({
      name: user?.name || prefs.name || '',
      bio: user?.bio || prefs.bio || '',
      location: user?.location || prefs.location || '',
      timezone: user?.timezone || prefs.timezone || '',
    })
    setEditing(true)
  }, [user, prefs.name, prefs.bio, prefs.location, prefs.timezone])

  const saveProfile = useCallback(async () => {
    if (savingProfile) return
    setSavingProfile(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileForm.name.trim() || undefined,
          bio: profileForm.bio.trim(),
          location: profileForm.location.trim(),
          timezone: profileForm.timezone.trim(),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        user?: Partial<ProfileUser>
      }
      if (!res.ok) {
        toast({
          title: 'Could not save profile',
          description: data.error || 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      const u = data.user
      setUser((prev) => (prev && u ? { ...prev, ...u } : prev))
      mirrorProfile({
        name: u?.name ?? '',
        bio: u?.bio ?? '',
        location: u?.location ?? '',
        timezone: u?.timezone ?? '',
      })
      setEditing(false)
      toast({ title: t('settings.saved') })
    } catch {
      toast({
        title: 'Network error',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }, [savingProfile, profileForm, toast, t, mirrorProfile])

  const handleAvatarFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || uploadingAvatar) return
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        toast({
          title: 'Unsupported image',
          description: 'Use a PNG, JPEG or WebP image.',
          variant: 'destructive',
        })
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'Image too large',
          description: 'Please pick an image under 2 MB.',
          variant: 'destructive',
        })
        return
      }
      setUploadingAvatar(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/user/avatar', { method: 'POST', body: fd })
        const data = (await res.json().catch(() => ({}))) as { avatarUrl?: string; error?: string }
        if (!res.ok) {
          toast({
            title: 'Upload failed',
            description: data.error || 'Please try again.',
            variant: 'destructive',
          })
          return
        }
        const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : ''
        setUser((u) => (u ? { ...u, avatarUrl } : u))
        if (avatarUrl) mirrorProfile({ avatarUrl })
        toast({ title: 'Photo updated' })
      } catch {
        toast({ title: 'Upload failed', description: 'Network error.', variant: 'destructive' })
      } finally {
        setUploadingAvatar(false)
        if (avatarInputRef.current) avatarInputRef.current.value = ''
      }
    },
    [uploadingAvatar, toast, mirrorProfile]
  )

  /* --------------- email actions --------------- */

  const disconnectEmail = useCallback(
    async (id: string) => {
      if (deletingEmailId) return
      setDeletingEmailId(id)
      try {
        const res = await fetch(`/api/email/accounts/${id}`, { method: 'DELETE' })
        if (res.ok) {
          toast({ title: 'Email disconnected' })
          await loadEmail()
        } else {
          toast({ title: 'Could not disconnect', variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Network error', variant: 'destructive' })
      } finally {
        setDeletingEmailId(null)
      }
    },
    [deletingEmailId, toast, loadEmail]
  )

  /* --------------- provider actions --------------- */

  const removeProvider = useCallback(
    async (id: string) => {
      if (deletingProviderId) return
      setDeletingProviderId(id)
      try {
        const res = await fetch(`/api/ai-providers/${id}`, { method: 'DELETE' })
        if (res.ok) {
          toast({ title: 'Provider removed' })
          await loadProviders()
        } else {
          toast({ title: 'Could not remove provider', variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Network error', variant: 'destructive' })
      } finally {
        setDeletingProviderId(null)
      }
    },
    [deletingProviderId, toast, loadProviders]
  )

  /* --------------- auth actions --------------- */

  const handleAuthOpenChange = useCallback((open: boolean) => {
    setShowAuth(open)
    if (!open) {
      // If a session was created inside the modal, reload so the whole app
      // (shell sidebar, chat state) picks it up coherently.
      void getCurrentUser().then((u) => {
        if (u) window.location.reload()
      })
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      /* best-effort */
    } finally {
      window.location.reload()
    }
  }, [signingOut])

  /* --------------- derived --------------- */

  const avatarUrl = user?.avatarUrl || (isValidAvatarUrl(prefs.avatarUrl) ? prefs.avatarUrl : '')
  const displayName = user?.name || prefs.name || user?.email || t('settings.guest')
  const memberSince = formatMemberSince(user?.createdAt, lang)
  const statsBusy = userLoading || statsLoading
  const connectedEmailCount = emailAccounts.filter((a) => a.status === 'connected').length

  /* --------------- render --------------- */

  return (
    <div className="nx-scroll h-full min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-14 md:p-6 md:pb-16">
        {/* ============ 1 · Profile hero ============ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="nx-glow-card relative overflow-hidden p-5 md:p-6"
        >
          {/* brand aura decoration */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 -right-20 h-64 w-64 rounded-full"
            style={{
              background: `radial-gradient(closest-side, ${tint('#ff5a5f', 0.16)}, transparent 70%)`,
            }}
          />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Avatar (upload for signed-in users) */}
            <div className="relative shrink-0 self-start sm:self-center">
              <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] md:h-24 md:w-24">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center font-display text-3xl font-bold text-white"
                    style={{ backgroundImage: BRAND.gradient }}
                  >
                    {displayName.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  aria-label={t('settings.changePhoto')}
                  title={t('settings.changePhoto')}
                  className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#1a1a1e] text-zinc-300 shadow-lg transition hover:border-[#ff5a5f]/50 hover:text-zinc-100 disabled:opacity-60"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarFile(e.target.files?.[0])}
              />
            </div>

            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display truncate text-xl font-bold tracking-tight text-zinc-100">
                  {displayName}
                </h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    user
                      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-zinc-400'
                  }`}
                >
                  {user ? t('settings.account') : t('settings.guest')}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-400">
                {user ? user.email : t('settings.guestHint')}
              </p>
              {user && memberSince && (
                <p className="mt-1 text-xs text-zinc-600">
                  {t('settings.memberSince')} {memberSince}
                </p>
              )}
              {user && (user.location || user.bio) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  {user.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-zinc-600" aria-hidden />
                      {user.location}
                    </span>
                  )}
                  {user.bio && <span className="line-clamp-1 italic">{user.bio}</span>}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="shrink-0">
              {user ? (
                <button
                  type="button"
                  onClick={() => (editing ? setEditing(false) : startEdit())}
                  className="flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-zinc-300 transition hover:border-[#ff5a5f]/40 hover:text-zinc-100"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {editing ? t('settings.cancel') : t('settings.editProfile')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAuth(true)}
                  className="nx-gradient-surface flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-sm font-semibold"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  {t('nav.signIn')}
                </button>
              )}
            </div>
          </div>

          {/* Inline edit form */}
          {editing && user && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.25, ease: EASE }}
              className="relative mt-5 space-y-3 overflow-hidden border-t border-white/8 pt-5"
              onSubmit={(e) => {
                e.preventDefault()
                void saveProfile()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabelClass}>{t('settings.name')}</span>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                    maxLength={80}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t('settings.location')}</span>
                  <input
                    type="text"
                    value={profileForm.location}
                    onChange={(e) => setProfileForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Dubai, UAE"
                    maxLength={120}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className={fieldLabelClass}>{t('settings.bio')}</span>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="A line about you — NEXUS uses it to personalize replies."
                  maxLength={500}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </label>
              <label className="block">
                <span className={fieldLabelClass}>{t('settings.timezone')}</span>
                <input
                  type="text"
                  value={profileForm.timezone}
                  onChange={(e) => setProfileForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder={
                    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dubai'
                  }
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="min-h-[42px] rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
                >
                  {t('settings.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="nx-gradient-surface flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
                >
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {t('settings.save')}
                </button>
              </div>
            </motion.form>
          )}
        </motion.section>

        {/* ============ 2 · Activity stats ============ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={MessageSquare}
            label={t('settings.conversations')}
            value={user ? stats.conversations : null}
            loading={statsBusy}
            accent="#ff5a5f"
            delay={0.05}
          />
          <StatCard
            icon={Wand2}
            label={t('settings.creations')}
            value={user ? stats.creations : null}
            loading={statsBusy}
            accent="#f5a623"
            delay={0.09}
          />
          <StatCard
            icon={Brain}
            label={t('settings.memories')}
            value={user ? stats.memories : null}
            loading={statsBusy}
            accent="#ff2a68"
            delay={0.13}
          />
          <StatCard
            icon={Puzzle}
            label={t('settings.skillsUsed')}
            value={SKILLS_COUNT}
            loading={false}
            accent="#34d399"
            delay={0.17}
          />
        </div>

        {/* ============ 3 · Email connector ============ */}
        <SectionCard
          icon={Mail}
          title={t('settings.email')}
          desc={t('settings.emailDesc')}
          accent="#ff5a5f"
          delay={0.14}
        >
          {emailLoading ? (
            <div className="space-y-2.5">
              <div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" />
              <div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" />
            </div>
          ) : emailAccounts.length === 0 ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8"
                  style={{ background: tint('#ff5a5f', 0.1), color: '#ff5a5f' }}
                  aria-hidden
                >
                  <Mail className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{t('settings.emailConnect')}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Gmail · Outlook · Yahoo · iCloud · Zoho · IMAP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailDialogOpen(true)}
                className="nx-gradient-surface flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold sm:w-auto"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('settings.connect')}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {emailAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-3.5 transition hover:border-white/15"
                >
                  <StatusDot status={a.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{a.email}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {a.label}
                      {a.statusMessage ? ` · ${a.statusMessage}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void disconnectEmail(a.id)}
                    disabled={deletingEmailId === a.id}
                    aria-label={`${t('settings.disconnect')} ${a.email}`}
                    title={t('settings.disconnect')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                  >
                    {deletingEmailId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              ))}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex max-w-md items-start gap-2 text-xs leading-relaxed text-zinc-500">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-[#f5a623]" aria-hidden />
                  {t('settings.emailAskHint')}
                </p>
                <button
                  type="button"
                  onClick={() => setEmailDialogOpen(true)}
                  className="flex min-h-[38px] shrink-0 items-center gap-1.5 self-start rounded-xl border border-white/10 px-3.5 text-xs font-medium text-zinc-400 transition hover:border-[#ff5a5f]/40 hover:text-zinc-100 sm:self-auto"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {connectedEmailCount > 0 ? t('settings.connect') : t('settings.connect')}
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ============ 4 · Appearance ============ */}
        <SectionCard
          icon={Languages}
          title={t('settings.appearance')}
          accent="#f5a623"
          delay={0.18}
        >
          <div className="space-y-4">
            {/* Theme (Light / Dark) — backed by next-themes. The `.dark`
                class on <html> flips the entire shell + chat + overlays
                via the light-mode overrides in globals.css. */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-zinc-200">{t('settings.theme')}</span>
              <div
                className="flex overflow-hidden rounded-full border border-white/10 bg-black/30"
                role="group"
                aria-label={t('settings.theme')}
              >
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  aria-pressed={theme === 'light'}
                  className={`flex min-h-[36px] items-center gap-1.5 px-5 text-sm font-semibold transition ${
                    theme === 'light'
                      ? 'bg-[#ff5a5f]/15 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" aria-hidden />
                  {t('settings.light')}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  aria-pressed={theme === 'dark'}
                  className={`flex min-h-[36px] items-center gap-1.5 border-l border-white/10 px-5 text-sm font-semibold transition ${
                    theme === 'dark'
                      ? 'bg-[#ff5a5f]/15 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" aria-hidden />
                  {t('settings.dark')}
                </button>
              </div>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-zinc-200">{t('settings.language')}</span>
              <div
                className="flex overflow-hidden rounded-full border border-white/10 bg-black/30"
                role="group"
                aria-label={t('settings.language')}
              >
                <button
                  type="button"
                  onClick={() => prefs.setLanguage('en')}
                  aria-pressed={lang === 'en'}
                  className={`min-h-[36px] px-5 text-sm font-semibold transition ${
                    lang === 'en'
                      ? 'bg-[#ff5a5f]/15 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => prefs.setLanguage('ar')}
                  aria-pressed={lang === 'ar'}
                  className={`min-h-[36px] border-l border-white/10 px-5 text-sm font-semibold transition ${
                    lang === 'ar'
                      ? 'bg-[#ff5a5f]/15 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  عربي
                </button>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ============ 5 · AI providers ============ */}
        <SectionCard
          icon={Bot}
          title={t('settings.aiProviders')}
          desc={t('settings.aiProvidersDesc')}
          accent="#ff2a68"
          delay={0.22}
        >
          <div className="space-y-2.5">
            {providers.length === 0 ? (
              <p className="rounded-xl border border-white/8 bg-black/20 p-3.5 text-xs leading-relaxed text-zinc-500">
                No providers connected — NEXUS runs on its built-in engine with automatic free
                fallbacks. Add your own key for priority speed and quotas.
              </p>
            ) : (
              providers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-3.5 transition hover:border-white/15"
                >
                  <StatusDot status={p.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{p.label}</p>
                    <p
                      className="truncate font-mono text-[11px] text-zinc-500"
                      title={p.statusMessage || p.defaultModel}
                    >
                      {p.defaultModel}
                      {p.status !== 'connected' && p.statusMessage ? ` · ${p.statusMessage}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeProvider(p.id)}
                    disabled={deletingProviderId === p.id}
                    aria-label={`${t('common.delete')} ${p.label}`}
                    title={t('common.delete')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                  >
                    {deletingProviderId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              ))
            )}

            <button
              type="button"
              onClick={() => setProviderDialogOpen(true)}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm font-medium text-zinc-400 transition hover:border-[#ff2a68]/50 hover:text-zinc-100"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('settings.addProvider')}
            </button>
          </div>
        </SectionCard>

        {/* ============ 6 · Legal + Creator ============ */}
        <div className="grid gap-3 md:grid-cols-2">
          <SectionCard
            icon={ShieldCheck}
            title={t('settings.legal')}
            accent="#a1a1aa"
            delay={0.26}
          >
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setLegalPage('privacy')}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/30 px-3.5 py-3 text-left transition hover:border-white/20 hover:bg-black/50"
              >
                <span className="flex items-center gap-2.5 text-sm text-zinc-300">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                  {t('settings.privacyPolicy')}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => setLegalPage('terms')}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/30 px-3.5 py-3 text-left transition hover:border-white/20 hover:bg-black/50"
              >
                <span className="flex items-center gap-2.5 text-sm text-zinc-300">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                  {t('settings.termsOfService')}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"
                  aria-hidden
                />
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={Sparkles}
            title={t('settings.creator')}
            accent="#f5a623"
            delay={0.3}
          >
            <div className="flex flex-col items-center py-1 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold text-white shadow-[0_10px_28px_-10px_rgba(255,90,95,0.55)]"
                style={{ backgroundImage: BRAND.gradient }}
              >
                MS
              </div>
              <h3 className="font-display mt-3 text-base font-bold tracking-tight text-zinc-100">
                Mounir Shaaban
              </h3>
              <p className="mt-0.5 text-xs font-medium text-rose-600 dark:text-[#ff8a80]">
                {t('settings.creatorRole')}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <MapPin className="h-3 w-3" aria-hidden />
                {t('settings.creatorLocation')}
              </p>
              <p className="mt-3 w-full border-t border-white/8 pt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                NEXUS AI © 2026
              </p>
            </div>
          </SectionCard>
        </div>

        {/* ============ 7 · Sign out ============ */}
        {user && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.32, ease: EASE }}
          >
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/[0.08] px-4 text-sm font-semibold text-red-300 transition hover:border-red-500/45 hover:bg-red-500/15 disabled:opacity-60"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-4 w-4" aria-hidden />
              )}
              {t('nav.signOut')}
            </button>
          </motion.section>
        )}

        {/* Footer */}
        <p className="pt-2 text-center text-[10px] uppercase tracking-[0.22em] text-zinc-700">
          NEXUS AI · One AI. Every superpower.
        </p>
      </div>

      {/* ============ Dialogs + overlays ============ */}
      <EmailConnectDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        presets={emailPresets}
        onConnected={loadEmail}
      />
      <AddProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        presets={providerPresets}
        onDone={loadProviders}
      />
      {showAuth && <NexusAuthModal open onOpenChange={handleAuthOpenChange} />}
      {/* LegalPage uses shadcn semantic tokens — the .dark wrapper resolves
          them to dark values inside the always-dark NEXUS shell. */}
      <div className="dark">
        {legalPage && (
          <LegalPage
            type={legalPage}
            onClose={() => setLegalPage(null)}
            language={lang}
          />
        )}
      </div>
    </div>
  )
}
