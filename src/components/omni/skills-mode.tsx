'use client'

/**
 * NEXUS One — Agent Skills browser (CLI-Anything catalog).
 *
 * A premium dark, full-height directory of the 79 vendored agent skills that
 * let NEXUS drive real software (Blender, GIMP, Obsidian, LibreOffice, n8n,
 * Zoom, mailchimp, browser automation…). The list is fetched once from
 * GET /api/skills and cached in state; search (debounced 250ms) + category
 * chips filter it live. Opening a card loads the full SKILL.md manual from
 * GET /api/skills/doc, shown in a dialog with the install command, homepage
 * and a "Use this skill in chat" hand-off into the composer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  Box,
  Bug,
  Check,
  Copy,
  Database,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  Gamepad2,
  GitBranch,
  Globe,
  HardDrive,
  Image as ImageIcon,
  KanbanSquare,
  Loader2,
  MessageCircle,
  MessageSquare,
  Music,
  Network,
  Palette,
  Puzzle,
  Radio,
  Search,
  Server,
  Sparkles,
  Terminal,
  Video,
  Wand2,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { tint } from '@/components/nexus/shared'
import type { CliSkill } from '@/lib/cli-skills'
import { resolveSkillAction } from '@/lib/skill-map'

/** localStorage key for the installed-skills set. */
const INSTALLED_KEY = 'nexus-installed-skills'

/** Read the installed set (safe for SSR). */
function readInstalled(): Set<string> {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY)
    return new Set(Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

/** Persist the installed set. */
function writeInstalled(set: Set<string>) {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify([...set]))
  } catch {
    /* storage unavailable */
  }
}

export interface SkillsModeProps {
  /** hand a pre-filled prompt to the chat composer and navigate there */
  onUseInChat?: (prompt: string) => void
}

/* ------------------------------------------------------------------ */
/* Category presentation — icon + tasteful pastel hue per category     */
/* ------------------------------------------------------------------ */

const CATEGORY_META: Record<string, { icon: LucideIcon; color: string }> = {
  '3d': { icon: Box, color: '#fbbf24' },
  ai: { icon: Sparkles, color: '#f5a623' },
  audio: { icon: AudioLines, color: '#34d399' },
  automation: { icon: Workflow, color: '#a3e635' },
  communication: { icon: MessageSquare, color: '#2dd4bf' },
  database: { icon: Database, color: '#4ade80' },
  debugging: { icon: Bug, color: '#f87171' },
  design: { icon: Palette, color: '#f472b6' },
  devops: { icon: Server, color: '#fb923c' },
  diagrams: { icon: GitBranch, color: '#c084fc' },
  finance: { icon: DollarSign, color: '#f5d08c' },
  game: { icon: Gamepad2, color: '#ff8a80' },
  gamedev: { icon: Gamepad2, color: '#ff8a80' },
  generation: { icon: Wand2, color: '#fbbf24' },
  graphics: { icon: ImageIcon, color: '#f9a8d4' },
  image: { icon: ImageIcon, color: '#fda4af' },
  knowledge: { icon: BookOpen, color: '#6ee7b7' },
  'knowledge-management': { icon: BookOpen, color: '#6ee7b7' },
  music: { icon: Music, color: '#e879f9' },
  network: { icon: Network, color: '#5eead4' },
  office: { icon: FileText, color: '#fcd34d' },
  osint: { icon: Eye, color: '#fca5a5' },
  'project-management': { icon: KanbanSquare, color: '#f0abfc' },
  science: { icon: FlaskConical, color: '#86efac' },
  scientific: { icon: FlaskConical, color: '#86efac' },
  search: { icon: Search, color: '#fdba74' },
  streaming: { icon: Radio, color: '#fda4af' },
  testing: { icon: FlaskConical, color: '#bef264' },
  video: { icon: Video, color: '#fb7185' },
  web: { icon: Globe, color: '#2dd4bf' },
  storage: { icon: HardDrive, color: '#d4d4d8' },
  general: { icon: Terminal, color: '#a1a1aa' },
}

