'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen,
  BookOpenText,
  Calculator,
  CloudSun,
  FlaskConical,
  Github,
  Globe2,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mail,
  MailCheck,
  Newspaper,
  PlugZap,
  Power,
  RotateCcw,
  Terminal,
  Trash2,
  TrendingUp,
  Languages,
  MapPin,
  Rocket,
  Sparkles,
  Plus,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConnectorsStore } from './connectors-store'
import type { ConnectorMeta } from './modes'
import { useToast } from '@/hooks/use-toast'

const CONNECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Globe2,
  read_page: Link2,
  wikipedia: BookOpenText,
  weather: CloudSun,
  forecast: CloudSun,
  hacker_news: Newspaper,
  github: Github,
  time: Terminal,
  calculator: Calculator,
  generate_image: ImageIcon,
  crypto: TrendingUp,
  dictionary: BookOpenText,
  translate: Languages,
  geocode: MapPin,
  currency: TrendingUp,
  research: FlaskConical,
  space: Rocket,
  email_list: Mail,
  email_search: Mail,
  email_read: Mail,
  email_send: Mail,
  worldbank: TrendingUp,
  poetry: BookOpen,
  bible: BookOpen,
  recipes: FlaskConical,
  nasa: Rocket,
  pokemon: Sparkles,
  trivia: Terminal,
  games: TrendingUp,
  news: Newspaper,
}

const CATEGORY_LABELS: Record<string, string> = {
  email: 'Email (your real account)',
  web: 'Web & Live Data',
  knowledge: 'Knowledge & Fun',
  finance: 'Finance',
  developer: 'Developer',
  utility: 'Utilities',
}

const CATEGORY_ORDER: Array<keyof typeof CATEGORY_LABELS> = [
  'email',
  'web',
  'knowledge',
  'finance',
  'developer',
  'utility',
]

interface EmailAccount {
  id: string
  label: string
  email: string
  status: string
  statusMessage: string
}

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

