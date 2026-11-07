'use client'

/**
 * Social Pilot — Brain & Inbox surfaces.
 *
 * BrainTab: the agent actually KNOWS the page (niche, audience, voice,
 * goal, language) and studies what is attracting people RIGHT NOW via
 * live trend research before it ever writes a word.
 *
 * InboxTab: the engagement side — paste real comments, the agent drafts
 * warm human-quality replies (language-matched), hands-free with the
 * auto-reply switch.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Brain,
  Check,
  Copy,
  Eye,
  Loader2,
  MessageCircle,
  Radar,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { SocialAccountView, SocialCommentView, TrendBrainView } from './social-types'

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

const GOALS = [
  { id: 'grow', label: 'Grow the audience' },
  { id: 'sales', label: 'Drive sales' },
  { id: 'community', label: 'Build community' },
  { id: 'authority', label: 'Look like an expert' },
]

const LANGS = [
  { id: 'ar', label: 'العربية' },
  { id: 'en', label: 'English' },
  { id: 'ar+en', label: 'عربي + English' },
]

export function AccountPills({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: SocialAccountView[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a.id)}
          className={cn(
            'flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition',
            selectedId === a.id
              ? 'border-foreground/40 bg-accent/60 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {a.displayName}
        </button>
      ))}
    </div>
  )
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'amber' | 'violet' }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
      : tone === 'violet'
        ? 'border-violet-400/30 bg-violet-400/10 text-violet-200'
        : 'border-border/70 bg-background/60 text-foreground/80'
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] leading-none', cls)}>{children}</span>
}

/* ================================================================== */
/* BRAIN TAB — page understanding + trend radar                        */
/* ================================================================== */

