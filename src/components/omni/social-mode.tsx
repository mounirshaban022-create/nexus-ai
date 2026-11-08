'use client'

/**
 * Social Autopilot — connect once, the agents do the actual work.
 *
 * Design contract (learned from the owner, a non-technical user):
 *  1. ZERO-KNOWLEDGE CONNECT: the main path is one tap. No passwords,
 *     no tokens, no developer consoles — the agent starts in rehearsal
 *     mode and everything works end-to-end.
 *  2. GOING LIVE IS ONE TAP TOO: "Continue with {platform}" opens the
 *     platform's own sign-in window — the user signs in, approves, done.
 *     Nothing to copy, nothing to paste. If the deployment hasn't been
 *     switched on for that platform yet, a calm human note says so.
 *  3. CALM SCREEN: one Autopilot card, one row of account chips, three
 *     tabs (Queue / Inbox / Activity). No jargon on the default path.
 *
 * The pipeline behind the calm surface: Trend Radar (research what
 * attracts people right now) → Page Brain (understands THIS page) →
 * Creator (writes + shoots the visual) → Publisher (schedule or on-air)
 * → Community Manager (replies to people like a savvy human).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Activity as ActivityIcon,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Facebook as FacebookIcon,
  Image as ImageIcon,
  Inbox,
  Instagram,
  Linkedin,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Twitter,
  Wand2,
  Zap,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Platform registry                                                   */
/* ------------------------------------------------------------------ */

type Platform = 'instagram' | 'linkedin' | 'x' | 'facebook'

const PLATFORMS: Record<
  Platform,
  { label: string; blurb: string; color: string; tile: string; icon: typeof Instagram }
> = {
  instagram: {
    label: 'Instagram',
    blurb: 'Photos, Reels & Stories',
    color: '#e1306c',
    tile: 'bg-gradient-to-br from-fuchsia-500/20 to-amber-500/20',
    icon: Instagram,
  },
  linkedin: {
    label: 'LinkedIn',
    blurb: 'Professional posts & articles',
    color: '#0a66c2',
    tile: 'bg-sky-500/15',
    icon: Linkedin,
  },
  x: {
    label: 'X (Twitter)',
    blurb: 'Short, fast texts',
    color: '#e7e9ea',
    tile: 'bg-zinc-500/15',
    icon: Twitter,
  },
  facebook: {
    label: 'Facebook',
    blurb: 'Your Page’s posts',
    color: '#1877f2',
    tile: 'bg-blue-500/15',
    icon: FacebookIcon,
  },
}

const PLATFORM_ORDER: Platform[] = ['instagram', 'linkedin', 'x', 'facebook']

const CADENCE_OPTIONS = [
  { label: '2× a day', mins: 720 },
  { label: 'Every day', mins: 1440 },
  { label: '3× a week', mins: 3360 },
  { label: 'Weekly', mins: 10080 },
]

/* ------------------------------------------------------------------ */
/* View models                                                         */
/* ------------------------------------------------------------------ */

interface PageStrategy {
  voice: string
  pillars: string[]
  hooks: string[]
  dos: string[]
  donts: string[]
  hashtags: string[]
}

interface TrendBrain {
  summary: string
  topics: string[]
  hooks: string[]
  formats: string[]
  hashtags: string[]
  sources: { title: string; url: string }[]
  fetchedAt: string
  researched: boolean
}

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
  pageNiche: string
  pageAudience: string
  pageTone: string
  pageGoal: string
  pageLanguage: string
  strategy: PageStrategy | null
  trends: TrendBrain | null
  autoReply: boolean
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
  status: string
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

