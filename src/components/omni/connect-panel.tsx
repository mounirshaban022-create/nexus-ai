'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  CheckCircle2,
  Cloud,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface EmailPreset {
  id: string
  label: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  hint: string
}

interface EmailAccount {
  id: string
  label: string
  email: string
  imapHost: string
  smtpHost: string
  status: string // unverified | connected | error
  statusMessage: string
  createdAt: string
}

interface ConnectPanelProps {
  open: boolean
  onClose: () => void
  /** Called when an account is added or removed — parent can refresh state */
  onAccountsChange?: () => void
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/* The "coming soon" apps shown alongside Email in the Connect grid */
const COMING_SOON_APPS = [
  { id: 'calendar', label: 'Calendar', icon: Calendar, desc: 'Google Calendar · iCloud' },
  { id: 'drive', label: 'Cloud Drive', icon: Cloud, desc: 'Drive · Dropbox · OneDrive' },
  { id: 'slack', label: 'Slack', icon: MessageSquare, desc: 'Team messaging' },
  { id: 'web', label: 'Web', icon: Globe, desc: 'Live web search & reader' },
]

export function ConnectPanel({ open, onClose, onAccountsChange }: ConnectPanelProps) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [presets, setPresets] = useState<EmailPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // Form state
  const [presetId, setPresetId] = useState<string>('gmail')
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState('imap.gmail.com')
  const [imapPort, setImapPort] = useState(993)
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  /* ---------------- load accounts + presets ---------------- */
  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email/accounts')
      const data = await res.json()
      if (res.ok) {
        setAccounts(data.accounts ?? [])
        setPresets(data.presets ?? [])
      }
    } catch {
      /* best-effort */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadAccounts()
      setFormError(null)
      setFormSuccess(null)
      setShowAddForm(false)
    }
  }, [open, loadAccounts])

  /* ---------------- escape + focus ---------------- */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open && showAddForm && firstFieldRef.current) {
      const id = window.setTimeout(() => firstFieldRef.current?.focus(), 30)
      return () => window.clearTimeout(id)
    }
  }, [open, showAddForm])

  /* ---------------- preset selection ---------------- */
  const applyPreset = useCallback((id: string) => {
    setPresetId(id)
    setFormError(null)
    setFormSuccess(null)
    const p = presets.find((x) => x.id === id)
    if (!p || id === 'custom') return
    setImapHost(p.imapHost)
    setImapPort(p.imapPort)
    setSmtpHost(p.smtpHost)
    setSmtpPort(p.smtpPort)
    setSmtpSecure(p.smtpSecure)
    // Auto-derive label + username from email if empty
    setEmail((prev) => prev)
    setUsername((prev) => prev || email)
  }, [presets, email])

  /* ---------------- submit (connect account) ---------------- */
  const submit = useCallback(async () => {
    setFormError(null)
    setFormSuccess(null)
    if (!label.trim()) return setFormError('Give this account a label (e.g. "Work Gmail").')
    if (!EMAIL_REGEX.test(email)) return setFormError('Enter a valid email address.')
    if (!username.trim()) return setFormError('Username is required (usually your full email).')
    if (!password) return setFormError('Password / app password is required.')
    if (presetId === 'custom') {
      if (!imapHost || !imapPort || !smtpHost || !smtpPort) {
        return setFormError('Fill in the IMAP and SMTP host/port for your custom provider.')
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          email: email.trim(),
          fromName: fromName.trim(),
          imapHost,
          imapPort,
          smtpHost,
          smtpPort,
          smtpSecure,
          username: username.trim(),
          password,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return setFormError(data.error || 'Could not connect that account.')
      }
      const v = data.verification || {}
      if (v.ok) {
        setFormSuccess(v.message || 'Connected successfully.')
        // Reset form + refresh list
        setLabel('')
        setFromName('')
        setPassword('')
        setShowAddForm(false)
        await loadAccounts()
        onAccountsChange?.()
      } else {
        setFormError(v.message || 'Verification failed — check your credentials.')
      }
    } catch (err: any) {
      setFormError(err?.message || 'Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [label, email, fromName, username, password, presetId, imapHost, imapPort, smtpHost, smtpPort, smtpSecure, loadAccounts, onAccountsChange])

  /* ---------------- delete account ---------------- */
  const removeAccount = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/email/accounts/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await loadAccounts()
        onAccountsChange?.()
      }
    } catch {
      /* best-effort */
    } finally {
      setDeletingId(null)
    }
  }, [loadAccounts, onAccountsChange])

  const selectedPreset = presets.find((p) => p.id === presetId)
  const connectedCount = accounts.filter((a) => a.status === 'connected').length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="omni-scroll flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-3xl border border-border bg-background sm:max-w-lg sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Connect your apps and email"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold">Connect</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Link your email and apps to Nexus
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              {/* Connected apps grid */}
              <section>
                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Apps
                </h3>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {/* Email — the active connector */}
                  <div
                    className={`relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border p-3 ${
                      connectedCount > 0
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-border bg-card'
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
                      <Mail className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-semibold">Email</p>
                      <p className="text-[10px] text-muted-foreground">
                        {connectedCount > 0 ? `${connectedCount} connected` : 'Not connected'}
                      </p>
                    </div>
                    {connectedCount > 0 && (
                      <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    )}
                  </div>
                  {/* Coming-soon apps */}
                  {COMING_SOON_APPS.map((app) => {
                    const Icon = app.icon
                    return (
                      <div
                        key={app.id}
                        className="relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-3 opacity-60"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-xs font-semibold">{app.label}</p>
                          <p className="text-[10px] text-muted-foreground">Soon</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Email accounts list */}
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Email accounts
                  </h3>
                  <button
                    onClick={() => {
                      setShowAddForm((o) => !o)
                      setFormError(null)
                      setFormSuccess(null)
                    }}
                    className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:brightness-110"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {showAddForm ? 'Cancel' : 'Add account'}
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center">
                    <Mail className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" aria-hidden />
                    <p className="text-xs text-muted-foreground">
                      No email accounts yet. Add one to send and read email from Nexus.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {accounts.map((a) => {
                      const ok = a.status === 'connected'
                      return (
                        <li
                          key={a.id}
                          className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3"
                        >
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                              ok ? 'bg-emerald-500/15 text-emerald-600' : 'bg-destructive/15 text-destructive'
                            }`}
                          >
                            {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                              IMAP {a.imapHost} · SMTP {a.smtpHost}
                            </p>
                            {!ok && a.statusMessage && (
                              <p className="mt-1 text-[10px] text-destructive/90">{a.statusMessage}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeAccount(a.id)}
                            disabled={deletingId === a.id}
                            aria-label="Remove account"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {deletingId === a.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* Add-account form (collapsible) */}
              <AnimatePresence initial={false}>
                {showAddForm && (
                  <motion.section
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Mail className="h-4 w-4 text-primary" aria-hidden /> Connect an email account
                      </h4>

                      {/* Provider preset picker */}
                      <Label className="mb-1.5 block text-[11px] text-muted-foreground">Provider</Label>
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => applyPreset(p.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              presetId === p.id
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {selectedPreset?.hint && (
                        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
                          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          <span>{selectedPreset.hint}</span>
                        </p>
                      )}

                      <div className="space-y-3">
                        <Field>
                          <Label htmlFor="acct-label" className="mb-1.5 block text-[11px] text-muted-foreground">
                            Label
                          </Label>
                          <Input
                            id="acct-label"
                            ref={firstFieldRef}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Work Gmail"
                            className="h-10"
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="acct-email" className="mb-1.5 block text-[11px] text-muted-foreground">
                            Email address
                          </Label>
                          <Input
                            id="acct-email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value)
                              if (!username || username === email) setUsername(e.target.value)
                            }}
                            placeholder="you@gmail.com"
                            className="h-10"
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="acct-fromname" className="mb-1.5 block text-[11px] text-muted-foreground">
                            From name <span className="text-muted-foreground/60">(optional)</span>
                          </Label>
                          <Input
                            id="acct-fromname"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="Your name"
                            className="h-10"
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field>
                            <Label htmlFor="acct-user" className="mb-1.5 block text-[11px] text-muted-foreground">
                              Username
                            </Label>
                            <Input
                              id="acct-user"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="you@gmail.com"
                              className="h-10"
                            />
                          </Field>
                          <Field>
                            <Label htmlFor="acct-pass" className="mb-1.5 block text-[11px] text-muted-foreground">
                              Password / App password
                            </Label>
                            <Input
                              id="acct-pass"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="h-10"
                            />
                          </Field>
                        </div>

                        {/* Custom provider — show IMAP/SMTP fields */}
                        {presetId === 'custom' && (
                          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                              Custom IMAP / SMTP settings
                            </p>
                            <div className="grid grid-cols-2 gap-2.5">
                              <Field>
                                <Label className="mb-1 block text-[10px] text-muted-foreground">IMAP host</Label>
                                <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="h-9 text-xs" />
                              </Field>
                              <Field>
                                <Label className="mb-1 block text-[10px] text-muted-foreground">IMAP port</Label>
                                <Input
                                  type="number"
                                  value={imapPort}
                                  onChange={(e) => setImapPort(parseInt(e.target.value || '993', 10))}
                                  className="h-9 text-xs"
                                />
                              </Field>
                              <Field>
                                <Label className="mb-1 block text-[10px] text-muted-foreground">SMTP host</Label>
                                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="h-9 text-xs" />
                              </Field>
                              <Field>
                                <Label className="mb-1 block text-[10px] text-muted-foreground">SMTP port</Label>
                                <Input
                                  type="number"
                                  value={smtpPort}
                                  onChange={(e) => setSmtpPort(parseInt(e.target.value || '465', 10))}
                                  className="h-9 text-xs"
                                />
                              </Field>
                            </div>
                            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={smtpSecure}
                                onChange={(e) => setSmtpSecure(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-border"
                              />
                              Use SSL/TLS for SMTP
                            </label>
                          </div>
                        )}

                        {/* Error / success messages */}
                        {formError && (
                          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                            {formError}
                          </p>
                        )}
                        {formSuccess && (
                          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {formSuccess}
                          </p>
                        )}

                        <Button
                          onClick={submit}
                          disabled={submitting}
                          className="h-10 w-full gap-2 rounded-xl bg-primary text-primary-foreground"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" /> Connect account
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Help footer */}
              <p className="mt-5 text-center text-[10px] text-muted-foreground/60">
                Credentials are AES-256 encrypted at rest. Nexus never stores your password in plaintext.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