export function BrainTab({
  accounts,
  selectedId,
  onSelect,
  onChanged,
}: {
  accounts: SocialAccountView[]
  selectedId: string
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null

  // form state
  const [niche, setNiche] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('')
  const [goal, setGoal] = useState('')
  const [language, setLanguage] = useState('')
  const [savingBrain, setSavingBrain] = useState(false)
  const [building, setBuilding] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [trends, setTrends] = useState<TrendBrainView | null>(null)

  // Sync the form ONLY when the selected account changes — the parent
  // refreshes accounts every 60s and re-running on every object identity
  // would wipe what the user is typing.
  const syncedIdRef = useRef('')
  useEffect(() => {
    if (account && account.id !== syncedIdRef.current) {
      syncedIdRef.current = account.id
      setNiche(account.pageNiche || '')
      setAudience(account.pageAudience || '')
      setTone(account.pageTone || '')
      setGoal(account.pageGoal || '')
      setLanguage(account.pageLanguage || '')
      setTrends(account.trends ?? null)
    }
  }, [account])

  const saveBrain = useCallback(
    async (buildStrategy = false) => {
      if (!account) return
      setBuilding(buildStrategy)
      setSavingBrain(!buildStrategy)
      try {
        const res = await fetch('/api/social/brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            pageNiche: niche,
            pageAudience: audience,
            pageTone: tone,
            pageGoal: goal,
            pageLanguage: language,
            buildStrategy,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; strategy?: unknown }
        if (!res.ok) throw new Error(data.error || 'Save failed')
        toast({
          title: buildStrategy ? '🧠 Strategy built — the agent knows your page now' : 'Saved — the agent learned your page',
          description: buildStrategy
            ? 'Voice, pillars, hooks and rules are ready. Every post and reply now uses them.'
            : 'Every post and reply will respect this from now on.',
        })
        onChanged()
      } catch (err) {
        toast({ title: 'Could not save', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      } finally {
        setBuilding(false)
        setSavingBrain(false)
      }
    },
    [account, niche, audience, tone, goal, language, toast, onChanged],
  )

  const scanTrends = useCallback(async () => {
    if (!account) return
    setScanning(true)
    try {
      const res = await fetch('/api/social/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, force: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { trends?: TrendBrainView; error?: string }
      if (!res.ok || !data.trends) throw new Error(data.error || 'Scan failed')
      setTrends(data.trends)
      toast({
        title: data.trends.researched ? '🛰 Scan complete — live sources analyzed' : '🛰 Scan complete (agent knowledge)',
        description: `${data.trends.topics.length} hot topics · ${data.trends.hooks.length} proven hooks captured.`,
      })
      onChanged()
    } catch (err) {
      toast({ title: 'Trend scan failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }, [account, toast, onChanged])

  if (!account) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/60 p-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
        <p className="mt-3 text-sm font-medium">Connect an account first</p>
        <p className="mt-1 text-xs text-muted-foreground">The brain unlocks the moment one platform is linked.</p>
      </div>
    )
  }

  const strategy = account.strategy

  return (
    <div className="space-y-4">
      <AccountPills accounts={accounts} selectedId={account.id} onSelect={onSelect} />

      {/* ---- Teach the agent ---- */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-400/30 bg-violet-400/10 text-violet-300" aria-hidden>
            <Brain className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Teach the agent about your page</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Two minutes here changes everything — every post and every reply is written by an agent that actually understands your page.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="brain-niche">What is the page about?</Label>
            <Textarea
              id="brain-niche"
              rows={2}
              placeholder="e.g. Home-baked cakes in Cairo — custom orders, weekly tips for beginner bakers"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brain-audience">Who follows you? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="brain-audience"
              placeholder="e.g. young moms aged 25-40 who love homemade desserts"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brain-tone">How should it sound?</Label>
              <Input id="brain-tone" placeholder="e.g. warm, playful, expert" value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <div className="flex flex-wrap gap-1.5">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLanguage(l.id)}
                    className={cn(
                      'min-h-[34px] rounded-full border px-3 text-[11px] font-medium transition',
                      language === l.id ? 'border-violet-400/60 bg-violet-400/10 text-violet-200' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>What is the goal?</Label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  className={cn(
                    'min-h-[34px] rounded-full border px-3 text-[11px] font-medium transition',
                    goal === g.id ? 'border-violet-400/60 bg-violet-400/10 text-violet-200' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void saveBrain(false)} disabled={savingBrain || building} variant="outline" className="min-h-[44px] flex-1">
              {savingBrain ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Save what it knows
            </Button>
            <Button onClick={() => void saveBrain(true)} disabled={savingBrain || building} className="min-h-[44px] flex-1">
              {building ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {building ? 'Thinking…' : 'Build the AI strategy'}
            </Button>
          </div>
        </div>

        {strategy && (strategy.pillars.length > 0 || strategy.hooks.length > 0) && (
          <div className="mt-4 space-y-3 rounded-xl border border-violet-400/25 bg-violet-400/5 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-200">
              <Brain className="h-3.5 w-3.5" aria-hidden /> The agent&apos;s strategy for this page
            </p>
            {strategy.voice && <p className="text-[13px] leading-relaxed text-foreground/85">&ldquo;{strategy.voice}&rdquo;</p>}
            {strategy.pillars.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Content pillars</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {strategy.pillars.map((p, i) => (
                    <Chip key={i} tone="violet">{p}</Chip>
                  ))}
                </div>
              </div>
            )}
            {strategy.hooks.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hooks it will model</p>
                <ul className="mt-1.5 space-y-1">
                  {strategy.hooks.slice(0, 5).map((h, i) => (
                    <li key={i} className="text-[12px] leading-snug text-foreground/80">• {h}</li>
                  ))}
                </ul>
              </div>
            )}
            {(strategy.dos.length > 0 || strategy.donts.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {strategy.dos.length > 0 && (
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Always</p>
                    <ul className="mt-1 space-y-0.5">
                      {strategy.dos.map((d, i) => (
                        <li key={i} className="text-[11px] text-foreground/75">✓ {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {strategy.donts.length > 0 && (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-red-300">Never</p>
                    <ul className="mt-1 space-y-0.5">
                      {strategy.donts.map((d, i) => (
                        <li key={i} className="text-[11px] text-foreground/75">✕ {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {strategy.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {strategy.hashtags.map((h, i) => (
                  <Chip key={i}>{h}</Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Trend Radar ---- */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300" aria-hidden>
              <Radar className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Trend Radar — research before writing</h3>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                The agent searches the live web for the best-performing content in your niche, then writes posts modeled on what is actually attracting people.
              </p>
            </div>
          </div>
          <Button onClick={() => void scanTrends()} disabled={scanning} size="sm" className="min-h-[40px]">
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Radar className="h-3.5 w-3.5" aria-hidden />}
            {scanning ? 'Scanning the web…' : trends ? 'Re-scan now' : 'Scan what works now'}
          </Button>
        </div>

        {trends ? (
          <div className="mt-4 space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-amber-400/40 text-[10px] text-amber-200">
                {trends.researched ? '🛰 live web research' : '🧠 agent knowledge'}
              </Badge>
              <span className="text-[10px] text-muted-foreground">scanned {ago(trends.fetchedAt)} · auto-refreshes every 6h</span>
            </div>
            {trends.summary && <p className="text-[13px] leading-relaxed text-foreground/85">{trends.summary}</p>}
            {trends.topics.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hot topics</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {trends.topics.map((t, i) => (
                    <Chip key={i} tone="amber">{t}</Chip>
                  ))}
                </div>
              </div>
            )}
            {trends.hooks.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hooks pulling people in</p>
                <ul className="mt-1.5 space-y-1">
                  {trends.hooks.slice(0, 5).map((h, i) => (
                    <li key={i} className="text-[12px] leading-snug text-foreground/80">• {h}</li>
                  ))}
                </ul>
              </div>
            )}
            {trends.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trends.hashtags.map((h, i) => (
                  <Chip key={i}>{h}</Chip>
                ))}
              </div>
            )}
            {trends.sources.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                  <Eye className="h-3 w-3" aria-hidden /> {trends.sources.length} sources the agent read
                </summary>
                <ul className="mt-2 space-y-1">
                  {trends.sources.map((s, i) => (
                    <li key={i} className="truncate text-[11px]">
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Not scanned yet — autopilot runs this automatically before every post, or scan now to see what it finds.
          </p>
        )}
      </div>

      {/* Diverse AI pool note */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground/80">A diverse team of AIs, one agent</p>
        Every job runs on a different specialist from the model pool — deep reasoners analyze trends, creative models write the posts, fast models answer comments — with automatic failover if any engine is busy. Your page brain and the trend research are injected into every single call.
      </div>
    </div>
  )
}

/* ================================================================== */
/* INBOX TAB — the agent answers people                                */
/* ================================================================== */

const SENTIMENT: Record<string, { label: string; cls: string }> = {
  positive: { label: '😍 positive', cls: 'border-emerald-400/40 text-emerald-300' },
  question: { label: '❓ question', cls: 'border-sky-400/40 text-sky-300' },
  complaint: { label: '😤 complaint', cls: 'border-red-400/40 text-red-300' },
  lead: { label: '💰 potential customer', cls: 'border-amber-400/40 text-amber-300' },
  spam: { label: '🚫 spam', cls: 'border-border text-muted-foreground' },
  neutral: { label: '• neutral', cls: 'border-border text-muted-foreground' },
}

export function InboxTab({
  accounts,
  selectedId,
  onSelect,
  onChanged,
}: {
  accounts: SocialAccountView[]
  selectedId: string
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null
  const [comments, setComments] = useState<SocialCommentView[]>([])
  const [loading, setLoading] = useState(true)
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [togglingReply, setTogglingReply] = useState(false)

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch('/api/social/comments')
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as { comments?: SocialCommentView[] }
      setComments(data.comments ?? [])
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const addComment = useCallback(async () => {
    if (!account || !text.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, author, text, draftNow: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { comment?: SocialCommentView; error?: string }
      if (!res.ok || !data.comment) throw new Error(data.error || 'Could not add the comment')
      setComments((c) => [data.comment!, ...c])
      setText('')
      setAuthor('')
      toast({
        title: data.comment.aiReply ? '💬 Reply drafted' : 'Comment saved',
        description: data.comment.aiReply
          ? 'The agent read the comment and wrote a human-quality answer.'
          : 'The reply can be drafted from the comment card.',
      })
    } catch (err) {
      toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }, [account, author, text, toast])

  const act = useCallback(
    async (comment: SocialCommentView, action: 'draft' | 'dismiss') => {
      setBusyId(comment.id)
      try {
        const res = await fetch(`/api/social/comments/${comment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'draft' ? { action: 'draft' } : { action: 'dismiss' }),
        })
        const data = (await res.json().catch(() => ({}))) as { comment?: SocialCommentView; error?: string }
        if (!res.ok) throw new Error(data.error || 'Action failed')
        if (data.comment) setComments((c) => c.map((x) => (x.id === comment.id ? data.comment! : x)))
        if (action === 'draft') toast({ title: '💬 Fresh reply drafted' })
      } catch (err) {
        toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      } finally {
        setBusyId('')
      }
    },
    [toast],
  )

  const removeComment = useCallback(
    async (comment: SocialCommentView) => {
      setBusyId(comment.id)
      try {
        const res = await fetch(`/api/social/comments/${comment.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Could not delete')
        setComments((c) => c.filter((x) => x.id !== comment.id))
      } catch (err) {
        toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
      } finally {
        setBusyId('')
      }
    },
    [toast],
  )

  const copyReply = useCallback(
    async (comment: SocialCommentView) => {
      try {
        await navigator.clipboard.writeText(comment.aiReply)
        toast({ title: 'Reply copied — paste it on the platform ✓' })
      } catch {
        toast({ title: 'Copy failed', variant: 'destructive' })
      }
    },
    [toast],
  )

  const toggleAutoReply = useCallback(async () => {
    if (!account) return
    setTogglingReply(true)
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, autoReply: !account.autoReply }),
      })
      if (!res.ok) throw new Error('Could not update auto-reply')
      toast({
        title: account.autoReply ? 'Auto-reply off' : '💬 Auto-reply ON — the agent answers for you',
        description: account.autoReply ? undefined : 'New comments get human-quality replies automatically.',
      })
      onChanged()
    } catch (err) {
      toast({ title: 'Failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setTogglingReply(false)
    }
  }, [account, toast, onChanged])

  if (!account) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/60 p-8 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
        <p className="mt-3 text-sm font-medium">Connect an account first</p>
        <p className="mt-1 text-xs text-muted-foreground">The inbox unlocks the moment one platform is linked.</p>
      </div>
    )
  }

  const visible = comments.filter((c) => c.status !== 'dismissed')

  return (
    <div className="space-y-4">
      <AccountPills accounts={accounts} selectedId={account.id} onSelect={onSelect} />

      {/* Auto-reply switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Auto-reply <span className="text-muted-foreground">— {account.displayName}</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">The agent reads new comments and drafts warm, on-brand answers — in the commenter&apos;s own language.</p>
        </div>
        <Switch
          checked={account.autoReply}
          onCheckedChange={() => void toggleAutoReply()}
          disabled={togglingReply}
          aria-label="Toggle auto-reply"
        />
      </div>

      {/* Add a comment */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
        <p className="text-xs font-semibold">Drop a real comment here — the agent will answer it</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Paste anything a follower might say (in any language) and watch the agent handle it.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Commenter name (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} className="min-h-[40px] flex-none text-xs sm:w-44" />
          <Input
            placeholder="e.g. السعر كام؟ وهل بتوصلو للمنصورة؟"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void addComment()
              }
            }}
            className="min-h-[40px] flex-1 text-xs"
          />
          <Button onClick={() => void addComment()} disabled={adding || !text.trim()} className="min-h-[40px]">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {adding ? 'Thinking…' : 'Ask the agent'}
          </Button>
        </div>
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the inbox…
        </div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">No comments yet — drop one above and see the agent reply.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const s = SENTIMENT[c.sentiment] ?? SENTIMENT.neutral
            const busy = busyId === c.id
            return (
              <div key={c.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-border/60 bg-background/60 text-[10px] font-bold" aria-hidden>
                      {(c.author || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold">{c.author || 'A follower'}</span>
                    <Badge variant="outline" className={cn('text-[10px]', s.cls)}>{s.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-red-300" onClick={() => void removeComment(c)} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Delete comment</span>
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{c.text}</p>

                {c.aiReply ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      <Sparkles className="h-3 w-3" aria-hidden /> The agent&apos;s reply
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">{c.aiReply}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 min-h-[30px] px-2.5 text-[11px]" onClick={() => void copyReply(c)}>
                        <Copy className="h-3 w-3" aria-hidden /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 min-h-[30px] px-2.5 text-[11px] text-muted-foreground" onClick={() => void act(c, 'draft')} disabled={busy}>
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />} Re-draft
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 min-h-[30px] px-2.5 text-[11px] text-muted-foreground" onClick={() => void act(c, 'dismiss')} disabled={busy}>
                        <X className="h-3 w-3" aria-hidden /> Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-3 min-h-[34px] text-[11px]" onClick={() => void act(c, 'draft')} disabled={busy}>
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />} Draft a reply
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
