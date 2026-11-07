'use client'

/**
 * Social Pilot — NEXUS social media automation center.
 *
 * Connect Instagram / LinkedIn / X / Facebook Pages, then the agents
 * do the actual work: they write the copy, generate the visuals,
 * publish on schedule — or fully hands-free with Autopilot (no human
 * in the loop). Publishing uses each platform's REAL API; when the
 * environment can't reach the platform the run is marked `simulated`
 * so users always know what went on-air vs rehearsed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  ExternalLink,
  Instagram,
  Image as ImageIcon,
  Link2,
  Linkedin,
  Loader2,
  PlugZap,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Twitter,
  Users,
  Wand2,
  X,
  Zap,
  Facebook as FacebookIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Platform registry (mirrors src/lib/social.ts)                       */
/* ------------------------------------------------------------------ */

type Platform = 'instagram' | 'linkedin' | 'x' | 'facebook'

interface PlatformField {
  key: string
  label: string
  hint: string
}

const PLATFORMS: Record<Platform, { label: string; color: string; icon: typeof Instagram; fields: PlatformField[]; docs: string }> = {
  instagram: {
    label: 'Instagram',
    color: '#e1306c',
    icon: Instagram,
    fields: [
      { key: 'accessToken', label: 'Access Token', hint: 'Meta app token with instagram_content_publish' },
      { key: 'externalId', label: 'Business Account ID', hint: 'The ig-user-id from Meta App Dashboard' },
    ],
    docs: 'developers.facebook.com/docs/instagram-api',
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0a66c2',
    icon: Linkedin,
    fields: [
      { key: 'accessToken', label: 'Access Token', hint: 'OAuth token with w_member_social scope' },
      { key: 'authorUrn', label: 'Author URN (optional)', hint: 'Empty = post as you · urn:li:organization:ID for a page' },
    ],
    docs: 'learn.microsoft.com/en-us/linkedin/marketing/',
  },
  x: {
    label: 'X (Twitter)',
    color: '#e7e9ea',
    icon: Twitter,
    fields: [{ key: 'accessToken', label: 'Access Token', hint: 'OAuth 2.0 user token with tweet.write' }],
    docs: 'developer.x.com/en/docs/x-api',
  },
  facebook: {
    label: 'Facebook Page',
    color: '#1877f2',
    icon: FacebookIcon,
    fields: [
      { key: 'accessToken', label: 'Page Access Token', hint: 'Token with pages_manage_posts' },
      { key: 'externalId', label: 'Page ID', hint: 'Numeric page id from /me/accounts' },
    ],
    docs: 'developers.facebook.com/docs/pages-api',
  },
}

const PLATFORM_ORDER: Platform[] = ['instagram', 'linkedin', 'x', 'facebook']

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Account {
  id: string
  platform: Platform
  platformLabel: string
  displayName: string
  handle: string
  autopilot: boolean
  autopilotTopic: string
  autopilotCadenceMinutes: number
  lastAutoPostAt: string | null
  status: string
  statusMessage: string
  tokenPreview: string
}

interface Post {
  id: string
  accountId: string
  platform: string
  caption: string
  mediaUrls: string[]
  mediaKind: string
  status: string // queued | scheduled | published | simulated | failed
  scheduledFor: string | null
  publishedAt: string | null
  result: string
  origin: string
  error: string
  createdAt: string
}