export function ConnectorsMode() {
  const { toast } = useToast()
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({})

  // Email accounts
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [presets, setPresets] = useState<EmailPreset[]>([])
  const [showAddAccount, setShowAddAccount] = useState(false)

  const { enabled, toggle, enableAll } = useConnectorsStore()

  const loadConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors')
      if (res.ok) {
        const data = await res.json()
        setConnectors(data.connectors ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/email/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts ?? [])
        setPresets(data.presets ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadConnectors()
    loadAccounts()
  }, [loadConnectors, loadAccounts])

  const testConnector = useCallback(
    async (connector: ConnectorMeta) => {
      setTesting(connector.id)
      try {
        const res = await fetch('/api/connectors/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: connector.id, args: connector.sampleArgs }),
        })
        const data = await res.json()
        setTestResult((prev) => ({
          ...prev,
          [connector.id]: {
            ok: res.ok,
            text: JSON.stringify(data.result ?? data.error ?? data, null, 2).slice(0, 2500),
          },
        }))
      } catch (error) {
        setTestResult((prev) => ({
          ...prev,
          [connector.id]: { ok: false, text: error instanceof Error ? error.message : 'Test failed' },
        }))
      } finally {
        setTesting(null)
      }
    },
    []
  )

  const deleteAccount = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/email/accounts/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setAccounts((prev) => prev.filter((a) => a.id !== id))
        toast({ title: 'Account removed' })
      } catch {
        toast({ title: 'Could not remove account', variant: 'destructive' })
      }
    },
    [toast]
  )

  const retestAccount = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/email/accounts/${id}/test`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Test failed')
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data.account } : a)))
        toast({
          title: data.verification.ok ? 'Account connected' : 'Connection failed',
          description: data.verification.message,
          variant: data.verification.ok ? undefined : 'destructive',
        })
      } catch (error) {
        toast({
          title: 'Test failed',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  const emailConnectors = connectors.filter((c) => c.category === 'email')
  const otherConnectors = connectors.filter((c) => c.category !== 'email')

  const grouped = useMemo(() => {
    const map = new Map<string, ConnectorMeta[]>()
    for (const c of otherConnectors) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return map
  }, [otherConnectors])

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <PlugZap className="h-5 w-5 text-teal-300" aria-hidden /> Connectors
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {connectors.length} live connections — including your real email. Toggle what the
              Agent can reach, and test each link.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 rounded-full border-border bg-card px-3 py-1 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              {enabled.length}/{connectors.length || 21} connected
            </Badge>
            {enabled.length < (connectors.length || 21) && (
              <Button variant="outline" size="sm" onClick={enableAll} className="gap-1.5 rounded-lg text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Enable all
              </Button>
            )}
          </div>
        </header>

        {/* ---------------- Email Accounts ---------------- */}
        <section className="mb-8" aria-label="Email accounts">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Mail className="h-3.5 w-3.5 text-primary" aria-hidden />
            Accounts — real email access
          </h3>
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            {accounts.length === 0 ? (
              <div className="text-center">
                <Mail className="mx-auto mb-3 h-8 w-8 text-primary/60" aria-hidden />
                <h4 className="text-sm font-semibold">Connect your email — real inbox, real sending</h4>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  NEXUS reads your actual inbox and sends real emails for you via IMAP/SMTP. Works
                  with Gmail, Outlook, iCloud, Yahoo and more — using an app password that&apos;s
                  stored encrypted on this machine only.
                </p>
                <Button
                  onClick={() => setShowAddAccount(true)}
                  className="mt-4 gap-2 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-500 px-5 text-white hover:from-fuchsia-400 hover:to-violet-400"
                >
                  <Plus className="h-4 w-4" /> Connect email account
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/70 p-4"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        account.status === 'connected'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-destructive/30 bg-destructive/10 text-destructive'
                      }`}
                    >
                      {account.status === 'connected' ? (
                        <MailCheck className="h-5 w-5" aria-hidden />
                      ) : (
                        <Mail className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {account.label} <span className="font-normal text-muted-foreground">· {account.email}</span>
                      </p>
                      <p className={`truncate text-xs ${account.status === 'connected' ? 'text-emerald-700' : 'text-destructive/80'}`}>
                        {account.statusMessage || account.status}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => retestAccount(account.id)} className="rounded-lg text-xs">
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteAccount(account.id)}
                        className="rounded-lg text-xs hover:border-destructive/40 hover:text-destructive"
                        aria-label={`Remove ${account.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddAccount(true)}
                  className="gap-1.5 rounded-lg text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another account
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- Connector cards ---------------- */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="omni-shimmer h-44 rounded-2xl border border-border/60" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {CATEGORY_ORDER.map((category) => {
              const list =
                category === 'email'
                  ? emailConnectors
                  : grouped.get(category) ?? []
              if (list.length === 0) return null

              return (
                <section key={category} aria-label={CATEGORY_LABELS[category]}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((connector, i) => {
                      const Icon = CONNECTOR_ICONS[connector.id] ?? PlugZap
                      const isOn = enabled.includes(connector.id)
                      const result = testResult[connector.id]
                      const needsAccount = (connector as { requiresAccount?: boolean }).requiresAccount
                      const accountMissing = needsAccount && accounts.filter((a) => a.status === 'connected').length === 0
                      return (
                        <motion.div
                          key={connector.id}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: i * 0.03 }}
                          className={`relative flex flex-col rounded-2xl border bg-card/70 p-5 backdrop-blur transition-colors ${
                            isOn ? 'border-border' : 'border-border/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                                isOn
                                  ? 'border-border bg-muted text-muted-foreground'
                                  : 'border-border/60 bg-secondary/40 text-muted-foreground'
                              }`}
                            >
                              <Icon className="h-5 w-5" aria-hidden />
                            </div>
                            <Switch
                              checked={isOn}
                              onCheckedChange={() => toggle(connector.id)}
                              aria-label={`${isOn ? 'Disable' : 'Enable'} ${connector.name} connector`}
                            />
                          </div>

                          <h4 className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
                            {connector.name}
                            {isOn && <Power className="h-3 w-3 text-teal-400" aria-label="connected" />}
                            {accountMissing && (
                              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                needs account
                              </span>
                            )}
                          </h4>
                          <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                            {connector.description}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-1">
                            {connector.params.map((p) => (
                              <span
                                key={p.name}
                                className="rounded-md border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                {p.name}
                                {p.required ? '*' : ''}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4 flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => testConnector(connector)}
                              disabled={testing === connector.id}
                              className="h-8 gap-1.5 rounded-lg text-xs"
                            >
                              {testing === connector.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…
                                </>
                              ) : (
                                <>
                                  <FlaskConical className="h-3.5 w-3.5" /> Test
                                </>
                              )}
                            </Button>
                            {result && (
                              <span className={`text-[11px] ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                {result.ok ? '✓ working' : '✗ failed'}
                              </span>
                            )}
                          </div>

                          {result && (
                            <pre className="omni-scroll mt-3 max-h-40 overflow-auto rounded-lg border border-border/60 bg-background/80 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                              {result.text}
                            </pre>
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <section className="mt-10">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-teal-200">
              <Sparkles className="h-4 w-4" aria-hidden /> Free & open, all of it
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Every data connector runs on free, keyless public APIs — Coinbase, Open-Meteo,
              OpenStreetMap, MyMemory, arXiv, Launch Library, dictionary.dev, exchange-rate-api —
              and voices include free Microsoft neural voices. Email connects to your own account
              over IMAP/SMTP with credentials encrypted at rest, so the Agent can do real work on
              your behalf.
            </p>
          </div>
        </section>
      </div>

      {showAddAccount && (
        <AddAccountSheet
          presets={presets}
          onClose={() => setShowAddAccount(false)}
          onAdded={() => {
            setShowAddAccount(false)
            loadAccounts()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Add email account sheet                                             */
/* ------------------------------------------------------------------ */

function AddAccountSheet({
  presets,
  onClose,
  onAdded,
}: {
  presets: EmailPreset[]
  onClose: () => void
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [presetId, setPresetId] = useState(presets[0]?.id ?? 'gmail')
  const preset = presets.find((p) => p.id === presetId) ?? presets[0]
  const [form, setForm] = useState({
    label: '',
    email: '',
    fromName: 'NEXUS AI',
    imapHost: presets[0]?.imapHost ?? '',
    imapPort: String(presets[0]?.imapPort ?? 993),
    smtpHost: presets[0]?.smtpHost ?? '',
    smtpPort: String(presets[0]?.smtpPort ?? 465),
    smtpSecure: presets[0]?.smtpSecure ?? true,
    username: '',
    password: '',
  })
  const [saving, setSaving] = useState(false)

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    setPresetId(id)
    setForm((f) => ({
      ...f,
      imapHost: p.imapHost,
      imapPort: String(p.imapPort),
      smtpHost: p.smtpHost,
      smtpPort: String(p.smtpPort),
      smtpSecure: p.smtpSecure,
    }))
  }

  const submit = async () => {
    if (!form.email || !form.username || !form.password || (!form.imapHost && !form.smtpHost)) {
      toast({ title: 'Please fill in email, username and password.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label || form.email,
          email: form.email,
          fromName: form.fromName,
          imapHost: form.imapHost,
          imapPort: parseInt(form.imapPort) || 993,
          smtpHost: form.smtpHost,
          smtpPort: parseInt(form.smtpPort) || 465,
          smtpSecure: form.smtpSecure,
          username: form.username,
          password: form.password,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add account')

      toast({
        title: data.verification?.ok ? 'Email account connected!' : 'Saved, but verification failed',
        description: data.verification?.message,
        variant: data.verification?.ok ? undefined : 'destructive',
      })
      if (data.verification?.ok) onAdded()
    } catch (error) {
      toast({
        title: 'Could not add account',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center nx-scrim backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Connect email account"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="omni-scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold">
            <Mail className="h-4 w-4 text-primary" aria-hidden /> Connect your email
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Provider
        </label>
        <Select value={presetId} onValueChange={applyPreset}>
          <SelectTrigger className="mt-1.5 w-full rounded-lg bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset && preset.id !== 'custom' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            💡 {preset.hint}
          </p>
        )}
        {preset && (preset.id === 'gmail' || preset.id === 'outlook' || preset.id === 'yahoo' || preset.id === 'icloud') && (
          <details className="group mt-2 rounded-lg border border-border/60 bg-background/40">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-primary transition hover:text-foreground">
              📋 Step-by-step: get your App Password (2 min)
            </summary>
            <ol className="list-decimal space-y-1.5 px-6 pb-3 pt-1 text-xs leading-relaxed text-muted-foreground">
              <li>Go to your account security settings and enable <strong className="text-foreground">2-Step Verification</strong> (required).</li>
              <li>Search for <strong className="text-foreground">“App Passwords”</strong> in account settings.</li>
              <li>Create a new app password named <em>“NEXUS AI”</em>.</li>
              <li>Copy the <strong className="text-foreground">16-character code</strong> (like <code className="rounded bg-secondary px-1">abcd efgh ijkl mnop</code>).</li>
              <li>Paste it as the password here — <strong className="text-amber-700">never your regular account password</strong>.</li>
            </ol>
          </details>
        )}
        <div className="mt-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive">
          ⚠️ <strong>Important:</strong> regular passwords are rejected by Gmail, Outlook, Yahoo &amp; iCloud. You must use an App Password.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Display label">
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="My Gmail"
              className="rounded-lg bg-background/60"
            />
          </Field>
          <Field label="Email address *">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value, username: e.target.value }))}
              placeholder="you@gmail.com"
              className="rounded-lg bg-background/60"
            />
          </Field>
          <Field label="Username (IMAP/SMTP login) *">
            <Input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="you@gmail.com"
              className="rounded-lg bg-background/60"
            />
          </Field>
          <Field label="App password *">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="•••• •••• •••• ••••"
              className="rounded-lg bg-background/60"
            />
          </Field>
          <Field label="From name (for sending)">
            <Input
              value={form.fromName}
              onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
              placeholder="NEXUS AI"
              className="rounded-lg bg-background/60"
            />
          </Field>

          <Field label="IMAP host">
            <Input
              value={form.imapHost}
              onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
              placeholder="imap.gmail.com"
              className="rounded-lg bg-background/60 font-mono text-xs"
            />
          </Field>
          <Field label="IMAP port">
            <Input
              value={form.imapPort}
              onChange={(e) => setForm((f) => ({ ...f, imapPort: e.target.value }))}
              inputMode="numeric"
              className="rounded-lg bg-background/60"
            />
          </Field>
          <Field label="SMTP host">
            <Input
              value={form.smtpHost}
              onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
              placeholder="smtp.gmail.com"
              className="rounded-lg bg-background/60 font-mono text-xs"
            />
          </Field>
          <Field label="SMTP port">
            <Input
              value={form.smtpPort}
              onChange={(e) => setForm((f) => ({ ...f, smtpPort: e.target.value }))}
              inputMode="numeric"
              className="rounded-lg bg-background/60"
            />
          </Field>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={form.smtpSecure}
            onCheckedChange={(v) => setForm((f) => ({ ...f, smtpSecure: v }))}
            aria-label="Use TLS/SSL for SMTP"
          />
          Use TLS/SSL for SMTP (port 465). Turn off for STARTTLS (port 587).
        </label>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          🔒 Your password is encrypted (AES-256-GCM) and stored only in this app&apos;s local
          database. It is used exclusively to connect to your mail server — never sent anywhere
          else.
        </p>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="flex-1 gap-2 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white hover:from-fuchsia-400 hover:to-violet-400 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <MailCheck className="h-4 w-4" /> Connect & verify
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
