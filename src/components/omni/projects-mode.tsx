'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderKanban,
  Plus,
  Search,
  MessageSquare,
  FileText,
  BookOpen,
  Bot,
  MoreHorizontal,
  ArrowLeft,
  Sparkles,
  X,
} from 'lucide-react'

interface Project {
  id: string
  name: string
  description: string
  color: string
  updated: string
  stats: { conversations: number; files: number; notes: number; agents: number }
}

interface ProjectItem {
  id: string
  title: string
  preview: string
  updated: string
  type: 'conversation' | 'file' | 'note' | 'agent'
}

const COLORS = ['from-orange-500 to-rose-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500', 'from-yellow-500 to-amber-500']

const SEED_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Q4 Launch Plan',
    description: 'Marketing + product collab for the December launch.',
    color: COLORS[0],
    updated: '2h ago',
    stats: { conversations: 8, files: 12, notes: 5, agents: 2 },
  },
  {
    id: 'p2',
    name: 'Personal Blog',
    description: 'Drafts, research, and image prompts for weekly essays.',
    color: COLORS[1],
    updated: 'Yesterday',
    stats: { conversations: 4, files: 3, notes: 7, agents: 1 },
  },
  {
    id: 'p3',
    name: 'Customer Research',
    description: 'Interview summaries and insight memos.',
    color: COLORS[2],
    updated: '3d ago',
    stats: { conversations: 6, files: 9, notes: 4, agents: 1 },
  },
]

const SEED_ITEMS: Record<string, ProjectItem[]> = {
  p1: [
    { id: 'i1', title: 'Positioning memo', preview: 'Differentiate on speed and price…', updated: '2h ago', type: 'conversation' },
    { id: 'i2', title: 'Launch-day runbook.docx', preview: 'T-minus 24h checklist', updated: '5h ago', type: 'file' },
    { id: 'i3', title: 'Competitor matrix', preview: 'Feature / price comparison', updated: 'Yesterday', type: 'note' },
    { id: 'i4', title: 'Pricing analyst', preview: 'Auto-summarize pricing calls', updated: '2d ago', type: 'agent' },
  ],
  p2: [
    { id: 'i1', title: 'On attention as currency', preview: 'A draft essay on…', updated: 'Yesterday', type: 'conversation' },
    { id: 'i2', title: 'Cover image — v3.png', preview: 'Generated image', updated: '2d ago', type: 'file' },
  ],
  p3: [
    { id: 'i1', title: 'Interview round 2', preview: 'Transcribed summary', updated: '3d ago', type: 'conversation' },
    { id: 'i2', title: 'Themes & quotes.note', preview: 'Pain points around onboarding…', updated: '3d ago', type: 'note' },
  ],
}

const TYPE_META: Record<ProjectItem['type'], { label: string; icon: any }> = {
  conversation: { label: 'Conversation', icon: MessageSquare },
  file: { label: 'File', icon: FileText },
  note: { label: 'Note', icon: BookOpen },
  agent: { label: 'Agent', icon: Bot },
}

export function ProjectsMode() {
  const [projects] = useState<Project[]>(SEED_PROJECTS)
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ProjectItem['type']>('all')
  const [showCreate, setShowCreate] = useState(false)

  const items = activeProject ? (SEED_ITEMS[activeProject] ?? []) : []
  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)

  if (activeProject) {
    const project = projects.find(p => p.id === activeProject)!
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <button onClick={() => setActiveProject(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Projects
          </button>
          <div className="ml-2 flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${project.color} text-white`}>
              <FolderKanban className="h-3.5 w-3.5" />
            </span>
            <h1 className="text-base font-semibold">{project.name}</h1>
          </div>
        </header>

        {/* Tabs / filter */}
        <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2">
          {(['all', 'conversation', 'file', 'note', 'agent'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                filter === f ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60'
              }`}
            >
              {f === 'all' ? 'All' : f + 's'}
            </button>
          ))}
        </div>

        {/* Items */}
        <div className="omni-scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium">Nothing here yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add a file, note, or start a conversation.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map(item => {
                  const Icon = TYPE_META[item.type].icon
                  return (
                    <button
                      key={item.id}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:bg-secondary"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.preview}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{item.updated}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Project list view
  return (
    <div className="omni-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Persistent context for your ongoing work.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search projects..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderKanban className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-base font-medium">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create a project to organize conversations, files, and notes.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveProject(p.id)}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/30 hover:bg-secondary/40"
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${p.color} text-white shadow-sm`}>
                    <FolderKanban className="h-5 w-5" />
                  </span>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.stats.conversations}</span>
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{p.stats.files}</span>
                    <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{p.stats.notes}</span>
                    <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{p.stats.agents}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{p.updated}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create modal */}
        <AnimatePresence>
          {showCreate && (
            <CreateProjectModal onClose={() => setShowCreate(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">New Project</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground transition hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Q1 Marketing"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              placeholder="What's this project about?"
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
            Cancel
          </button>
          <button
            onClick={onClose}
            disabled={!name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> Create
          </button>
        </div>
      </motion.div>
    </>
  )
}
