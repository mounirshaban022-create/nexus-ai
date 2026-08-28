'use client'

/**
 * NEXUS One — chat subcomponents used by NexusChat:
 * agent avatars, agent_assign handoff pills, expandable tool cards,
 * the animated skill-run card and attachment renderers (image / live video
 * job / document / code / sources / speech).
 * Every field coming off the wire is guarded — attachments are `unknown`.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  FileText,
  Link2,
  Loader2,
  Play,
  RefreshCcw,
  Sparkles,
  Terminal,
  Volume2,
  X,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { AgentAssignEvent, AgentMeta, SkillRunEvent } from './shared'
import { BrandMark, DIVISION_MAP, tint, toolLabel } from './shared'

/* ------------------------------------------------------------------ */
/* Small guarded readers                                               */
/* ------------------------------------------------------------------ */

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

/** Accepts an already-parsed object or a JSON string. */
function parseRecord(v: unknown): Record<string, unknown> | null {
  const direct = asRecord(v)
  if (direct) return direct
  if (typeof v === 'string' && v.trim()) {
    try {
      return asRecord(JSON.parse(v))
    } catch {
      return null
    }
  }
  return null
}

export function formatBytes(v: unknown): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : NaN
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ */
/* Agent avatar — emoji in a division-tinted tile, BrandMark for NEXUS  */
/* ------------------------------------------------------------------ */