const FALLBACK_META: { icon: LucideIcon; color: string } = { icon: Puzzle, color: '#a1a1aa' }

/** Categories shown before the "+N more" expander. */
const TOP_CATEGORIES = 12

function categoryMeta(category: string): { icon: LucideIcon; color: string } {
  return CATEGORY_META[category.toLowerCase()] ?? FALLBACK_META
}

function categoryLabel(category: string): string {
  const c = category.toLowerCase()
  if (c === 'ai') return 'AI'
  if (c === '3d') return '3D'
  if (c === 'osint') return 'OSINT'
  if (c === 'gamedev') return 'Game Dev'
  if (c === 'devops') return 'DevOps'
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function SkillsMode({ onUseInChat }: SkillsModeProps) {
  const { toast } = useToast()

  /* ---------------- installed skills (localStorage) ---------------- */
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  useEffect(() => {
    setInstalled(readInstalled())
  }, [])
  const toggleInstall = useCallback(
    (skill: CliSkill) => {
      setInstalled((prev) => {
        const next = new Set(prev)
        if (next.has(skill.name)) {
          next.delete(skill.name)
          toast({ title: `${skill.displayName} uninstalled` })
        } else {
          next.add(skill.name)
          toast({
            title: `${skill.displayName} installed`,
            description: `Ready in chat — runs ${resolveSkillAction(skill.name, skill.category).label.toLowerCase()} for free.`,
          })
        }
        writeInstalled(next)
        return next
      })
    },
    [toast]
  )

  /* ---------------- catalog (fetched once, cached) ---------------- */
  const [skills, setSkills] = useState<CliSkill[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  /* ---------------- filters ---------------- */
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [showAllCats, setShowAllCats] = useState(false)

  /* ---------------- detail dialog ---------------- */
  const [detail, setDetail] = useState<CliSkill | null>(null)
  const [doc, setDoc] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'name' | 'cmd' | null>(null)

  /* Fetch the catalog (deferred via setTimeout — codebase idiom). */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/skills')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          skills?: CliSkill[]
          total?: number
          categories?: string[]
        }
        if (cancelled) return
        const rows = Array.isArray(data.skills) ? data.skills : []
        setSkills(rows)
        setCategories(Array.isArray(data.categories) ? data.categories : [])
        setTotal(typeof data.total === 'number' ? data.total : rows.length)
        setLoadError(false)
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [reloadKey])

  /* Debounce the search input 250ms so typing stays snappy. */
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [rawQuery])

  /* Load the SKILL.md manual whenever a skill detail opens. */
  useEffect(() => {
    if (!detail) return
    let cancelled = false
    setDoc('')
    setDocError(null)
    setDocLoading(true)
    const load = async () => {
      try {
        const res = await fetch(`/api/skills/doc?name=${encodeURIComponent(detail.name)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { doc?: string }
        if (cancelled) return
        setDoc(typeof data.doc === 'string' ? data.doc : '')
      } catch {
        if (!cancelled) setDocError('Could not load the manual. Please try again.')
      } finally {
        if (!cancelled) setDocLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [detail])

  /* Live client-side filter over the cached list. */
  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    return skills.filter((s) => {
      if (category && s.category !== category) return false
      if (tokens.length === 0) return true
      const haystack = `${s.name} ${s.displayName} ${s.description} ${s.category}`.toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
  }, [skills, query, category])

  /* Category counts (for the chips), popular categories first. The rail
   * shows the top few by default (plus the active one) and expands on
   * demand — 31 wrapped chips would eat the whole grid otherwise. */
  const sortedCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of skills) counts.set(s.category, (counts.get(s.category) ?? 0) + 1)
    return categories
      .slice()
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
  }, [skills, categories])

  const visibleCategories = useMemo(() => {
    if (showAllCats) return sortedCategories
    const top = sortedCategories.slice(0, TOP_CATEGORIES)
    if (category && !top.includes(category)) return [...top, category]
    return top
  }, [showAllCats, sortedCategories, category])

  const hiddenCatCount = Math.max(0, sortedCategories.length - visibleCategories.length)

  const countLabel =
    filtered.length === total || !total ? `${total} skills` : `${filtered.length} of ${total}`

  /* ---------------- actions ---------------- */

  const copyText = useCallback(
    async (text: string, kind: 'name' | 'cmd') => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(kind)
        toast({ title: kind === 'name' ? 'Skill name copied' : 'Install command copied' })
        setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000)
      } catch {
        toast({ title: 'Copy failed', description: 'Clipboard access was blocked.', variant: 'destructive' })
      }
    },
    [toast]
  )

  const useInChat = useCallback(
    (skill: CliSkill) => {
      setDetail(null)
      onUseInChat?.(`Use the "${skill.name}" skill to help me: `)
    },
    [onUseInChat]
  )

  const clearFilters = () => {
    setRawQuery('')
    setQuery('')
    setCategory(null)
  }

  /* ---------------- render ---------------- */

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Toolbar: title, count badge, search, category chips */}
      <div className="shrink-0 border-b border-white/8 px-4 py-4 md:px-5">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
                  Agent Skills
                </h2>
                <span
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-400"
                  aria-live="polite"
                >
                  {countLabel}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-zinc-500">
                {total || 79} CLI-Anything skills that let NEXUS control real apps — Blender, GIMP,
                Obsidian, LibreOffice, browser automation, n8n, Zoom, mailchimp and more.
              </p>
            </div>

            {/* Search (debounced 250ms, filters live) */}
            <div className="lg:w-80 lg:shrink-0">
              <div className="flex h-11 items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3.5 transition focus-within:border-[#ff5a5f]/45 focus-within:shadow-[0_0_0_4px_rgba(255,90,95,0.08)]">
                <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <input
                  value={rawQuery}
                  onChange={(e) => setRawQuery(e.target.value)}
                  type="search"
                  placeholder="Search skills — try “blender” or “browser”…"
                  aria-label="Search skills"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                {rawQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawQuery('')
                      setQuery('')
                    }}
                    aria-label="Clear search"
                    className="rounded-lg p-1 text-zinc-500 transition hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Category chips — scrollable rail on mobile, wrapped on desktop.
              Top categories first; "+N more" expands the long tail. */}
          <div
            className="nx-rail -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 md:flex-wrap"
            role="tablist"
            aria-label="Filter by category"
          >
            <CategoryChip
              active={category === null}
              label="All"
              count={skills.length}
              onClick={() => setCategory(null)}
            />
            {visibleCategories.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                label={categoryLabel(c)}
                count={skills.filter((s) => s.category === c).length}
                color={categoryMeta(c).color}
                icon={categoryMeta(c).icon}
                onClick={() => setCategory(category === c ? null : c)}
              />
            ))}
            {(hiddenCatCount > 0 || showAllCats) && (
              <button
                type="button"
                onClick={() => setShowAllCats((v) => !v)}
                aria-expanded={showAllCats}
                className="flex min-h-[34px] shrink-0 items-center rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
              >
                {showAllCats ? 'Show less' : `+${hiddenCatCount} more`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable skill grid */}
      <div className="nx-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-4 md:p-5">
          {loading ? (
            <SkeletonGrid />
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertTriangle className="h-9 w-9 text-zinc-600" aria-hidden />
              <div>
                <p className="text-sm font-medium text-zinc-300">Couldn&rsquo;t load the skills catalog</p>
                <p className="mt-1 text-xs text-zinc-500">Check your connection and try again.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  setReloadKey((k) => k + 1)
                }}
                className="nx-gradient-surface rounded-full px-4 py-1.5 text-xs font-semibold"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <SkillCard
                  key={s.name}
                  skill={s}
                  installed={installed.has(s.name)}
                  onToggleInstall={() => toggleInstall(s)}
                  onOpen={() => setDetail(s)}
                />
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-3 py-16 text-center">
                  <Puzzle className="h-9 w-9 text-zinc-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">No skills match — try another word</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Search &ldquo;blender&rdquo;, &ldquo;browser&rdquo;, &ldquo;notes&rdquo;… or clear the filters.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="nx-gradient-surface rounded-full px-4 py-1.5 text-xs font-semibold"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <SkillDetailDialog
        skill={detail}
        doc={doc}
        docLoading={docLoading}
        docError={docError}
        copied={copied}
        onClose={() => setDetail(null)}
        onCopy={copyText}
        onUseInChat={useInChat}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Category filter chip                                                */
/* ------------------------------------------------------------------ */

function CategoryChip({
  active,
  label,
  count,
  color,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  color?: string
  icon?: LucideIcon
  onClick: () => void
}) {
  const accent = color ?? '#ff5a5f'
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? 'text-white'
          : 'border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
      }`}
      style={active ? { background: tint(accent, 0.2), borderColor: tint(accent, 0.6) } : undefined}
    >
      {Icon ? <Icon className="h-3 w-3" style={{ color: active ? accent : undefined }} aria-hidden /> : null}
      {label}
      <span className="text-[9px] font-semibold text-zinc-500">{count}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Skill card                                                          */
/* ------------------------------------------------------------------ */

function SkillCard({
  skill,
  installed,
  onToggleInstall,
  onOpen,
}: {
  skill: CliSkill
  installed: boolean
  onToggleInstall: () => void
  onOpen: () => void
}) {
  const { icon: Icon, color } = categoryMeta(skill.category)
  const action = resolveSkillAction(skill.name, skill.category)

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`View the ${skill.displayName} skill manual`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="nx-glow-card group relative flex cursor-pointer flex-col p-4 text-left outline-none focus-visible:border-[#ff5a5f]/50 focus-visible:shadow-[0_0_0_4px_rgba(255,90,95,0.10)]"
    >
      {/* installed glow edge */}
      <AnimatePresence>
        {installed && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ boxShadow: 'inset 0 0 0 1.5px rgba(52,211,153,0.45)' }}
          />
        )}
      </AnimatePresence>

      <div className="flex items-start gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: tint(color, 0.12), border: `1px solid ${tint(color, 0.28)}` }}
          aria-hidden
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100" title={skill.displayName}>
            {skill.displayName}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tint(color, 0.14), color }}
            >
              {categoryLabel(skill.category)}
            </span>
            {/* Cloud-executable badge — every skill maps to a free action */}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              <Zap className="h-2.5 w-2.5" aria-hidden />
              {action.chip}
            </span>
          </div>
        </div>
        {/* Install toggle */}
        <button
          type="button"
          aria-pressed={installed}
          aria-label={installed ? `Uninstall ${skill.displayName}` : `Install ${skill.displayName}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleInstall()
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition"
          style={
            installed
              ? { borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.12)' }
              : { borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)' }
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {installed ? (
              <motion.span
                key="on"
                initial={{ scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="grid place-items-center"
              >
                <Check className="h-4 w-4 text-emerald-400" aria-hidden />
              </motion.span>
            ) : (
              <motion.span
                key="off"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                className="grid place-items-center"
              >
                <Wand2 className="h-4 w-4 text-zinc-500 transition group-hover:text-[#ff8a8d]" aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <p className="mt-2.5 line-clamp-3 min-h-[3.4rem] text-xs leading-relaxed text-zinc-400">
        {skill.description || 'No description provided.'}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="pointer-events-none flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition group-hover:border-[#ff5a5f]/40 group-hover:text-[#ff8a8d]">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          View manual
        </span>
        {skill.requires ? (
          <span
            className="max-w-[52%] truncate text-[10px] text-zinc-600"
            title={`Requires ${skill.requires}`}
          >
            needs {skill.requires}
          </span>
        ) : null}
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Detail dialog — manual, install command, hand-off to chat           */
/* ------------------------------------------------------------------ */

function SkillDetailDialog({
  skill,
  doc,
  docLoading,
  docError,
  copied,
  onClose,
  onCopy,
  onUseInChat,
}: {
  skill: CliSkill | null
  doc: string
  docLoading: boolean
  docError: string | null
  copied: 'name' | 'cmd' | null
  onClose: () => void
  onCopy: (text: string, kind: 'name' | 'cmd') => void
  onUseInChat: (skill: CliSkill) => void
}) {
  const { icon: Icon, color } = skill ? categoryMeta(skill.category) : FALLBACK_META

  return (
    <Dialog open={!!skill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88vh] flex-col overflow-hidden border-white/10 bg-[#0c0c0e] p-0 text-zinc-100 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{skill ? `${skill.displayName} — skill manual` : 'Skill manual'}</DialogTitle>
          <DialogDescription>
            Full SKILL.md manual, install command and usage details for this CLI-Anything skill.
          </DialogDescription>
        </DialogHeader>

        {skill && (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-start gap-3 border-b border-white/8 px-5 py-4">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{ background: tint(color, 0.12), border: `1px solid ${tint(color, 0.28)}` }}
                aria-hidden
              >
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-zinc-100">{skill.displayName}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: tint(color, 0.14), color }}
                  >
                    {categoryLabel(skill.category)}
                  </span>
                  <code className="font-mono text-[11px] text-zinc-500">{skill.name}</code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onCopy(skill.name, 'name')}
                aria-label="Copy skill name"
                title="Copy skill name"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:border-white/25 hover:text-zinc-100"
              >
                {copied === 'name' ? (
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close skill details"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Actions + install + meta */}
            <div className="shrink-0 space-y-3 border-b border-white/8 px-5 py-4">
              {/* Cloud-action mapping banner */}
              {(() => {
                const action = resolveSkillAction(skill.name, skill.category)
                return (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3">
                    <motion.span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-lg"
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    >
                      {action.emoji}
                    </motion.span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-emerald-300">
                        Runs in NEXUS cloud — free
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                        Mapped to: {action.label.replace(' with FLUX', '')} · {action.chip}
                      </p>
                    </div>
                    <Zap className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  </div>
                )
              })()}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onUseInChat(skill)}
                  className="nx-gradient-surface flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Use this skill in chat
                </button>
                <button
                  type="button"
                  onClick={() => onCopy(skill.name, 'name')}
                  className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium text-zinc-300 transition hover:border-white/30 hover:bg-white/5"
                >
                  {copied === 'name' ? (
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  Copy name
                </button>
              </div>

              {skill.installCmd && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Install command
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5">
                    <code className="nx-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-zinc-300">
                      {skill.installCmd}
                    </code>
                    <button
                      type="button"
                      onClick={() => onCopy(skill.installCmd as string, 'cmd')}
                      aria-label="Copy install command"
                      title="Copy install command"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/8 hover:text-zinc-100"
                    >
                      {copied === 'cmd' ? (
                        <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {(skill.requires || skill.homepage) && (
                <div className="flex flex-col gap-1.5 text-xs text-zinc-500 sm:flex-row sm:flex-wrap sm:gap-x-5">
                  {skill.requires && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400/80" aria-hidden />
                      <span className="truncate">
                        Requires: <span className="text-zinc-400">{skill.requires}</span>
                      </span>
                    </span>
                  )}
                  {skill.homepage && (
                    <a
                      href={skill.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-1.5 text-[#ff8a8d] transition hover:text-[#ffb3b5] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {hostOf(skill.homepage)}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* SKILL.md manual */}
            <div className="nx-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                SKILL.md manual
              </p>
              {docLoading ? (
                <DocSkeleton />
              ) : docError ? (
                <p className="rounded-xl border border-[#ff5a5f]/25 bg-[#ff5a5f]/5 px-4 py-3 text-xs text-[#ff8a8d]">
                  {docError}
                </p>
              ) : doc ? (
                <DocBody doc={doc} />
              ) : (
                <p className="text-xs leading-relaxed text-zinc-500">
                  No manual text is available for this skill — the metadata above is everything the
                  catalog ships.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Loading skeletons                                                   */
/* ------------------------------------------------------------------ */

function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      aria-hidden
      aria-label="Loading skills"
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="nx-glow-card p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-white/8" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/8" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2.5 w-full animate-pulse rounded bg-white/5" />
            <div className="h-2.5 w-5/6 animate-pulse rounded bg-white/5" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-white/5" />
          </div>
          <div className="mt-4 h-7 w-24 animate-pulse rounded-lg bg-white/5" />
        </div>
      ))}
    </div>
  )
}

function DocSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden aria-label="Loading manual">
      {[6, 5, 6, 4, 5, 6, 3, 5].map((w, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${w * 16}%` }} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SKILL.md rendering — light markdown (headings, fences, lists, bold, */
/* inline code, tables). Kept intentionally dependency-free.           */
/* ------------------------------------------------------------------ */

function stripFrontmatter(doc: string): string {
  if (!doc.startsWith('---')) return doc
  const end = doc.indexOf('\n---', 3)
  if (end === -1) return doc
  return doc
    .slice(end + 4)
    .replace(/^\s*\n/, '')
}

function inline(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((t) => t.length > 0)
    .map((t, i) => {
      if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
        return (
          <strong key={i} className="font-semibold text-zinc-100">
            {t.slice(2, -2)}
          </strong>
        )
      }
      if (t.startsWith('`') && t.endsWith('`') && t.length > 2) {
        return (
          <code key={i} className="rounded bg-white/8 px-1 py-0.5 font-mono text-[11px] text-[#ffb3b5]">
            {t.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{t}</span>
    })
}

function DocBody({ doc }: { doc: string }) {
  const body = stripFrontmatter(doc)
  /* Split on ``` fences — odd chunks are code blocks. */
  const chunks = body.split(/```/)

  return (
    <div className="space-y-3">
      {chunks.map((chunk, ci) =>
        ci % 2 === 1 ? (
          <pre
            key={ci}
            className="nx-scroll overflow-x-auto rounded-xl border border-white/8 bg-black/50 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300"
          >
            {chunk.replace(/^[a-zA-Z0-9_-]*\n/, '')}
          </pre>
        ) : (
          <div key={ci} className="space-y-1.5">
            {chunk.split('\n').map((line, li) => {
              const trimmed = line.trim()
              if (!trimmed) return <div key={li} className="h-1.5" aria-hidden />

              /* headings */
              const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
              if (heading) {
                const level = heading[1].length
                return (
                  <p
                    key={li}
                    className={
                      level === 1
                        ? 'pt-2 text-sm font-bold text-zinc-100'
                        : level === 2
                          ? 'pt-2 text-[13px] font-semibold text-zinc-100'
                          : 'pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-400'
                    }
                  >
                    {inline(heading[2])}
                  </p>
                )
              }

              /* bullet / numbered lists */
              const bullet = trimmed.match(/^[-*]\s+(.*)$/)
              if (bullet) {
                return (
                  <p key={li} className="flex gap-2 text-xs leading-relaxed text-zinc-300">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#ff5a5f]/70" aria-hidden />
                    <span>{inline(bullet[1])}</span>
                  </p>
                )
              }
              const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/)
              if (numbered) {
                return (
                  <p key={li} className="flex gap-2 text-xs leading-relaxed text-zinc-300">
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500" aria-hidden>
                      {trimmed.match(/^\d+/)?.[0]}
                    </span>
                    <span>{inline(numbered[1])}</span>
                  </p>
                )
              }

              /* markdown tables — monospace keeps the columns aligned */
              if (trimmed.startsWith('|')) {
                const isSeparator = /^\|[\s:-]+\|$/.test(trimmed.replace(/\|/g, '|'))
                return (
                  <p
                    key={li}
                    className={`whitespace-pre font-mono text-[11px] leading-relaxed ${
                      isSeparator ? 'text-zinc-600' : 'text-zinc-400'
                    }`}
                  >
                    {trimmed}
                  </p>
                )
              }

              /* blockquote */
              if (trimmed.startsWith('>')) {
                return (
                  <p
                    key={li}
                    className="border-l-2 border-[#ff5a5f]/40 pl-3 text-xs italic leading-relaxed text-zinc-400"
                  >
                    {inline(trimmed.replace(/^>\s?/, ''))}
                  </p>
                )
              }

              /* paragraph */
              return (
                <p key={li} className="text-xs leading-relaxed text-zinc-300">
                  {inline(trimmed)}
                </p>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
