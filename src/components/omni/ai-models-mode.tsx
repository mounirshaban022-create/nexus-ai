'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  Power,
  ShieldOff,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  defaultModel: string
  models: string[]
  freeNote: string
  keyUrl: string
}

interface ConnectedProvider {
  id: string
  providerId: string
  label: string
  defaultModel: string
  status: string
  statusMessage: string
}

/** Provider ids that need NO API key — always anonymous. */
const ANONYMOUS_IDS = new Set(['llm7', 'ovhcloud', 'kilocode'])

export function AiModelsMode({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast()
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [providers, setProviders] = useState<ConnectedProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [connectingAnon, setConnectingAnon] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-providers')
      if (res.ok) {
        const data = await res.json()
        setPresets(data.presets ?? [])
        setProviders(data.providers ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(
    async (presetId: string) => {
      if (!apiKey.trim()) {
        toast({ title: 'Paste your API key first.', variant: 'destructive' })
        return
      }
      setSaving(true)
      try {
        const res = await fetch('/api/ai-providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: presetId,
            apiKey: apiKey.trim(),
            defaultModel: model || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save.')
        toast({
          title: data.verification?.ok ? `${data.provider.label} connected!` : 'Saved — but check the key',
          description: data.verification?.message,
          variant: data.verification?.ok ? undefined : 'destructive',
        })
        if (data.verification?.ok) {
          setAdding(null)
          setApiKey('')
          setModel('')
          load()
        }
      } catch (error) {
        toast({
          title: 'Could not save provider',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setSaving(false)
      }
    },
    [apiKey, model, toast, load]
  )

  /** One-click connect for anonymous zero-key providers. */
  const connectAnonymous = useCallback(
    async (presetId: string, label: string) => {
      setConnectingAnon(presetId)
      try {
        const res = await fetch('/api/ai-providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: presetId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to connect.')
        toast({
          title: `${label} connected`,
          description: 'No API key needed — this provider works anonymously and is always available.',
          duration: 5000,
        })
        load()
      } catch (error) {
        toast({
          title: 'Could not connect',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setConnectingAnon(null)
      }
    },
    [toast, load]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai-providers/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setProviders((prev) => prev.filter((p) => p.id !== id))
        toast({ title: 'Provider removed' })
      } catch {
        toast({ title: 'Could not remove provider', variant: 'destructive' })
      }
    },
    [toast]
  )

  const retest = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai-providers/${id}/test`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.provider } : p)))
        toast({
          title: data.verification?.ok ? 'Connected' : 'Connection failed',
          description: data.verification?.message,
          variant: data.verification?.ok ? undefined : 'destructive',
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

  // Split presets into "zero-setup" (anonymous) and "bring-your-own-key".
  const anonPresets = presets.filter((p) => ANONYMOUS_IDS.has(p.id))
  const keyPresets = presets.filter((p) => !ANONYMOUS_IDS.has(p.id))

  // Embedded mode (inside Profile): collapsed by default, no scroll wrapper
  const [expanded, setExpanded] = useState(!embedded)

  if (embedded && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 p-4 text-left transition hover:border-primary/40"
        aria-expanded={false}
        aria-label="Show AI models and providers"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BrainCircuit className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">AI Models &amp; Providers</span>
          <span className="block truncate text-xs text-muted-foreground">
            3 zero-setup engines · {presets.length} free providers — tap to expand
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    )
  }

  return (
    <div className={embedded ? '' : 'omni-scroll h-full overflow-y-auto'}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <BrainCircuit className="h-5 w-5 text-primary" aria-hidden /> AI Models
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            NEXUS now ships 3 zero-setup anonymous LLM gateways (LLM7.io, OVHcloud, Kilo Code)
            that bypass Z.ai rate limits automatically — even with no key and no signup. Plus
            4 new free-key providers (Cohere, Cloudflare, NVIDIA NIM, Ollama Cloud).
          </p>
        </header>

        {/* Connected providers */}
        {providers.length > 0 && (
          <section className="mb-6" aria-label="Connected providers">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active providers
            </h3>
            <div className="space-y-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 p-4"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                      p.status === 'connected'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-destructive/30 bg-destructive/10 text-destructive'
                    }`}
                  >
                    {p.status === 'connected' ? (
                      <Power className="h-5 w-5" aria-hidden />
                    ) : (
                      <X className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.defaultModel} · {p.statusMessage}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => retest(p.id)} className="rounded-lg text-xs">
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove(p.id)}
                      aria-label={`Remove ${p.label}`}
                      className="rounded-lg text-xs hover:border-destructive/40 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PRIMARY ENGINE — Puter (507 models, no keys, unlimited) */}
        <section className="mb-6" aria-label="Primary AI engine">
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Zap className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  PRIMARY ENGINE — 507 models
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Active</span>
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Puter powers every chat FIRST (GPT-5, Claude, DeepSeek, Qwen3.5 + 504 more) —
                  free forever, unlimited, no API keys. Server providers below are automatic
                  fallbacks for tools (documents, code, agents) that need server-side processing.
                </p>
                <button
                  onClick={async () => {
                    const { puterSignIn } = await import('./puter-engine')
                    const ok = await puterSignIn()
                    toast({
                      title: ok ? 'Unlimited AI unlocked! 🎉' : 'Sign-in canceled',
                      description: ok ? '507 models now available as automatic fallback.' : 'Click again when ready.',
                      duration: 6000,
                    })
                  }}
                  className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:brightness-110"
                >
                  Unlock free unlimited AI
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ZERO-SETUP ANONYMOUS PROVIDERS — bypass Z.ai 429 with no key */}
        <section className="mb-6" aria-label="Zero-setup anonymous providers">
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-emerald-700" aria-hidden />
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Zero-setup fallbacks — bypass Z.ai rate limits
              </h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Three OpenAI-compatible LLM gateways verified live from{' '}
              <a
                href="https://github.com/mnfst/awesome-free-llm-apis"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                awesome-free-llm-apis
              </a>
              . No API key, no signup — NEXUS auto-falls through these when Z.ai hits 429.
              Connect one (or all) to also use its models directly as your primary provider.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {anonPresets.length === 0 && (
                <div className="col-span-full text-xs text-muted-foreground">Loading…</div>
              )}
              {anonPresets.map((preset) => {
                const connected = providers.find((p) => p.providerId === preset.id)
                const isConnecting = connectingAnon === preset.id
                return (
                  <div
                    key={preset.id}
                    className={`flex flex-col rounded-xl border bg-card/70 p-3 backdrop-blur ${
                      connected?.status === 'connected' ? 'border-emerald-500/40' : 'border-border/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <PlugZap className="h-4 w-4 text-emerald-600" aria-hidden />
                      {connected?.status === 'connected' && (
                        <Badge
                          className="gap-1 rounded-full border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700"
                          variant="outline"
                        >
                          <Check className="h-3 w-3" aria-hidden /> on
                        </Badge>
                      )}
                    </div>
                    <h5 className="mt-2 text-xs font-semibold">{preset.label}</h5>
                    <p className="mt-1 flex-1 text-[11px] leading-snug text-muted-foreground">
                      {preset.freeNote}
                    </p>
                    <Button
                      size="sm"
                      variant={connected ? 'outline' : 'default'}
                      className="mt-3 h-7 gap-1.5 rounded-lg text-[11px]"
                      disabled={isConnecting}
                      onClick={() => connectAnonymous(preset.id, preset.label)}
                    >
                      {isConnecting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : connected ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <PlugZap className="h-3 w-3" />
                      )}
                      {connected ? 'Connected' : 'One-click connect'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Available providers */}
        <section aria-label="Available providers">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Free providers — bring your own key
          </h3>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="omni-shimmer h-48 rounded-2xl border border-border/60" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {keyPresets.map((preset, i) => {
                const connected = providers.find((p) => p.providerId === preset.id)
                return (
                  <motion.div
                    key={preset.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className={`flex flex-col rounded-2xl border bg-card/70 p-5 backdrop-blur ${
                      connected?.status === 'connected' ? 'border-emerald-500/30' : 'border-border/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                        <Zap className="h-5 w-5" aria-hidden />
                      </div>
                      {connected?.status === 'connected' && (
                        <Badge className="gap-1 rounded-full border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700" variant="outline">
                          <Check className="h-3 w-3" aria-hidden /> connected
                        </Badge>
                      )}
                    </div>

                    <h4 className="mt-3 text-sm font-semibold">{preset.label}</h4>
                    <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {preset.freeNote}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {preset.models.slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="max-w-full truncate rounded-md border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {m.split('/').pop()}
                        </span>
                      ))}
                    </div>

                    {adding === preset.id ? (
                      <div className="mt-4 space-y-2.5 rounded-xl border border-border/60 bg-background/50 p-3">
                        <Input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Paste your API key"
                          aria-label={`${preset.label} API key`}
                          className="rounded-lg bg-background/60"
                        />
                        <select
                          value={model || preset.defaultModel}
                          onChange={(e) => setModel(e.target.value)}
                          aria-label="Default model"
                          className="w-full rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs"
                        >
                          {preset.models.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setAdding(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => save(preset.id)}
                            disabled={saving}
                            className="flex-1 gap-1.5 rounded-lg bg-primary text-primary-foreground hover:brightness-110"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAdding(preset.id)
                            setApiKey('')
                            setModel(preset.defaultModel)
                          }}
                          className="h-8 gap-1.5 rounded-lg text-xs"
                        >
                          <KeyRound className="h-3.5 w-3.5" /> {connected ? 'Update key' : 'Add key'}
                        </Button>
                        <a
                          href={preset.keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          Get free key <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" aria-hidden /> How it works
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The NEXUS smart router tries each layer in order: (1) your Puter browser engine,
              (2) any server provider you connected, (3) the built-in Z.ai engine, and finally
              (4) the three anonymous fallbacks above. If Z.ai returns a 429 (the global rate
              limit you may have hit before), LLM7.io → OVHcloud → Kilo Code take over
              automatically — your chat keeps working with zero setup. All keys are encrypted
              (AES-256-GCM) and stored only on this machine.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
