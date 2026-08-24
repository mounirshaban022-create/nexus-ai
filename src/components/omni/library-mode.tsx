'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Library,
  Search,
  Image as ImageIcon,
  FileText,
  Film,
  AudioLines,
  Download,
  Trash2,
  Grid3x3,
  List,
  File,
} from 'lucide-react'

type ItemType = 'image' | 'document' | 'video' | 'audio' | 'other'

interface LibItem {
  id: string
  name: string
  type: ItemType
  size: string
  updated: string
  // optional preview color for image tiles
  color?: string
}

const SEED: LibItem[] = [
  { id: '1', name: 'Cover — Q4 Launch.png', type: 'image', size: '1.2 MB', updated: '2h ago', color: 'from-orange-400 to-rose-500' },
  { id: '2', name: 'Positioning memo.docx', type: 'document', size: '48 KB', updated: '5h ago' },
  { id: '3', name: 'Onboarding walkthrough.mp4', type: 'video', size: '24 MB', updated: 'Yesterday', color: 'from-amber-400 to-orange-500' },
  { id: '4', name: 'Interview summary.docx', type: 'document', size: '32 KB', updated: '2d ago' },
  { id: '5', name: 'Logo concepts.png', type: 'image', size: '3.4 MB', updated: '3d ago', color: 'from-rose-400 to-pink-500' },
  { id: '6', name: 'Pricing call notes.wav', type: 'audio', size: '12 MB', updated: '3d ago' },
  { id: '7', name: 'Customer research.pdf', type: 'document', size: '256 KB', updated: '5d ago' },
  { id: '8', name: 'Hero banner.png', type: 'image', size: '2.1 MB', updated: '1w ago', color: 'from-yellow-400 to-amber-500' },
  { id: '9', name: 'Pricing analysis.xlsx', type: 'other', size: '64 KB', updated: '1w ago' },
]

const TYPE_META: Record<ItemType, { label: string; icon: any }> = {
  image: { label: 'Image', icon: ImageIcon },
  document: { label: 'Document', icon: FileText },
  video: { label: 'Video', icon: Film },
  audio: { label: 'Audio', icon: AudioLines },
  other: { label: 'File', icon: File },
}

const FILTERS: Array<{ id: 'all' | ItemType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'document', label: 'Documents' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'other', label: 'Files' },
]

export function LibraryMode() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | ItemType>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const items = useMemo(() => {
    return SEED.filter(i => {
      const matchType = filter === 'all' || i.type === filter
      const matchQuery = !query || i.name.toLowerCase().includes(query.toLowerCase())
      return matchType && matchQuery
    })
  }, [query, filter])

  return (
    <div className="omni-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Files, images, documents, and saved outputs.</p>
        </div>

        {/* Search + view toggle */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${view === 'grid' ? 'bg-secondary' : 'text-muted-foreground'}`}
              aria-label="Grid view"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${view === 'list' ? 'bg-secondary' : 'text-muted-foreground'}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
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

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Library className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-base font-medium">Nothing here yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {query ? 'No files match your search.' : 'Files you create or upload will appear here.'}
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map(item => {
              const Icon = TYPE_META[item.type].icon
              return (
                <motion.div
                  key={item.id}
                  layout
                  className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/30"
                >
                  {/* Preview */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                    {item.color ? (
                      <div className={`h-full w-full bg-gradient-to-br ${item.color}`} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Icon className="h-8 w-8 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground transition hover:bg-white">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-destructive transition hover:bg-white">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {TYPE_META[item.type].label}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{item.size} · {item.updated}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {items.map((item, idx) => {
              const Icon = TYPE_META[item.type].icon
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition hover:bg-secondary ${idx > 0 ? 'border-t border-border/60' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">{TYPE_META[item.type].label} · {item.size}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.updated}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