export function AgentAvatar({
  agent,
  size = 32,
  className = '',
}: {
  agent: AgentMeta
  size?: number
  className?: string
}) {
  const division = DIVISION_MAP[agent.division]
  const isNexus = agent.slug === '__nexus'
  const bg = isNexus ? 'rgba(255,255,255,0.06)' : tint(division?.color ?? '#ff5a5f', 0.14)
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg ${className}`}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {isNexus ? (
        <BrandMark size={Math.round(size * 0.66)} />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.52), lineHeight: 1 }}>{agent.emoji}</span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Handoff pill — rendered above the assistant reply it announces       */
/* ------------------------------------------------------------------ */

export function HandoffPill({ assign, live = false }: { assign: AgentAssignEvent; live?: boolean }) {
  const { t } = useI18n()
  const division = assign.division ? DIVISION_MAP[assign.division] : undefined
  const color =
    division?.color ?? (typeof assign.color === 'string' && assign.color ? assign.color : '#ff5a5f')
  return (
    <div
      role="status"
      className="nx-rise relative flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-1.5 text-xs"
      style={{ backgroundColor: tint(color, 0.1), borderColor: tint(color, 0.28) }}
    >
      {live && <span className="nx-shimmer pointer-events-none absolute inset-0 rounded-xl" aria-hidden />}
      <span aria-hidden className="shrink-0 text-sm leading-none">
        {assign.emoji || '◆'}
      </span>
      <span className="shrink-0 font-semibold" style={{ color }}>
        {assign.name}
      </span>
      {assign.divisionLabel ? (
        <span className="hidden shrink-0 text-muted-foreground/80 sm:inline">· {assign.divisionLabel}</span>
      ) : null}
      <span className="shrink-0 text-muted-foreground/80">{t('chat.tookOver')}</span>
      {assign.reason ? (
        <span className="hidden min-w-0 truncate text-muted-foreground/80 md:inline">— {assign.reason}</span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tool card — running pill / expandable done chip                      */
/* ------------------------------------------------------------------ */

/** Human summary of a tool call: args (from tool_start) + result JSON. */
function toolSummaryLines(
  tool: string,
  args?: Record<string, unknown> | null,
  data?: string | null,
): string[] {
  const lines: string[] = []
  const a = args ?? {}
  const r = parseRecord(data) ?? {}
  const first = (obj: Record<string, unknown>, ...keys: string[]): string => {
    for (const k of keys) {
      const v = str(obj[k])
      if (v) return v
    }
    return ''
  }

  if (tool === 'browser_action') {
    const action = first(r, 'action') || first(a, 'action')
    const target = first(r, 'url') || first(a, 'url') || first(r, 'target') || first(a, 'selector') || first(r, 'key')
    if (action) lines.push(`action: ${action}`)
    if (target) lines.push(target)
    const out = first(r, 'output')
    if (out) lines.push(out.slice(0, 300))
  } else if (tool === 'run_command') {
    const cmd = first(a, 'command')
    if (cmd) lines.push(`$ ${cmd}`)
    const out = first(r, 'stdout') || first(r, 'stderr')
    if (out) lines.push(out.split('\n').slice(0, 6).join('\n').slice(0, 400))
  } else if (tool === 'web_search') {
    const q = first(a, 'query') || first(r, 'query')
    if (q) lines.push(`query: ${q}`)
    const results = Array.isArray(r.results) ? r.results : []
    for (const item of results.slice(0, 3)) {
      const rec = asRecord(item)
      if (!rec) continue
      const title = str(rec.title)
      if (title) lines.push(`• ${title}${str(rec.url) ? ` — ${str(rec.url)}` : ''}`)
    }
  } else if (tool === 'send_email' || tool === 'send_whatsapp') {
    const to = first(r, 'to') || first(a, 'to')
    if (to) lines.push(`to: ${to}`)
    const subject = first(a, 'subject')
    if (subject) lines.push(`subject: ${subject}`)
    if (str(r.sent) || r.sent === true) lines.push('sent ✓')
  } else if (tool === 'generate_image' || tool === 'generate_video') {
    const prompt = first(a, 'prompt')
    if (prompt) lines.push(`prompt: ${prompt}`)
    const url = first(r, 'imageUrl') || first(r, 'url')
    if (url) lines.push(url)
  } else if (tool === 'run_code') {
    const lang = first(a, 'language')
    if (lang) lines.push(`language: ${lang}`)
    const out = first(r, 'stdout') || first(r, 'stderr')
    if (out) lines.push(out.split('\n').slice(0, 6).join('\n').slice(0, 400))
  } else {
    const keys = Object.keys(r).slice(0, 4)
    for (const k of keys) {
      const v = r[k]
      if (v == null) continue
      const text = typeof v === 'string' ? v : JSON.stringify(v)
      if (text) lines.push(`${k}: ${text.slice(0, 160)}`)
    }
  }

  if (lines.length === 0 && data) lines.push(data.slice(0, 240))
  return lines.slice(0, 8)
}

export interface ToolCardInfo {
  tool: string
  status: 'running' | 'done' | 'error'
  message?: string
  args?: Record<string, unknown> | null
  data?: string | null
}

export function ToolCard({ info }: { info: ToolCardInfo }) {
  const [open, setOpen] = useState(false)
  const label = toolLabel(info.tool)

  /* Running: compact pill with spinner + elapsed hint. */
  if (info.status === 'running') {
    return (
      <div
        className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
        role="status"
        aria-label={label}
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#ff5a5f]" aria-hidden />
        <span className="shrink-0">{label}</span>
        {info.message ? (
          <span className="min-w-0 max-w-[240px] truncate text-muted-foreground/80 sm:max-w-xs">{info.message}</span>
        ) : null}
      </div>
    )
  }

  /* Finished: done chip, expandable to the call summary. */
  const lines = toolSummaryLines(info.tool, info.args, info.data)
  const error = info.status === 'error'
  return (
    <div className="w-full max-w-md">
      <button
        type="button"
        onClick={() => lines.length > 0 && setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
          error
            ? 'border-red-500/25 bg-red-500/10 text-red-300'
            : 'border-border bg-muted/50 text-muted-foreground/80 hover:text-muted-foreground'
        }`}
      >
        {error ? (
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
        )}
        <span className="shrink-0">{error ? `${label} failed` : label}</span>
        {lines.length > 0 ? (
          <ChevronDown
            className={`ms-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        ) : null}
      </button>
      {open && lines.length > 0 ? (
        <div className="nx-rise mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {lines.join('\n')}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Video job card — polls /api/video/status until done or error         */
/* ------------------------------------------------------------------ */

const VIDEO_STATUS_LABEL: Record<string, string> = {
  planning: 'Planning scenes',
  rendering: 'Rendering scenes',
  assembling: 'Assembling video',
  encoding: 'Encoding video',
  done: 'Done',
  error: 'Failed',
}

function VideoJobCard({
  jobId,
  title,
  initialStatus,
  initialProgress,
  initialMessage,
}: {
  jobId: string
  title: string
  initialStatus: string
  initialProgress: number
  initialMessage: string
}) {
  const [state, setState] = useState({
    status: initialStatus || 'planning',
    progress: initialProgress,
    message: initialMessage,
    url: '',
    error: '',
  })
  const missesRef = useRef(0)
  const finished = state.status === 'done' || state.status === 'error'

  useEffect(() => {
    if (finished) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status/${encodeURIComponent(jobId)}`)
        if (cancelled) return
        if (res.status === 404) {
          // Jobs live in server memory — a restart loses them.
          missesRef.current += 1
          if (missesRef.current >= 3) {
            setState((s) => ({
              ...s,
              status: 'error',
              error: 'Video job not found — the server may have restarted. Ask NEXUS to generate it again.',
            }))
          }
          return
        }
        if (!res.ok) return
        missesRef.current = 0
        const data = (await res.json().catch(() => null)) as { job?: unknown } | null
        const job = asRecord(data?.job)
        if (cancelled || !job) return
        setState((s) => ({
          status: str(job.status) || s.status,
          progress: num(job.progress, s.progress),
          message: str(job.message),
          url: str(job.url),
          error: str(job.error),
        }))
      } catch {
        /* transient network error — keep polling */
      }
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [jobId, finished])

  if (state.status === 'done' && state.url) {
    return (
      <figure className="w-full max-w-sm">
        <video
          controls
          preload="metadata"
          src={state.url}
          className="w-full rounded-xl border border-border bg-black"
        />
        <figcaption className="mt-1.5 truncate text-[11px] text-muted-foreground/80">{title || 'Generated video'}</figcaption>
      </figure>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="w-full max-w-sm rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-red-300">
          <Clapperboard className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{title || 'Video'}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-red-300/70">
          {state.error || 'Video generation failed.'}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
          <RefreshCcw className="h-3 w-3" aria-hidden /> Ask NEXUS to try generating it again.
        </p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(3, state.progress))
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-muted/50 p-3" role="status">
      <div className="flex items-center gap-2.5">
        <span className="nx-gradient-surface grid h-9 w-9 shrink-0 place-items-center rounded-lg">
          <Clapperboard className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{title || 'Generating video'}</p>
          <p className="truncate text-[11px] text-muted-foreground/80">
            {state.message || VIDEO_STATUS_LABEL[state.status] || 'Working…'}
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">{Math.round(pct)}%</span>
      </div>
      <div className="nx-progress-track mt-2.5" aria-hidden>
        <div className="nx-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SkillRunCard — beautifully animated cloud-skill execution card      */
/* ------------------------------------------------------------------ */

/** Stage labels mapped from the action kind (mirrors skill-actions.ts). */
const SKILL_STAGES: Record<string, string[]> = {
  image: ['Understanding the brief', 'Composing the prompt', 'Painting with FLUX', 'Finishing touches'],
  diagram: ['Understanding the brief', 'Structuring the diagram', 'Drawing vectors', 'Finishing touches'],
  video: ['Planning scenes', 'Generating scene art', 'Recording AI narration', 'Cinematic edit'],
  doc: ['Understanding the task', 'Researching & writing', 'Formatting the file', 'Exporting'],
  sheet: ['Understanding the data', 'Building rows & formulas', 'Styling the workbook', 'Exporting'],
  slides: ['Understanding the story', 'Writing slide content', 'Designing layout', 'Exporting'],
  search: ['Parsing the question', 'Searching the live web', 'Ranking sources'],
  read: ['Fetching the page', 'Reading content', 'Summarizing'],
  speak: ['Preparing the script', 'Neural voice synthesis'],
  research: ['Searching the web', 'Analyzing findings', 'Writing the briefing', 'Exporting'],
}

/**
 * A premium execution card: pulsing icon ring while running, staged
 * checklist that ticks off with spring animations, success burst on
 * completion. framer-motion drives every transition.
 */
export function SkillRunCard({ info }: { info: SkillRunEvent }) {
  const [elapsed, setElapsed] = useState(0)
  const running = info.status === 'running'
  const error = info.status === 'error'

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])

  const stages = SKILL_STAGES[info.action] ?? ['Working']
  // Advance the visible stage with time (~2.4s per stage while running).
  const stageIdx = running ? Math.min(stages.length - 1, Math.floor(elapsed / 2.4)) : stages.length - 1

  const accent = error ? '#f87171' : running ? '#ff8a8d' : '#34d399'

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-muted/50 p-4"
      style={{ borderColor: `${accent}38` }}
      role="status"
      aria-label={`Skill ${info.skill} ${info.status}`}
    >
      {/* animated gradient wash */}
      {running && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(110deg, transparent 25%, rgba(255,138,141,0.10) 45%, rgba(255,42,104,0.12) 55%, transparent 75%)',
          }}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
        />
      )}

      <div className="relative flex items-center gap-3">
        {/* Icon with pulsing ring */}
        <div className="relative grid h-11 w-11 shrink-0 place-items-center">
          {running && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${accent}` }}
              initial={{ opacity: 0.6, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.55 }}
              transition={{ repeat: Infinity, duration: 1.15, ease: 'easeOut' }}
            />
          )}
          <span
            className="grid h-11 w-11 place-items-center rounded-full text-xl"
            style={{ backgroundColor: `${accent}1f`, border: `1px solid ${accent}45` }}
          >
            {error ? <X className="h-5 w-5" style={{ color: accent }} aria-hidden /> : info.emoji}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{info.skill}</p>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              {error ? 'failed' : running ? 'running' : 'done'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
            {info.actionLabel}
            {running && elapsed > 0 ? ` · ${elapsed}s` : ''}
          </p>
        </div>

        {running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: accent }} aria-hidden />
        ) : error ? null : (
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15"
          >
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          </motion.span>
        )}
      </div>

      {/* Stage checklist */}
      <ul className="relative mt-3 space-y-1.5" aria-hidden>
        {stages.map((label, i) => {
          const done = error ? i < stageIdx : i <= stageIdx && !running ? true : i < stageIdx
          const active = running && i === stageIdx
          return (
            <li key={label} className="flex items-center gap-2 text-[11px]">
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.span
                    key="done"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500/20"
                  >
                    <Check className="h-2.5 w-2.5 text-emerald-400" />
                  </motion.span>
                ) : active ? (
                  <motion.span
                    key="active"
                    className="block h-4 w-4 rounded-full"
                    style={{ border: `2px solid ${accent}` }}
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ repeat: Infinity, duration: 0.9 }}
                  />
                ) : (
                  <span key="idle" className="block h-4 w-4 rounded-full border-2 border-border" />
                )}
              </AnimatePresence>
              <span className={done ? 'text-muted-foreground' : active ? 'text-foreground' : 'text-muted-foreground/80'}>
                {label}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Task context line */}
      {info.task ? (
        <p className="relative mt-3 truncate rounded-lg bg-input px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground/80">
          {info.task}
        </p>
      ) : null}

      {/* Error detail */}
      {error && info.error ? (
        <p className="relative mt-2.5 rounded-lg bg-red-500/[0.07] px-2.5 py-1.5 text-[11px] leading-relaxed text-red-300/90">
          {info.error}
        </p>
      ) : null}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Speech attachment — free neural TTS player                          */
/* ------------------------------------------------------------------ */

function TtsAttachment({ text }: { text: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const synthesize = async () => {
    if (loading || audioUrl) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('Speech synthesis failed.')
      const blob = await res.blob()
      setAudioUrl(URL.createObjectURL(blob))
    } catch {
      setErr('Could not synthesize — try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-muted/50 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={synthesize}
          disabled={loading || Boolean(audioUrl)}
          className="nx-gradient-surface grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:brightness-110 disabled:opacity-70"
          aria-label="Play speech"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-[#ff8a8d]" aria-hidden />
            Neural speech
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{text}</p>
        </div>
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
      </div>
      {audioUrl ? (
        <motion.audio
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          controls
          autoPlay
          src={audioUrl}
          className="mt-2.5 w-full"
        >
          <track kind="captions" />
        </motion.audio>
      ) : null}
      {err ? <p className="mt-1.5 text-[11px] text-red-300/80">{err}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Attachments                                                          */
/* ------------------------------------------------------------------ */

function AttachmentCard({ item }: { item: unknown }) {
  const { t } = useI18n()
  const a = asRecord(item)
  if (!a) return null
  const type = str(a.type)

  /* Image — generated art, browser screenshots, … */
  if (type === 'image') {
    const url = str(a.url)
    if (!url) return null
    const title = str(a.title)
    return (
      <figure className="w-full max-w-sm">
        {/* Dynamic same-origin generated files — plain <img> is correct. */}
        <img
          src={url}
          alt={title || 'Generated image'}
          loading="lazy"
          className="w-full rounded-xl border border-border"
        />
        {title ? <figcaption className="mt-1.5 truncate text-[11px] text-muted-foreground/80">{title}</figcaption> : null}
      </figure>
    )
  }

  /* Video — live job card that polls until the file is ready. */
  if (type === 'video') {
    const jobId = str(a.videoJobId)
    if (!jobId) return null
    return (
      <VideoJobCard
        jobId={jobId}
        title={str(a.title)}
        initialStatus={str(a.status) || 'planning'}
        initialProgress={num(a.progress, 5)}
        initialMessage={str(a.note)}
      />
    )
  }

  /* Speech — free neural TTS player (skills 'speak' action). */
  if (type === 'tts') {
    const text = str(a.text)
    if (!text) return null
    return <TtsAttachment text={text} />
  }

  /* Document — Word / Excel / PowerPoint / PDF download card. */
  if (type === 'document') {
    const url = str(a.url)
    // Only allow http(s) absolute or same-origin relative URLs — a
    // server-supplied `javascript:`/`data:` href must never render.
    if (!url || !/^(https?:\/\/|\/)/i.test(url)) return null
    const title = str(a.title) || 'Document'
    const format = str(a.format).toUpperCase()
    const size = formatBytes(a.size)
    return (
      <a
        href={url}
        download
        aria-label={`${t('common.download')} ${title}`}
        className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 transition hover:border-[#ff5a5f]/35 hover:bg-muted/50"
      >
        <span className="nx-gradient-surface grid h-10 w-10 shrink-0 place-items-center rounded-lg">
          <FileText className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {format ? (
              <span className="rounded-full bg-accent px-1.5 py-0.5 font-medium text-muted-foreground">{format}</span>
            ) : null}
            {size ? <span>{size}</span> : null}
          </span>
        </span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
      </a>
    )
  }

  /* Code execution result. */
  if (type === 'code') {
    const language = str(a.language)
    const stdout = str(a.stdout) || str(a.stderr)
    const exit = a.exitCode
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-input p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-[#ff8a8d]" aria-hidden />
          <span className="truncate font-medium text-muted-foreground">Code result</span>
          {language ? (
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">{language}</span>
          ) : null}
          {typeof exit === 'number' ? (
            <span
              className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                exit === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-300'
              }`}
            >
              exit {exit}
            </span>
          ) : null}
        </div>
        {stdout ? (
          <pre className="nx-scroll mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {stdout}
          </pre>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground/80">No output.</p>
        )}
      </div>
    )
  }

  /* Web search sources. */
  if (type === 'search') {
    const results = Array.isArray(a.results) ? a.results : []
    if (results.length === 0) return null
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-muted/50 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Sources</p>
        <ul className="mt-2 space-y-1.5">
          {results.slice(0, 5).map((raw, i) => {
            const r = asRecord(raw)
            if (!r) return null
            const url = str(r.url)
            const title = str(r.title) || url
            return (
              <li key={i} className="flex min-w-0 items-start gap-1.5 text-xs">
                <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/80" aria-hidden />
                {url ? (
                  <a
                    href={/^(https?:\/\/|\/)/i.test(url) ? url : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-muted-foreground transition hover:text-foreground"
                  >
                    {title}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground/80">{title}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  /* Unknown — subtle generic chip. */
  const title = str(a.title) || type
  if (!title) return null
  return (
    <div className="flex max-w-sm items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground/80">
      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{title}</span>
    </div>
  )
}

export function AttachmentList({ items }: { items: unknown[] | undefined | null }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="mt-3 flex flex-col items-start gap-2.5">
      {items.map((item, i) => (
        <AttachmentCard key={i} item={item} />
      ))}
    </div>
  )
}
