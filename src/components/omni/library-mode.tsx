'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Library,
  Search,
  Image as ImageIcon,
  FileText,
  Film,
  Download,
  Trash2,
  Grid3x3,
  List as ListIcon,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

type ItemType = 'image' | 'document' | 'video'
type FilterId = 'all' | ItemType

interface LibItem {
  id: string
  type: ItemType
  name: string
  preview: string | null
  size: string
  url: string | null
  downloadUrl?: string | null
  createdAt: string
  status?: string
}

const TYPE_META: Record<ItemType, { label: string; icon: any }> = {
  image: { label: 'Image', icon: ImageIcon },
  document: { label: 'Document', icon: FileText },
  video: { label: 'Video', icon: Film },
}

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'document', label: 'Documents' },
]

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (!Number.isFinite(diff) || diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 4) return `${wk}w ago`
  return new Date(iso).toLocaleDateString()
}

export function LibraryMode() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const [items, setItems] = useState<LibItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/library', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = (await res.json()) as { items: LibItem[] }
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load library.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLibrary()
  }, [fetchLibrary])

  const handleDelete = useCallback(async (item: LibItem) => {
    setDeleting(item.id)
    try {
      const res = await fetch('/api/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, type: item.type }),
      })
      if (!res.ok) throw new Error('Delete failed')
      // Snappy local update — remove the item without a full refetch.
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleting(null)
    }
  }, [])

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchType = filter === 'all' || i.type === filter
      const matchQuery = !query || i.name.toLowerCase().includes(query.toLowerCase())
      return matchType && matchQuery
    })
  }, [items, query, filter])

  return (
    <div className="omni-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Everything you create — images, videos, and documents — saved automatically.
            </p>
          </div>
          <button
            onClick={() => void fetchLibrary()}
            disabled={loading}
            aria-label="Refresh library"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search + view toggle */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${view === 'grid' ? 'bg-secondary' : 'text-muted-foreground'}`}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${view === 'list' ? 'bg-secondary' : 'text-muted-foreground'}`}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex items-center gap-1 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === f.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="aspect-[4/3] w-full animate-pulse bg-secondary" />
                <div className="p-2.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
                  <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-destructive/60" />
            <h3 className="text-base font-medium">Couldn't load your library</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => void fetchLibrary()}
              className="mt-4 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-secondary"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Library className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-base font-medium">
              {items.length === 0 ? 'Nothing here yet' : 'No matches'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length === 0
                ? 'Images, videos, and documents you create will appear here.'
                : 'Try a different search or filter.'}
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map(item => {
              const Icon = TYPE_META[item.type].icon
              const downloadHref = item.downloadUrl || item.url || '#'
              return (
                <motion.div
                  key={`${item.type}-${item.id}`}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/30"
                >
                  {/* Preview */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                    {item.type === 'image' && item.preview ? (
                      <img
                        src={item.preview}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Icon className="h-8 w-8 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <a
                        href={downloadHref}
                        download
                        aria-label="Download"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground transition hover:bg-white"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => void handleDelete(item)}
                        disabled={deleting === item.id}
                        aria-label="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-destructive transition hover:bg-white disabled:opacity-50"
                      >
                        {deleting === item.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {TYPE_META[item.type].label}
                    </span>
                    {item.type === 'video' && item.status && item.status !== 'done' && (
                      <span className="absolute right-2 top-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white capitalize">
                        {item.status}
                      </span>
                    )}
                    {item.type === 'video' && item.status === 'error' && (
                      <span className="absolute right-2 top-2 rounded-md bg-destructive/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Failed
                      </span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium" title={item.name}>{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {item.size} · {timeAgo(item.createdAt)}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <AnimatePresence initial={false}>
              {filtered.map((item, idx) => {
                const Icon = TYPE_META[item.type].icon
                const downloadHref = item.downloadUrl || item.url || '#'
                return (
                  <motion.div
                    key={`${item.type}-${item.id}`}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`flex items-center gap-3 px-3 py-2.5 transition hover:bg-secondary ${idx > 0 ? 'border-t border-border/60' : ''}`}
                  >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                      {item.type === 'image' && item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {TYPE_META[item.type].label} · {item.size}
                        {item.type === 'video' && item.status && item.status !== 'done'
                          ? ` · ${item.status}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={downloadHref}
                        download
                        aria-label="Download"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => void handleDelete(item)}
                        disabled={deleting === item.id}
                        aria-label="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-destructive disabled:opacity-50"
                      >
                        {deleting === item.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