interface CommentRow {
  id: string
  accountId: string
  platform: string
  author: string
  text: string
  sentiment: string
  aiReply: string
  status: string
  createdAt: string
  repliedAt: string | null
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function relTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function PlatformGlyph({ platform, className }: { platform: string; className?: string }) {
  const p = PLATFORMS[platform as Platform]
  const Icon = p?.icon ?? Link2
  return <Icon className={className} style={{ color: p?.color }} aria-hidden />
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    connected: { cls: 'text-emerald-400 border-emerald-400/30', label: 'Live' },
    pending: { cls: 'text-amber-400 border-amber-400/30', label: 'Rehearsal' },
    error: { cls: 'text-red-400 border-red-400/30', label: 'Check' },
  }
  const m = map[status] ?? { cls: 'text-muted-foreground border-border', label: status }
  return (
    <Badge variant="outline" className={cn('gap-1.5 text-[11px]', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </Badge>
  )
}

function PostStatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    published: { cls: 'text-emerald-400 border-emerald-400/30', label: 'Published' },
    simulated: { cls: 'text-sky-400 border-sky-400/30', label: 'Rehearsed' },
    scheduled: { cls: 'text-amber-400 border-amber-400/30', label: 'Scheduled' },
    publishing: { cls: 'text-violet-400 border-violet-400/30', label: 'Publishing…' },
    queued: { cls: 'text-muted-foreground border-border', label: 'Queued' },
    failed: { cls: 'text-red-400 border-red-400/30', label: 'Failed' },
  }
  const m = map[status] ?? { cls: 'text-muted-foreground border-border', label: status }
  return (
    <Badge variant="outline" className={cn('gap-1.5 text-[11px]', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </Badge>
  )
}

const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
const CARD = 'rounded-2xl border border-border/60 bg-card/60'

/* ------------------------------------------------------------------ */
/* Connect dialog — the zero-knowledge path                            */
/* ------------------------------------------------------------------ */

/* The one human step no platform lets anyone else do: creating the app
   under the owner's identity. The wizard makes it feel like a settings
   screen — open, copy, paste, switch on — ONCE. After that it is just
   "sign in", exactly like every app the user knows. */
const WIZARD: Record<
  Platform,
  { portal: string; steps: string[]; pasteWhere: string; idLabel: string; secretLabel: string }
> = {
  linkedin: {
    portal: 'https://www.linkedin.com/developers/apps',
    steps: [
      'Tap "Open LinkedIn for developers" below → sign in → Create app',
      'Name: anything · Privacy URL: your site address · Logo: any image → Create app',
      'Open the verification email LinkedIn sends → tap Verify',
      'Products tab → add "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" — both approve instantly',
    ],
    pasteWhere: 'Auth tab → Redirect URLs → paste this link',
    idLabel: 'Client ID (Auth tab)',
    secretLabel: 'Client Secret (Auth tab → the eye icon)',
  },
  x: {
    portal: 'https://developer.x.com/en/portal/dashboard',
    steps: [
      'Tap "Open the X portal" below → sign in → create a project + app (the free tier works)',
      'App settings → User authentication settings → Set up → enable OAuth 2.0',
      'Callback URI: paste the link below · Website: your site address',
      'Keys and tokens → copy the Client ID and Secret',
    ],
    pasteWhere: 'User authentication settings → Callback URI → paste this link',
    idLabel: 'OAuth 2.0 Client ID',
    secretLabel: 'OAuth 2.0 Client Secret',
  },
  instagram: {
    portal: 'https://developers.facebook.com/apps',
    steps: [
      'Tap "Open Meta for developers" below → Create app → type: Business',
      'Add the "Facebook Login" product → Settings → paste the link below in Valid OAuth Redirect URIs',
      'Settings → Basic → copy the App ID and App Secret',
    ],
    pasteWhere: 'Facebook Login → Settings → Valid OAuth Redirect URIs → paste this link',
    idLabel: 'App ID (Settings → Basic)',
    secretLabel: 'App Secret (Settings → Basic)',
  },
  facebook: {
    portal: 'https://developers.facebook.com/apps',
    steps: [
      'Tap "Open Meta for developers" below → Create app → type: Business',
      'Add the "Facebook Login" product → Settings → paste the link below in Valid OAuth Redirect URIs',
      'Settings → Basic → copy the App ID and App Secret',
    ],
    pasteWhere: 'Facebook Login → Settings → Valid OAuth Redirect URIs → paste this link',
    idLabel: 'App ID (Settings → Basic)',
    secretLabel: 'App Secret (Settings → Basic)',
  },
}

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
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  // ---- One-time switch-on wizard (runs when a platform isn't live yet) ----
  const [wizard, setWizard] = useState(false)
  const [redirectUri, setRedirectUri] = useState('')
  const [copied, setCopied] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setHint('')
  }, [open, platform])

  // Ask the server once: is this platform's official connection on? If not,
  // show the guided switch-on right inside this dialog.
  useEffect(() => {
    if (!open || !platform) return
    setWizard(false)
    setCopied(false)
    setClientId('')
    setClientSecret('')
    let alive = true
    fetch(`/api/social/credentials?platform=${platform}`)
      .then((r) => r.json())
      .then((d: { configured?: boolean; redirectUri?: string }) => {
        if (!alive) return
        if (d.redirectUri) setRedirectUri(d.redirectUri)
        if (d.configured === false) setWizard(true)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, platform])

  const meta = platform ? PLATFORMS[platform] : null

  const connect = useCallback(
    async (rehearsal: boolean) => {
      if (!platform || !meta) return
      setBusy(true)
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, credentials: {}, rehearsal }),
        })
        const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
        if (!res.ok || !data.account) throw new Error(data.error || 'Connection failed')
        toast({
          title: `${meta.label} connected ✓`,
          description: rehearsal
            ? 'The agent is on it — it will study your page, watch what’s trending and start posting. See the Activity feed.'
            : 'Live and verified — posts go on-air for real.',
        })
        onOpenChange(false)
        onConnected()
      } catch (err) {
        toast({ title: 'Could not connect', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
      } finally {
        setBusy(false)
      }
    },
    [platform, meta, toast, onOpenChange, onConnected],
  )

  // ZERO-KNOWLEDGE one tap: the platform's OWN sign-in window does all the
  // technical work. The window is opened synchronously inside the tap —
  // BEFORE any await — so popup blockers can never swallow it. After the
  // user signs in on the platform's page, the callback reports back via
  // postMessage and the account flips to live automatically.
  const connectOneTap = useCallback(async () => {
    if (!platform || !meta) return
    setBusy(true)
    setHint('')
    const win = window.open('about:blank', 'nexus-social-oauth', 'width=620,height=760')
    try {
      if (win) {
        win.document.write(
          `<title>Connecting…</title><p style="font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;color:#666;font-size:15px">Opening ${meta.label}…</p>`,
        )
      }
      const res = await fetch(`/api/social/oauth/start?platform=${platform}`)
      if (res.status === 401) {
        win?.close()
        setHint('Your session ended — sign in once more and tap again. The connection itself is switched on and waiting.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { available?: boolean; url?: string; hint?: string }
      if (data.available && data.url) {
        setHint('')
        setWizard(false)
        if (win) win.location.href = data.url
        else window.location.href = data.url
        // The popup finishes the handshake and messages us back.
      } else {
        // This deployment hasn't switched that platform's connection on
        // yet — keep the promise: the agent starts rehearsing right now,
        // and the guided one-time switch-on appears in this dialog.
        win?.close()
        setHint(data.hint ?? '')
        setWizard(true)
        await connect(true)
      }
    } catch {
      win?.close()
      setHint('The connection service didn’t answer. Try again in a moment — nothing is broken.')
    } finally {
      setBusy(false)
    }
  }, [platform, meta, connect])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }, [redirectUri])

  // THE PAYOFF: save the two values (encrypted) and — without the user
  // doing anything else — jump straight into the platform's own sign-in.
  // This is the exact "sign in and it just connects" moment.
  const switchOn = useCallback(async () => {
    if (!platform || !clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/social/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not save the two values')
      setHint('')
      setWizard(false)
      toast({
        title: `${meta?.label ?? 'The platform'} connection is switched on ✓`,
        description: 'Opening the official sign-in — approve and done.',
      })
      void connectOneTap()
    } catch (err) {
      toast({
        title: 'Could not switch on',
        description: err instanceof Error ? err.message : 'Check both values and try again',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [platform, clientId, clientSecret, meta, toast, connectOneTap])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto omni-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            {platform && <PlatformGlyph platform={platform} className="h-5 w-5" />}
            Connect {meta?.label}
          </DialogTitle>
          <DialogDescription>One tap and your agent starts working for this account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Promise row — plain words only */}
          <div className="flex flex-wrap gap-1.5">
            {['No password needed', 'No tokens', wizard ? 'One-time switch-on' : 'No developer account'].map((p) => (
              <Badge key={p} variant="outline" className="gap-1 border-emerald-400/30 text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {p}
              </Badge>
            ))}
          </div>

          <Button onClick={() => void connectOneTap()} disabled={busy || !platform} className="h-12 w-full text-sm font-semibold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
            {busy ? 'Connecting…' : `Connect ${meta?.label ?? ''} — one tap`}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            The official {meta?.label ?? ''} window opens — sign in, approve, done.
            {!wizard && <span className="font-medium text-emerald-400"> Nothing to copy, nothing to paste.</span>}
          </p>

          {hint && !wizard && (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] leading-relaxed text-amber-200/90">{hint}</p>
          )}

          {/* ---- One-time switch-on wizard (like every official app, ONCE) ---- */}
          {wizard && platform && (
            <div className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3.5">
              <p className="text-xs font-semibold leading-relaxed text-amber-200">
                First time only: switch {meta?.label} on officially — about 5 minutes, then never again.
              </p>
              <ol className="list-inside list-decimal space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {WIZARD[platform].steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>

              <a
                href={WIZARD[platform].portal}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/60 text-xs font-medium text-foreground transition hover:border-primary/40"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open {meta?.label} for developers
              </a>

              <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
                <p className="text-[11px] leading-relaxed text-muted-foreground">{WIZARD[platform].pasteWhere}:</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-secondary/70 px-2 py-1.5 text-[10px] text-foreground/80" dir="ltr">
                    {redirectUri || '…'}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyLink()}
                    className="h-9 shrink-0 gap-1 text-[11px]"
                  >
                    {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                    {copied ? 'Copied ✓' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={WIZARD[platform].idLabel}
                  className="h-11 text-xs"
                  autoComplete="off"
                  dir="ltr"
                />
                <Input
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={WIZARD[platform].secretLabel}
                  type="password"
                  className="h-11 text-xs"
                  autoComplete="off"
                  dir="ltr"
                />
              </div>

              <Button
                onClick={() => void switchOn()}
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
                className="h-12 w-full text-sm font-semibold"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
                {saving ? 'Switching on…' : 'Switch on — then sign in'}
              </Button>

              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                Stored encrypted on your server — never shown again. After this it is just sign-in, like any app.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Compose dialog — topic → AI draft → publish / schedule              */
/* ------------------------------------------------------------------ */

function ComposeDialog({
  account,
  open,
  onOpenChange,
  onPublished,
}: {
  account: Account | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPublished: () => void
}) {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [caption, setCaption] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [drafting, setDrafting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduled, setScheduled] = useState('')

  useEffect(() => {
    if (open) {
      setTopic('')
      setCaption('')
      setImageUrl('')
      setHashtags([])
      setScheduled('')
    }
  }, [open])

  const draft = useCallback(async () => {
    if (!account || topic.trim().length < 3) return
    setDrafting(true)
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: account.platform, topic: topic.trim(), withImage: true, accountId: account.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { caption?: string; imageUrl?: string; hashtags?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Draft failed')
      setCaption(data.caption ?? '')
      setImageUrl(data.imageUrl ?? '')
      setHashtags(Array.isArray(data.hashtags) ? data.hashtags : [])
    } catch (err) {
      toast({ title: 'Draft failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setDrafting(false)
    }
  }, [account, topic, toast])

  const publish = useCallback(
    async (withSchedule: boolean) => {
      if (!account || !caption.trim()) return
      setPublishing(true)
      try {
        const res = await fetch('/api/social/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            caption: caption.trim(),
            mediaUrls: imageUrl ? [imageUrl] : [],
            mediaKind: imageUrl ? 'image' : 'text',
            scheduledFor: withSchedule && scheduled ? new Date(scheduled).toISOString() : 'now',
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; post?: { status: string } }
        if (!res.ok) throw new Error(data.error || 'Publish failed')
        toast({
          title: withSchedule ? 'Scheduled ✓' : 'Sent to the platform ✓',
          description: withSchedule
            ? `The agent will publish it ${scheduled ? new Date(scheduled).toLocaleString() : 'at the chosen time'}.`
            : data.post?.status === 'simulated'
              ? 'Rehearsed — go live to publish for real.'
              : 'Check the Queue tab for the result.',
        })
        onOpenChange(false)
        onPublished()
      } catch (err) {
        toast({ title: 'Could not publish', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
      } finally {
        setPublishing(false)
      }
    },
    [account, caption, imageUrl, scheduled, toast, onOpenChange, onPublished],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New post {account ? `· ${account.platformLabel}` : ''}</DialogTitle>
          <DialogDescription>
            Say the idea in one line — the agent writes the caption, shoots the visual and publishes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Our new collection just dropped"
              className="h-10"
              aria-label="Post topic"
            />
            <Button onClick={() => void draft()} disabled={drafting || topic.trim().length < 3} className="h-10 shrink-0">
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
              Draft
            </Button>
          </div>

          {drafting && (
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
              Researching what works, writing, shooting the visual…
            </p>
          )}

          {caption && (
            <>
              {imageUrl && (
                <img src={imageUrl} alt="AI-generated visual for this post" className="max-h-64 w-full rounded-xl border border-border/60 object-cover" />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cap" className="text-xs">
                  Caption — edit anything
                </Label>
                <Textarea id="cap" value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="text-sm" />
              </div>
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <Badge key={h} variant="outline" className="text-[11px] text-muted-foreground">
                      {h.startsWith('#') ? h : `#${h}`}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <Label htmlFor="sched" className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  Schedule (optional)
                </Label>
                <Input
                  id="sched"
                  type="datetime-local"
                  value={scheduled}
                  onChange={(e) => setScheduled(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => void publish(!scheduled)}
                  disabled={publishing}
                  className="h-11 flex-1 text-sm font-semibold"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  {scheduled ? 'Schedule it' : 'Publish now'}
                </Button>
                {scheduled && (
                  <Button variant="secondary" onClick={() => void publish(false)} disabled={publishing} className="h-11">
                    Skip schedule
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Trend strip — what the radar learned                                */
/* ------------------------------------------------------------------ */

function TrendStrip({ trends }: { trends: TrendBrain }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className={cn('flex items-center gap-1.5', SECTION_LABEL)}>
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          What’s attracting people now
        </p>
        <span className="text-[10px] text-muted-foreground">{relTime(trends.fetchedAt)}</span>
      </div>
      {trends.summary && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{trends.summary}</p>}
      {trends.hooks.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {trends.hooks.slice(0, 4).map((h, i) => (
            <Badge key={i} variant="outline" className="max-w-full text-[11px] text-muted-foreground">
              <span className="truncate">“{h.length > 60 ? `${h.slice(0, 60)}…` : h}”</span>
            </Badge>
          ))}
        </div>
      )}
      {trends.hashtags.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground/80">
          {trends.hashtags.slice(0, 8).map((h) => (h.startsWith('#') ? h : `#${h}`)).join('  ')}
        </p>
      )}
      {trends.sources.length > 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">{trends.sources.length} live sources researched</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function SocialMode() {
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])

  // dialogs
  const [connectPlatform, setConnectPlatform] = useState<Platform | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  // Re-open the connect gallery even when accounts already exist
  // (e.g. Facebook auto-connected and Instagram still needs a retry).
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)

  // autopilot card state
  const [topicDraft, setTopicDraft] = useState('')
  const [brainOpen, setBrainOpen] = useState(false)
  const [brainFields, setBrainFields] = useState({ niche: '', audience: '', tone: '' })
  const [running, setRunning] = useState(false)
  const [researching, setResearching] = useState(false)
  const [savingBrain, setSavingBrain] = useState(false)

  // inbox
  const [sampleText, setSampleText] = useState('')

  const active = useMemo(() => accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null, [accounts, activeId])
  const pendingComments = useMemo(() => comments.filter((c) => c.status === 'pending'), [comments])

  /* ------------------------------ data ------------------------------ */

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/social/accounts')
      if (res.ok) {
        const data = (await res.json()) as { accounts?: Account[] }
        setAccounts(data.accounts ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/social/posts')
      if (res.ok) {
        const data = (await res.json()) as { posts?: Post[]; activity?: ActivityRow[] }
        setPosts(data.posts ?? [])
        setActivity(data.activity ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch('/api/social/comments')
      if (res.ok) {
        const data = (await res.json()) as { comments?: CommentRow[] }
        setComments(data.comments ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void Promise.all([loadAccounts(), loadQueue(), loadComments()]).finally(() => setLoading(false))
    // Gentle heartbeat: while the screen is open, the autopilot tick runs
    // server-side (the GET doubles as the automation heartbeat).
    const t = setInterval(() => void loadQueue(), 20_000)
    return () => clearInterval(t)
  }, [loadAccounts, loadQueue, loadComments])

  // ZERO-KNOWLEDGE go-live handshake finish: the OAuth popup posts
  // "nexus-social-oauth" when the platform's own sign-in page is done.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; ok?: boolean; platform?: string; message?: string }
      if (d?.type !== 'nexus-social-oauth') return
      void loadAccounts()
      void loadQueue()
      setConnectOpen(false)
      setGalleryOpen(false)
      toast(
        d.ok
          ? {
              title: `${d.platform ?? 'The account'} is live ✓`,
              description: 'Connected for real — posts now go on-air. The agents take it from here.',
            }
          : {
              title: `${d.platform ?? 'Connection'} wasn't finished`,
              description: d.message || 'No problem — the agent keeps rehearsing. You can try again any time.',
            },
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [loadAccounts, loadQueue, toast])

  // Sync the autopilot inputs whenever the active account changes.
  useEffect(() => {
    if (active) {
      setTopicDraft(active.autopilotTopic)
      setBrainFields({ niche: active.pageNiche, audience: active.pageAudience, tone: active.pageTone })
    }
  }, [active?.id])

  /* ---------------------------- actions ----------------------------- */

  const patchAccount = useCallback(
    async (fields: Record<string, unknown>, id?: string) => {
      const target = id ?? active?.id
      if (!target) return
      try {
        const res = await fetch('/api/social/accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target, ...fields }),
        })
        const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
        if (!res.ok || !data.account) throw new Error(data.error || 'Update failed')
        setAccounts((prev) => prev.map((a) => (a.id === target ? (data.account as Account) : a)))
      } catch (err) {
        toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
      }
    },
    [active?.id, toast],
  )

  const runNow = useCallback(async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/social/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { processed?: number; error?: string }
      if (!res.ok) throw new Error(data.error || 'Run failed')
      toast({
        title: data.processed ? 'The agent worked its magic ✓' : 'Nothing was due right now',
        description: data.processed
          ? `Processed ${data.processed} account${data.processed > 1 ? 's' : ''} — research, write, design, publish. Check the Queue.`
          : 'Turn Autopilot on or wait for the next scheduled run.',
      })
      await Promise.all([loadQueue(), loadAccounts()])
    } catch (err) {
      toast({ title: 'Run failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }, [toast, loadQueue, loadAccounts])

  const research = useCallback(async () => {
    if (!active) return
    setResearching(true)
    try {
      const res = await fetch('/api/social/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: active.id, force: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { trends?: TrendBrain; error?: string }
      if (!res.ok || !data.trends) throw new Error(data.error || 'Scan failed')
      setAccounts((prev) => prev.map((a) => (a.id === active.id ? { ...a, trends: data.trends as TrendBrain } : a)))
      toast({ title: 'Trend scan done ✓', description: 'The agent studied what’s attracting people in your niche right now.' })
    } catch (err) {
      toast({ title: 'Scan failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setResearching(false)
    }
  }, [active, toast])

  const saveBrain = useCallback(async () => {
    if (!active) return
    setSavingBrain(true)
    try {
      const res = await fetch('/api/social/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: active.id,
          pageNiche: brainFields.niche,
          pageAudience: brainFields.audience,
          pageTone: brainFields.tone,
          buildStrategy: true,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string }
      if (!res.ok || !data.account) throw new Error(data.error || 'Save failed')
      setAccounts((prev) => prev.map((a) => (a.id === active.id ? (data.account as Account) : a)))
      toast({ title: 'The agent knows your page ✓', description: 'Every future post and reply now matches your voice.' })
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' })
    } finally {
      setSavingBrain(false)
    }
  }, [active, brainFields, toast])

  const disconnect = useCallback(
    async (id: string) => {
      try {
        // Audit fix: only remove the account from the UI when the server
        // actually deleted it — a failed request used to “lose” the account
        // silently until the next reload resurrected it.
        const res = await fetch(`/api/social/accounts?id=${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        setAccounts((prev) => prev.filter((a) => a.id !== id))
        if (activeId === id) setActiveId(null)
        toast({ title: 'Disconnected' })
        void loadQueue()
      } catch {
        toast({ title: 'Could not disconnect', description: 'The account is still connected — try again.', variant: 'destructive' })
      }
    },
    [activeId, toast, loadQueue],
  )

  const sendReply = useCallback(
    async (comment: CommentRow) => {
      try {
        const res = await fetch(`/api/social/comments/${comment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply: comment.aiReply }),
        })
        if (res.ok) {
          setComments((prev) =>
            prev.map((c) => (c.id === comment.id ? { ...c, status: 'replied', repliedAt: new Date().toISOString() } : c)),
          )
          toast({ title: 'Reply sent ✓', description: 'The agent answered like a human would.' })
          void loadQueue()
        }
      } catch {
        toast({ title: 'Could not send', variant: 'destructive' })
      }
    },
    [toast, loadQueue],
  )

  const addSample = useCallback(async () => {
    if (!active || sampleText.trim().length < 2) return
    try {
      const res = await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: active.id, author: 'Curious visitor', text: sampleText.trim(), draftNow: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { comment?: CommentRow }
      if (res.ok && data.comment) {
        setComments((prev) => [data.comment as CommentRow, ...prev])
        setSampleText('')
      }
    } catch {
      /* non-fatal */
    }
  }, [active, sampleText])

  const openConnect = useCallback((p: Platform) => {
    setConnectPlatform(p)
    setConnectOpen(true)
  }, [])

  const nextRunLabel = useCallback((a: Account): string => {
    if (!a.autopilot) return 'Autopilot is off — the agent waits for you.'
    if (!a.lastAutoPostAt) return 'First post is brewing — the agent is getting ready.'
    const due = new Date(new Date(a.lastAutoPostAt).getTime() + a.autopilotCadenceMinutes * 60_000)
    const mins = Math.round((due.getTime() - Date.now()) / 60_000)
    if (mins <= 0) return 'Due now — the next post is on its way.'
    if (mins < 60) return `Next post in ~${mins}m`
    return `Next post in ~${Math.round(mins / 60)}h`
  }, [])

  const accountPosts = useMemo(() => posts.filter((p) => !active || p.accountId === active.id), [posts, active])

  /* ---------------------------- render ------------------------------ */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading Social Autopilot</span>
      </div>
    )
  }

  return (
    <div className="omni-scroll h-full min-h-0 w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-6">
      {/* Account chips */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Connected accounts">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === active?.id}
              onClick={() => setActiveId(a.id)}
              className={cn(
                'group flex min-h-[40px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
                a.id === active?.id
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <PlatformGlyph platform={a.platform} className="h-3.5 w-3.5" />
              <span className="font-medium">{a.handle || a.displayName}</span>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  a.status === 'connected' ? 'bg-emerald-400' : a.status === 'error' ? 'bg-red-400' : 'bg-amber-400',
                )}
                aria-hidden
              />
              <span
                role="button"
                tabIndex={0}
                aria-label={`Disconnect ${a.displayName}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void disconnect(a.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    void disconnect(a.id)
                  }
                }}
                className="ml-0.5 hidden text-muted-foreground/60 transition hover:text-red-400 group-hover:block"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            onClick={() => setGalleryOpen(true)}
            className={cn(
              'flex min-h-[40px] items-center gap-1.5 rounded-full border border-dashed border-border/70 px-3 py-1.5 text-xs transition',
              galleryOpen
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="font-medium">Connect</span>
          </button>
        </div>
      )}

      {/* EMPTY — the connect gallery (or re-opened via the + chip) */}
      {accounts.length === 0 || galleryOpen ? (
        <section className={cn(CARD, 'p-6')} aria-label="Connect a social account">
          <div className="mx-auto max-w-md text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15">
              <Radio className="h-6 w-6 text-amber-400" aria-hidden />
            </span>
            <h3 className="mt-3 text-base font-semibold">Connect your first account</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              One tap. No passwords, no tokens, no developer account — the agent starts working immediately.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PLATFORM_ORDER.map((p) => {
              const meta = PLATFORMS[p]
              const Icon = meta.icon
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => openConnect(p)}
                  className="group flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-border/60 bg-background/40 p-4 text-start transition hover:border-primary/40 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.tile)}>
                    <Icon className="h-5 w-5" style={{ color: meta.color }} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{meta.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{meta.blurb}</span>
                  </span>
                  <Zap className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-amber-400" aria-hidden />
                </button>
              )
            })}
          </div>
          {accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setGalleryOpen(false)}
              className="mx-auto mt-4 block min-h-[44px] rounded-full border border-border/60 px-5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Back to my accounts
            </button>
          )}
        </section>
      ) : (
        active && (
          <>
            {/* ---------- Autopilot hero ---------- */}
            <section className={cn(CARD, 'p-5')} aria-label="Autopilot control">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Autopilot</h3>
                    <StatusChip status={active.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{nextRunLabel(active)}</p>
                </div>
                <Switch
                  checked={active.autopilot}
                  onCheckedChange={(v) => void patchAccount({ autopilot: v })}
                  aria-label="Toggle autopilot"
                />
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onBlur={() => {
                      if (topicDraft !== active.autopilotTopic) void patchAccount({ autopilotTopic: topicDraft })
                    }}
                    placeholder="What should the agent post about? (your brand, your niche…)"
                    className="h-10"
                    aria-label="Autopilot topic"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('me-1', SECTION_LABEL)}>Cadence</span>
                  {CADENCE_OPTIONS.map((c) => (
                    <button
                      key={c.mins}
                      type="button"
                      onClick={() => void patchAccount({ autopilotCadenceMinutes: c.mins })}
                      aria-pressed={active.autopilotCadenceMinutes === c.mins}
                      className={cn(
                        'min-h-[32px] rounded-full border px-3 py-1 text-[11px] transition',
                        active.autopilotCadenceMinutes === c.mins
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {active.trends && <TrendStrip trends={active.trends} />}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => void runNow()} disabled={running} className="h-10 text-xs font-semibold">
                    {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Zap className="h-3.5 w-3.5" aria-hidden />}
                    Post now
                  </Button>
                  <Button variant="secondary" onClick={() => void research()} disabled={researching} className="h-10 text-xs">
                    {researching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Search className="h-3.5 w-3.5" aria-hidden />}
                    Research what’s trending
                  </Button>
                  <Button variant="secondary" onClick={() => setComposeOpen(true)} className="h-10 text-xs">
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                    New post
                  </Button>
                </div>

                {/* Auto-reply toggle — human-quality replies */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                  <div>
                    <p className="text-xs font-semibold">Reply to people automatically</p>
                    <p className="text-[11px] text-muted-foreground">
                      The agent answers comments like a savvy human — warm, helpful, on-brand.
                    </p>
                  </div>
                  <Switch
                    checked={active.autoReply}
                    onCheckedChange={(v) => void patchAccount({ autoReply: v })}
                    aria-label="Toggle automatic replies"
                  />
                </div>

                {/* Page brain — collapsible */}
                <div className="rounded-xl border border-border/60 bg-background/40">
                  <button
                    type="button"
                    onClick={() => setBrainOpen((v) => !v)}
                    aria-expanded={brainOpen}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 p-3 text-start"
                  >
                    <span className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="text-xs font-semibold">What the agent knows about your page</span>
                      {active.strategy && <Badge variant="outline" className="text-[10px] text-emerald-400">Strategy ready</Badge>}
                    </span>
                    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', brainOpen && 'rotate-180')} aria-hidden />
                  </button>
                  {brainOpen && (
                    <div className="space-y-3 border-t border-border/60 p-3.5">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="b-niche" className="text-[11px]">
                            The page is about
                          </Label>
                          <Input
                            id="b-niche"
                            value={brainFields.niche}
                            onChange={(e) => setBrainFields((f) => ({ ...f, niche: e.target.value }))}
                            placeholder="handmade candles"
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="b-aud" className="text-[11px]">
                            Followers are
                          </Label>
                          <Input
                            id="b-aud"
                            value={brainFields.audience}
                            onChange={(e) => setBrainFields((f) => ({ ...f, audience: e.target.value }))}
                            placeholder="home-decor lovers, 25–40"
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="b-tone" className="text-[11px]">
                            It should sound
                          </Label>
                          <Input
                            id="b-tone"
                            value={brainFields.tone}
                            onChange={(e) => setBrainFields((f) => ({ ...f, tone: e.target.value }))}
                            placeholder="warm, playful"
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void saveBrain()} disabled={savingBrain} className="h-9 text-xs">
                          {savingBrain ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Brain className="h-3.5 w-3.5" aria-hidden />}
                          Teach the agent
                        </Button>
                        {active.strategy && (
                          <p className="truncate text-[10px] text-muted-foreground">
                            Voice: {active.strategy.voice} · Pillars: {active.strategy.pillars.slice(0, 3).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ---------- Queue / Inbox / Activity ---------- */}
            <Tabs defaultValue="queue">
              <TabsList className="rounded-xl">
                <TabsTrigger value="queue" className="gap-1.5 rounded-lg text-xs">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Queue
                  {accountPosts.length > 0 && <span className="text-muted-foreground">({accountPosts.length})</span>}
                </TabsTrigger>
                <TabsTrigger value="inbox" className="gap-1.5 rounded-lg text-xs">
                  <Inbox className="h-3.5 w-3.5" aria-hidden /> Inbox
                  {pendingComments.length > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400">
                      {pendingComments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-1.5 rounded-lg text-xs">
                  <ActivityIcon className="h-3.5 w-3.5" aria-hidden /> Activity
                </TabsTrigger>
              </TabsList>

              {/* QUEUE */}
              <TabsContent value="queue" className="mt-3">
                {accountPosts.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nothing here yet — turn Autopilot on or press “Post now”.
                  </p>
                ) : (
                  <div className="omni-scroll max-h-96 space-y-2 overflow-y-auto pe-1">
                    {accountPosts.map((p) => (
                      <article key={p.id} className="flex gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                        {p.mediaUrls[0] ? (
                          <img
                            src={p.mediaUrls[0]}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg border border-border/60 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/40">
                            <PlatformGlyph platform={p.platform} className="h-5 w-5" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PostStatusChip status={p.status} />
                            <span className="truncate text-[10px] text-muted-foreground">
                              {p.origin === 'autopilot' ? 'by the agent' : 'by you'} · {relTime(p.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/90">{p.caption}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* INBOX */}
              <TabsContent value="inbox" className="mt-3">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={sampleText}
                      onChange={(e) => setSampleText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addSample()
                      }}
                      placeholder="Try it — type a comment a customer would leave…"
                      className="h-10 text-xs"
                      aria-label="Sample comment"
                    />
                    <Button variant="secondary" onClick={() => void addSample()} disabled={sampleText.trim().length < 2} className="h-10 shrink-0 text-xs">
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Add
                    </Button>
                  </div>

                  {comments.filter((c) => !active || c.accountId === active.id).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No comments yet. When people comment, the agent drafts the perfect reply here.
                    </p>
                  ) : (
                    <div className="omni-scroll max-h-96 space-y-2 overflow-y-auto pe-1">
                      {comments
                        .filter((c) => !active || c.accountId === active.id)
                        .map((c) => (
                          <article key={c.id} className="rounded-xl border border-border/60 bg-card/60 p-3.5">
                            <div className="flex items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[10px] font-bold">
                                {(c.author || 'A').charAt(0).toUpperCase()}
                              </span>
                              <span className="text-xs font-semibold">{c.author || 'Someone'}</span>
                              <span className="text-[10px] text-muted-foreground">{relTime(c.createdAt)}</span>
                              {c.status === 'replied' && (
                                <Badge variant="outline" className="ms-auto text-[10px] text-emerald-400">
                                  Replied
                                </Badge>
                              )}
                              {c.status === 'dismissed' && (
                                <Badge variant="outline" className="ms-auto text-[10px] text-muted-foreground">
                                  Dismissed
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">{c.text}</p>
                            {c.aiReply ? (
                              <div className="mt-2.5 rounded-lg border-s-2 border-emerald-400/60 bg-emerald-400/5 p-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Agent’s reply</p>
                                <p className="mt-1 text-xs leading-relaxed text-foreground/90">{c.aiReply}</p>
                                {c.status === 'pending' && (
                                  <div className="mt-2 flex gap-1.5">
                                    <Button size="sm" onClick={() => void sendReply(c)} className="h-7 text-[11px]">
                                      <Send className="h-3 w-3" aria-hidden />
                                      Send
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-[11px]"
                                      onClick={async () => {
                                        try {
                                          // Audit fix: verify the request actually succeeded
                                          // before flipping UI state (no false "dismissed").
                                          const res = await fetch(`/api/social/comments/${c.id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ action: 'dismiss' }),
                                          })
                                          if (!res.ok) throw new Error(`Request failed (${res.status})`)
                                          setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'dismissed' } : x)))
                                        } catch {
                                          toast({ title: 'Could not dismiss', description: 'Check your connection and try again.', variant: 'destructive' })
                                        }
                                      }}
                                    >
                                      Dismiss
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-[11px]"
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/social/comments/${c.id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ action: 'draft' }),
                                          })
                                          if (!res.ok) throw new Error(`Request failed (${res.status})`)
                                          const data = (await res.json().catch(() => ({}))) as { comment?: CommentRow }
                                          if (data.comment) setComments((prev) => prev.map((x) => (x.id === c.id ? (data.comment as CommentRow) : x)))
                                          else toast({ title: 'No draft came back', description: 'Try again in a moment.', variant: 'destructive' })
                                        } catch {
                                          toast({ title: 'Could not redraft', description: 'Check your connection and try again.', variant: 'destructive' })
                                        }
                                      }}
                                    >
                                      <RefreshCw className="h-3 w-3" aria-hidden />
                                      Redraft
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              c.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="mt-2 h-7 text-[11px]"
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/social/comments/${c.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'draft' }),
                                      })
                                      if (!res.ok) throw new Error(`Request failed (${res.status})`)
                                      const data = (await res.json().catch(() => ({}))) as { comment?: CommentRow }
                                      if (data.comment) setComments((prev) => prev.map((x) => (x.id === c.id ? (data.comment as CommentRow) : x)))
                                      else toast({ title: 'No draft came back', description: 'Try again in a moment.', variant: 'destructive' })
                                    } catch {
                                      toast({ title: 'Could not draft a reply', description: 'Check your connection and try again.', variant: 'destructive' })
                                    }
                                  }}
                                >
                                  <Sparkles className="h-3 w-3" aria-hidden />
                                  Draft a reply
                                </Button>
                              )
                            )}
                          </article>
                        ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ACTIVITY */}
              <TabsContent value="activity" className="mt-3">
                {activity.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">The work log appears here — every action the agents take.</p>
                ) : (
                  <div className="omni-scroll max-h-96 space-y-1 overflow-y-auto pe-1">
                    {activity.map((row) => {
                      const icon =
                        row.kind === 'publish'
                          ? Send
                          : row.kind === 'research'
                            ? TrendingUp
                            : row.kind === 'brain'
                              ? Brain
                              : row.kind === 'reply'
                                ? MessageCircle
                                : row.kind === 'fail'
                                  ? Trash2
                                  : Zap
                      const Icon = icon
                      return (
                        <div key={row.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-secondary/40">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">{row.message}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground/70">{relTime(row.createdAt)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )
      )}

      {/* Dialogs */}
      <ConnectDialog
        platform={connectPlatform}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={() => {
          void loadAccounts()
          void loadQueue()
        }}
      />
      <ComposeDialog account={active} open={composeOpen} onOpenChange={setComposeOpen} onPublished={() => void loadQueue()} />
      </div>
    </div>
  )
}