interface ActivityRow {
  id: string
  kind: string
  message: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Status chip                                                         */
/* ------------------------------------------------------------------ */

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    published: { cls: 'text-emerald-400 border-emerald-400/40', label: 'Published ✓' },
    simulated: { cls: 'text-sky-400 border-sky-400/40', label: 'Rehearsed' },
    scheduled: { cls: 'text-amber-400 border-amber-400/40', label: 'Scheduled' },
    publishing: { cls: 'text-violet-400 border-violet-400/40', label: 'Publishing…' },
    failed: { cls: 'text-red-400 border-red-400/40', label: 'Failed' },
    connected: { cls: 'text-emerald-400 border-emerald-400/40', label: 'Connected' },
    pending: { cls: 'text-amber-400 border-amber-400/40', label: 'Rehearsal' },
    error: { cls: 'text-red-400 border-red-400/40', label: 'Error' },
  }
  const m = map[status] ?? { cls: 'text-muted-foreground border-border', label: status }
  return (
    <Badge variant="outline" className={cn('gap-1.5 text-[11px]', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </Badge>
  )
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const p = PLATFORMS[platform as Platform]
  const Icon = p?.icon ?? Link2
  return <Icon className={className} style={{ color: p?.color }} aria-hidden />
}

/* ------------------------------------------------------------------ */
/* Connect dialog                                                      */
/* ------------------------------------------------------------------ */

function ConnectDialog({
  platform,
  open,
  onOpenChange,
  onConnected,
}: {
  platform: Platform | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onConnected: () => void
}) {
  const { toast } = useToast()
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (open) {
      setCreds({})
      setName('')
      setAdvanced(false)
    }
  }, [open, platform])

  const meta = platform ? PLATFORMS[platform] : null

  const submit = useCallback(
    async (rehearsal = false) => {
      if (!platform || !meta) return
      setBusy(true)
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, displayName: name, credentials: creds, rehearsal }),
        })
        const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
        if (!res.ok || !data.account) throw new Error(data.error || 'Connection failed')
        toast({
          title: rehearsal ? `${meta.label} connected ✓` : `${meta.label} connected ✓`,
          description: rehearsal
            ? 'You are in! The agent is ready — flip Autopilot on, or hit “Run autopilot now”. Posts are marked Rehearsed until you add real credentials.'
            : data.account.status === 'connected'
              ? 'Verified with the live API — posts go on-air for real.'
              : 'Saved — publishing will run in rehearsal until the platform is reachable.',
        })
        onOpenChange(false)
        onConnected()
      } catch (err) {
        toast({ title: 'Could not connect', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
      } finally {
        setBusy(false)
      }
    },
    [platform, meta, creds, name, toast, onOpenChange, onConnected],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {platform && <PlatformIcon platform={platform} className="h-5 w-5" />}
            Connect {meta?.label}
          </DialogTitle>
          <DialogDescription>
            One click and the agent takes over — no passwords, no tokens. You can go live with real credentials anytime later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* THE easy path — zero fields, works for everyone */}
          <Button onClick={() => void submit(true)} disabled={busy || !platform} className="h-12 w-full text-sm font-semibold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
            {busy ? 'Connecting…' : `Quick connect ${meta?.label ?? ''} — one click`}
          </Button>
          <p className="-mt-1.5 text-center text-[11px] leading-snug text-muted-foreground">
            The full pipeline starts immediately: the agent writes the caption, designs the visual and publishes. Posts are marked{' '}
            <span className="text-sky-400">Rehearsed</span> until real credentials are added.
          </p>

          {/* Advanced — go live with real credentials */}
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="mx-auto flex min-h-[32px] items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', advanced && 'rotate-180')} aria-hidden />
            Go live with your own credentials (advanced)
          </button>
          {advanced && meta && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Display name (optional)</Label>
                <Input id="acc-name" placeholder="My brand" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {meta.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`f-${f.key}`}
                    type="password"
                    placeholder={f.hint}
                    value={creds[f.key] ?? ''}
                    onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {f.hint} · <span className="text-muted-foreground/70">Docs: {meta.docs}</span>
                  </p>
                </div>
              ))}
              <Button onClick={() => void submit(false)} disabled={busy} className="w-full min-h-[44px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
                {busy ? 'Verifying with the platform…' : 'Verify & go live'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Autopilot settings dialog                                           */
/* ------------------------------------------------------------------ */

function AutopilotDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: Account | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [cadence, setCadence] = useState(1440)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (account && open) {
      setTopic(account.autopilotTopic || '')
      setCadence(account.autopilotCadenceMinutes || 1440)
    }
  }, [account, open])

  const save = useCallback(
    async (enable: boolean) => {
      if (!account) return
      setBusy(true)
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: account.id,
            autopilot: enable,
            autopilotTopic: topic,
            autopilotCadenceMinutes: cadence,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
        if (!res.ok || !data.account) throw new Error(data.error || 'Save failed')
        toast({
          title: enable ? 'Autopilot ON — the agent takes it from here 🤖' : 'Autopilot off',
          description: enable
            ? `A fresh AI-written post with a generated visual every ${cadence >= 1440 ? `${Math.round(cadence / 1440)} day(s)` : `${Math.round(cadence / 60)} hour(s)`}.`
            : undefined,
        })
        onOpenChange(false)
        onSaved()
      } catch (err) {
        toast({ title: 'Could not update autopilot', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      } finally {
        setBusy(false)
      }
    },
    [account, topic, cadence, toast, onOpenChange, onSaved],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-amber-400" aria-hidden />
            Autopilot — {account?.platformLabel}
          </DialogTitle>
          <DialogDescription>
            One switch: the agent picks the moment, writes the post, generates the visual and publishes — even while the app is closed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ap-topic">
              What should it post about? <span className="font-normal text-muted-foreground">(optional — the agent decides if empty)</span>
            </Label>
            <Textarea
              id="ap-topic"
              rows={3}
              placeholder="e.g. Daily tips for home bakers, behind-the-scenes of our coffee roastery, new drops and customer stories…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-cadence">Cadence — post every…</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { m: 60, l: '1 hour' },
                { m: 180, l: '3 hours' },
                { m: 720, l: '12 hours' },
                { m: 1440, l: 'Daily' },
                { m: 4320, l: '3 days' },
              ].map((o) => (
                <button
                  key={o.m}
                  type="button"
                  onClick={() => setCadence(o.m)}
                  className={cn(
                    'min-h-[36px] rounded-full border px-3.5 text-xs font-medium transition',
                    cadence === o.m
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <input id="ap-cadence" type="number" min={15} max={20160} value={cadence} onChange={(e) => setCadence(Number(e.target.value) || 720)} className="sr-only" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save(true)} disabled={busy} className="min-h-[44px] flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
              Enable autopilot
            </Button>
            {account?.autopilot && (
              <Button variant="outline" onClick={() => save(false)} disabled={busy} className="min-h-[44px]">
                Turn off
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Main mode                                                           */
/* ------------------------------------------------------------------ */

export function SocialMode() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [connectPlatform, setConnectPlatform] = useState<Platform | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [quickBusy, setQuickBusy] = useState<Platform | null>(null)
  const [autopilotFor, setAutopilotFor] = useState<Account | null>(null)
  const [autopilotOpen, setAutopilotOpen] = useState(false)
  const [autopilotBusy, setAutopilotBusy] = useState(false)

  // Composer state
  const [tab, setTab] = useState('accounts')
  const [composeAccountId, setComposeAccountId] = useState('')
  const [caption, setCaption] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'text'>('image')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [genTopic, setGenTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const composerRef = useRef<HTMLDivElement | null>(null)

  const connected = useMemo(() => accounts.filter((a) => a.status !== 'error'), [accounts])
  const autopilotOn = useMemo(() => accounts.filter((a) => a.autopilot), [accounts])

  const load = useCallback(
    async (withHeartbeat = false) => {
      try {
        const res = await fetch(`/api/social/posts${withHeartbeat ? '' : '?heartbeat=0'}`)
        if (res.status === 401) {
          setLoading(false)
          return
        }
        const data = (await res.json().catch(() => ({}))) as {
          posts?: Post[]
          activity?: ActivityRow[]
          accounts?: Account[]
          autopilot?: { processed: number; results: { account: string; ok: boolean; message: string }[] } | null
        }
        setPosts(data.posts ?? [])
        setActivity(data.activity ?? [])
        if (data.autopilot && data.autopilot.processed > 0) {
          const okCount = data.autopilot.results.filter((r) => r.ok).length
          toast({ title: `🤖 Autopilot fired — ${okCount}/${data.autopilot.processed} post(s) went out` })
        }
        // accounts come from their own endpoint
        const accRes = await fetch('/api/social/accounts')
        if (accRes.ok) {
          const accData = (await accRes.json().catch(() => ({}))) as { accounts?: Account[] }
          setAccounts(accData.accounts ?? [])
          setComposeAccountId((cur) => cur || accData.accounts?.[0]?.id || '')
        }
      } catch {
        /* non-fatal */
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void load(true)
  }, [])

  // Keep the automation alive while the screen is open (60s heartbeat).
  useEffect(() => {
    const t = setInterval(() => void load(true), 60_000)
    return () => clearInterval(t)
  }, [load])

  const runAutopilot = useCallback(async () => {
    setAutopilotBusy(true)
    try {
      const res = await fetch('/api/social/autopilot', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { processed?: number; results?: { ok: boolean; message: string }[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Autopilot failed')
      const okCount = (data.results ?? []).filter((r) => r.ok).length
      toast({
        title: data.processed ? `🤖 ${okCount}/${data.processed} autopilot post(s) done` : 'No accounts are due yet',
        description: data.processed ? (data.results ?? []).map((r) => r.message).join(' · ') : 'Everything is on schedule.',
      })
      void load(false)
    } catch (err) {
      toast({ title: 'Autopilot run failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setAutopilotBusy(false)
    }
  }, [toast, load])

  const toggleAutopilot = useCallback(
    async (account: Account) => {
      if (!account.autopilot) {
        setAutopilotFor(account)
        setAutopilotOpen(true)
        return
      }
      // Turning OFF is instant (no config needed).
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: account.id, autopilot: false }),
        })
        if (!res.ok) throw new Error('Could not turn autopilot off')
        toast({ title: 'Autopilot off' })
        void load(false)
      } catch (err) {
        toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      }
    },
    [toast, load],
  )

  const disconnect = useCallback(
    async (account: Account) => {
      try {
        const res = await fetch(`/api/social/accounts?id=${account.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Could not disconnect')
        toast({ title: `${account.platformLabel} disconnected` })
        void load(false)
      } catch (err) {
        toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      }
    },
    [toast, load],
  )

  /* ---------------- Composer actions ---------------- */

  const generateDraft = useCallback(async () => {
    const account = accounts.find((a) => a.id === composeAccountId)
    if (!account) {
      toast({ title: 'Pick an account first', variant: 'destructive' })
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: account.platform,
          topic: genTopic || account.autopilotTopic || `something valuable for ${account.displayName || 'the audience'}`,
          withImage: mediaKind === 'image',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { caption?: string; imageUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      if (data.caption) setCaption(data.caption)
      if (data.imageUrl) {
        setMediaUrls((m) => (m.includes(data.imageUrl!) ? m : [...m, data.imageUrl!]))
        setMediaKind('image')
      }
      toast({ title: 'Draft ready ✨', description: 'Caption written' + (data.imageUrl ? ' and visual generated.' : '.') })
    } catch (err) {
      toast({ title: 'Generation failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }, [accounts, composeAccountId, genTopic, mediaKind, toast])

  const publish = useCallback(
    async (mode: 'now' | 'schedule') => {
      const account = accounts.find((a) => a.id === composeAccountId)
      if (!account) {
        toast({ title: 'Pick an account first', variant: 'destructive' })
        return
      }
      if (!caption.trim()) {
        toast({ title: 'Write a caption (or generate one)', variant: 'destructive' })
        return
      }
      if (mode === 'schedule' && !scheduleAt) {
        toast({ title: 'Pick a date & time to schedule', variant: 'destructive' })
        return
      }
      setPublishing(true)
      try {
        const res = await fetch('/api/social/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            caption,
            mediaUrls,
            mediaKind: mediaUrls.length > 1 ? 'carousel' : mediaKind,
            scheduledFor: mode === 'schedule' ? new Date(scheduleAt).toISOString() : 'now',
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          post?: Post
          result?: { ok: boolean; mode: string; message: string; permalink: string }
          error?: string
        }
        if (!res.ok || !data.result?.ok) throw new Error(data.error || data.result?.message || 'Publish failed')
        const live = data.result.mode === 'live'
        toast({
          title: mode === 'schedule' ? 'Scheduled ✓' : live ? 'LIVE — published for real 🚀' : 'Rehearsal complete ✓',
          description:
            mode === 'schedule'
              ? `The agent will post it on ${new Date(scheduleAt).toLocaleString()}.`
              : data.result.message,
        })
        setCaption('')
        setMediaUrls([])
        setScheduleAt('')
        void load(false)
      } catch (err) {
        toast({ title: 'Could not publish', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      } finally {
        setPublishing(false)
      }
    },
    [accounts, composeAccountId, caption, mediaUrls, mediaKind, scheduleAt, toast, load],
  )

  const cancelPost = useCallback(
    async (post: Post) => {
      try {
        const res = await fetch(`/api/social/posts/${post.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Could not cancel')
        toast({ title: 'Post cancelled' })
        void load(false)
      } catch (err) {
        toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      }
    },
    [toast, load],
  )

  const openCompose = useCallback(() => {
    setTab('composer')
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [])

  /** Zero-friction connect: one click, no fields, no dialog. */
  const quickConnect = useCallback(
    async (platform: Platform) => {
      setQuickBusy(platform)
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, credentials: {}, rehearsal: true }),
        })
        const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
        if (!res.ok || !data.account) throw new Error(data.error || 'Connection failed')
        toast({
          title: `${PLATFORMS[platform].label} connected ✓`,
          description: 'Now flip the Autopilot switch — or press “Run autopilot now” to see the agent post instantly.',
        })
        await load(false)
      } catch (err) {
        toast({ title: 'Could not connect', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
      } finally {
        setQuickBusy(null)
      }
    },
    [toast, load],
  )

  /* ---------------- Render ---------------- */

  return (
    <div className="nx-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Radio className="h-5 w-5 text-amber-400" aria-hidden />
              Social Pilot
              {autopilotOn.length > 0 && (
                <Badge className="gap-1 bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                  </span>
                  {autopilotOn.length} on autopilot
                </Badge>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Connect once — the agents write, design and publish on their own.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="min-h-[38px]" onClick={() => void load(false)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </Button>
            <Button size="sm" className="min-h-[38px]" onClick={runAutopilot} disabled={autopilotBusy}>
              {autopilotBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Zap className="h-3.5 w-3.5" aria-hidden />}
              Run autopilot now
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="accounts" className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Accounts
              {connected.length > 0 && <span className="rounded-full bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300">{connected.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="composer" className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> Composer
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Queue
              {posts.length > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px]">{posts.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" aria-hidden /> Activity
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Accounts ---------------- */}
          <TabsContent value="accounts" className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your connections…
              </div>
            ) : (
              <>
                {/* First-run welcome — three steps, zero jargon */}
                {accounts.length === 0 && (
                  <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/10 to-transparent p-5 sm:p-6">
                    <p className="text-sm font-semibold">Your agents can run your social media — hands-free.</p>
                    <ol className="mt-3 space-y-2 text-[13px] text-foreground/80">
                      {[
                        'Connect an account — one click, no passwords or tokens needed',
                        'Tell the agent what to post about (one sentence)',
                        'Flip the Autopilot switch — it writes, designs and publishes on its own',
                      ].map((s, i) => (
                        <li key={s} className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-amber-400/40 bg-amber-400/10 text-[10px] font-bold text-amber-300">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={() => void quickConnect('instagram')} disabled={quickBusy !== null} className="min-h-[44px] flex-1 sm:flex-none">
                        {quickBusy === 'instagram' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Instagram className="h-4 w-4" aria-hidden />}
                        {quickBusy === 'instagram' ? 'Connecting…' : 'Connect Instagram — 1 click'}
                      </Button>
                      <Button variant="outline" onClick={() => void quickConnect('linkedin')} disabled={quickBusy !== null} className="min-h-[44px] flex-1 sm:flex-none">
                        {quickBusy === 'linkedin' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Linkedin className="h-4 w-4" aria-hidden />}
                        {quickBusy === 'linkedin' ? 'Connecting…' : 'Connect LinkedIn — 1 click'}
                      </Button>
                    </div>
                    <p className="mt-2.5 text-[11px] text-muted-foreground">
                      Starts in rehearsal mode — the whole agent pipeline runs and posts are marked <span className="text-sky-400">Rehearsed</span>. Add real credentials anytime to go on-air.
                    </p>
                  </div>
                )}

                {accounts.length > 0 && (
                  <div className="space-y-3">
                    {accounts.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-background/60">
                              <PlatformIcon platform={a.platform} className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold">
                                {a.displayName}
                                <StatusChip status={a.status} />
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {a.handle || a.platformLabel}
                                {a.autopilot && (
                                  <span className="text-amber-400">
                                    {' '}
                                    · autopilot every {a.autopilotCadenceMinutes >= 1440 ? `${Math.round(a.autopilotCadenceMinutes / 1440)}d` : `${Math.round(a.autopilotCadenceMinutes / 60)}h`}
                                  </span>
                                )}
                                {a.lastAutoPostAt && a.autopilot && (
                                  <span> · last: {new Date(a.lastAutoPostAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                              <Switch checked={a.autopilot} onCheckedChange={() => void toggleAutopilot(a)} aria-label={`Autopilot for ${a.displayName}`} />
                              <span className={a.autopilot ? 'text-amber-300' : ''}>Autopilot</span>
                            </label>
                            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={openCompose}>
                              <Send className="h-3.5 w-3.5" aria-hidden /> Post
                            </Button>
                            <Button variant="ghost" size="sm" className="min-h-[36px] text-red-400 hover:text-red-300" onClick={() => void disconnect(a)}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Disconnect {a.displayName}</span>
                            </Button>
                          </div>
                        </div>
                        {a.autopilotTopic && (
                          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200/80">
                            🤖 Posts about: {a.autopilotTopic}
                          </p>
                        )}
                        {a.statusMessage && (
                          <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{a.statusMessage}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Connect cards */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {PLATFORM_ORDER.map((p) => {
                    const meta = PLATFORMS[p]
                    const Icon = meta.icon
                    const count = accounts.filter((a) => a.platform === p).length
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setConnectPlatform(p)
                          setConnectOpen(true)
                        }}
                        className="group flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-dashed border-border/80 bg-card/40 p-4 text-left transition hover:border-foreground/30 hover:bg-card/70"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/60 transition group-hover:scale-105" style={{ color: meta.color }}>
                          <Icon className="h-4.5 w-4.5" aria-hidden />
                        </span>
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <span className="text-[10px] text-muted-foreground">{count ? `${count} connected` : 'Connect account'}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* ---------------- Composer ---------------- */}
          <TabsContent value="composer">
            <div ref={composerRef} className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
              {connected.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
                  <p className="mt-3 text-sm font-medium">Connect an account first</p>
                  <p className="mt-1 text-xs text-muted-foreground">The composer unlocks the moment one platform is linked.</p>
                  <Button size="sm" className="mt-4 min-h-[40px]" onClick={() => setTab('accounts')}>
                    Go to accounts
                  </Button>
                </div>
              ) : (
                <>
                  {/* Account picker */}
                  <div className="flex flex-wrap gap-2">
                    {connected.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setComposeAccountId(a.id)}
                        className={cn(
                          'flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition',
                          composeAccountId === a.id
                            ? 'border-foreground/40 bg-accent/60 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <PlatformIcon platform={a.platform} className="h-3.5 w-3.5" />
                        {a.displayName}
                      </button>
                    ))}
                  </div>

                  {/* AI generation */}
                  <div className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="Tell the agent what to post about… (e.g. 'new espresso blend launch')"
                        value={genTopic}
                        onChange={(e) => setGenTopic(e.target.value)}
                        className="min-h-[40px] flex-1 border-0 bg-transparent focus-visible:ring-0"
                      />
                      <Button onClick={() => void generateDraft()} disabled={generating} className="min-h-[40px]">
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                        {generating ? 'Creating…' : 'Generate with AI'}
                      </Button>
                    </div>
                    <p className="mt-1 px-1 text-[10px] text-muted-foreground">Writes the caption in your platform&apos;s voice and generates a matching visual.</p>
                  </div>

                  {/* Caption */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cap">Caption</Label>
                      <span className="text-[10px] text-muted-foreground">{caption.length} chars</span>
                    </div>
                    <Textarea id="cap" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write it yourself, or let the agent draft it above…" />
                  </div>

                  {/* Media */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Media</Label>
                      <div className="flex gap-1.5">
                        {(['image', 'video', 'text'] as const).map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setMediaKind(k)}
                            className={cn(
                              'min-h-[30px] rounded-full border px-3 text-[11px] font-medium capitalize transition',
                              mediaKind === k ? 'border-foreground/40 bg-accent/60' : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                    {mediaKind !== 'text' && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Paste a public media URL (photo/video) — or generate one with AI above"
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          className="min-h-[40px] flex-1 text-xs"
                        />
                        <Button
                          variant="outline"
                          className="min-h-[40px]"
                          onClick={() => {
                            const u = imageUrlInput.trim()
                            if (u && !mediaUrls.includes(u)) setMediaUrls((m) => [...m, u])
                            setImageUrlInput('')
                          }}
                        >
                          <ImageIcon className="h-4 w-4" aria-hidden /> Add
                        </Button>
                      </div>
                    )}
                    {mediaUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {mediaUrls.map((u) => (
                          <span key={u} className="flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/60 py-1 pl-3 pr-1.5 text-[11px] text-muted-foreground">
                            <span className="max-w-[220px] truncate font-mono">{u.split('/').pop()}</span>
                            <button type="button" onClick={() => setMediaUrls((m) => m.filter((x) => x !== u))} aria-label="Remove media" className="grid h-5 w-5 place-items-center rounded-full hover:bg-accent/60">
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Schedule + publish */}
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="sched" className="flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3 w-3" aria-hidden /> Schedule for later (optional)
                      </Label>
                      <Input id="sched" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="min-h-[40px] text-xs" />
                    </div>
                    <div className="flex gap-2">
                      {scheduleAt ? (
                        <Button onClick={() => void publish('schedule')} disabled={publishing} className="min-h-[44px] flex-1">
                          {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Calendar className="h-4 w-4" aria-hidden />}
                          Schedule
                        </Button>
                      ) : (
                        <Button onClick={() => void publish('now')} disabled={publishing} className="min-h-[44px] flex-1">
                          {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                          Publish now
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ---------------- Queue ---------------- */}
          <TabsContent value="queue" className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center">
                <CircleDashed className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden />
                <p className="mt-3 text-sm text-muted-foreground">Nothing here yet — compose a post or switch on autopilot.</p>
              </div>
            ) : (
              posts.map((p) => (
                <div key={p.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={p.platform} className="h-4 w-4" />
                      <span className="text-xs font-semibold">{p.platform}</span>
                      {p.origin === 'autopilot' && <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-300">🤖 autopilot</Badge>}
                      {p.origin === 'agent' && <Badge variant="outline" className="border-violet-400/40 text-[10px] text-violet-300">✦ agent</Badge>}
                      <StatusChip status={p.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleString() : p.scheduledFor ? `→ ${new Date(p.scheduledFor).toLocaleString()}` : new Date(p.createdAt).toLocaleString()}
                      </span>
                      {(p.status === 'queued' || p.status === 'scheduled') && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-red-300" onClick={() => void cancelPost(p)}>
                          <X className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Cancel post</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{p.caption}</p>
                  {p.mediaUrls?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.mediaUrls.map((u) => (
                        <span key={u} className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {p.mediaKind === 'video' ? '🎬' : '🖼'} {u.split('/').pop()?.slice(0, 28)}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.result && (
                    <p className={cn('mt-2 text-[11px]', p.status === 'failed' ? 'text-red-400' : p.status === 'published' ? 'text-emerald-400' : 'text-sky-400')}>
                      {p.status === 'published' && <CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden />}
                      {p.result}
                    </p>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          {/* ---------------- Activity ---------------- */}
          <TabsContent value="activity">
            <div className="rounded-2xl border border-border/70 bg-card/60 p-2 sm:p-3">
              {activity.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="space-y-1">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-accent/30">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border/60 bg-background/60 text-[11px]">
                        {a.kind === 'publish' ? '🚀' : a.kind === 'autopilot' || a.kind === 'autopilot_on' ? '🤖' : a.kind === 'fail' ? '⚠️' : a.kind === 'connected' ? '🔗' : a.kind === 'generate' ? '✨' : '•'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug text-foreground/85">{a.message}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Live/simulated explainer */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground/80">How publishing works</p>
          With live credentials and a public media URL, posts go out through the platform&apos;s real API (Instagram Graph, LinkedIn UGC, X v2, Facebook Pages) — marked <span className="text-emerald-400">Published</span> with a link.
          When the platform isn&apos;t reachable from this environment, the full agent flow still runs and the run is marked <span className="text-sky-400">Rehearsed</span> so you can test the entire pipeline risk-free.
          The automation clock runs on the server — autopilot and scheduled posts go out on time even when the app is closed.
        </div>
      </div>

      <ConnectDialog
        platform={connectPlatform}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={() => void load(false)}
      />
      <AutopilotDialog account={autopilotFor} open={autopilotOpen} onOpenChange={setAutopilotOpen} onSaved={() => void load(false)} />
    </div>
  )
}
