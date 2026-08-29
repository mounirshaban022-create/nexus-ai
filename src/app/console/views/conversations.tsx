'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Bot, User, Wrench, Brain, Paperclip, Download, ChevronLeft, Sparkles } from 'lucide-react'
import { api, timeAgo, type SessionCard, type TranscriptMessage } from '../console-types'

interface Transcript {
  session: {
    id: string; title: string; kind: string; agentSlug: string | null
    user: { id: string | null; email: string; name: string }
    project: { id: string; name: string; color: string } | null
    createdAt: string; updatedAt: string
  }
  messages: TranscriptMessage[]
  stats: { total: number; user: number; assistant: number; tool: number; withThinking: number; withAttachments: number }
}

function exportTranscript(t: Transcript) {
  const lines = [
    `# ${t.session.title}`,
    `User: ${t.session.user.email}${t.session.user.id ? '' : ' (guest)'}`,
    t.session.agentSlug ? `Agent: ${t.session.agentSlug}` : '',
    t.session.project ? `Project: ${t.session.project.name}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    ...t.messages.map(m =>
      [`## ${m.role} — ${new Date(m.createdAt).toLocaleString()}`,
       m.thinking ? `> thinking: ${m.thinking}` : '',
       m.toolName ? `> tool: ${m.toolName}` : '',
       m.content].filter(Boolean).join('\n')
    ),
  ].join('\n\n')
  const blob = new Blob([lines], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `nexus-transcript-${t.session.id.slice(0, 8)}.md`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Bubble({ m }: { m: TranscriptMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-emerald-600/90 px-4 py-2.5 text-sm leading-relaxed text-white shadow">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-emerald-200/80">
            <User className="h-3 w-3" /> {new Date(m.createdAt).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
    )
  }
  if (m.role === 'tool') {
    return (
      <div className="mx-auto w-full max-w-[90%] rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
          <Wrench className="h-3 w-3" /> tool: {m.toolName ?? 'connector'}
        </p>
        {m.toolDataParsed?.args != null && (
          <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-slate-400">
            {JSON.stringify(m.toolDataParsed.args).slice(0, 400)}
          </pre>
        )}
        <p className="mt-1 line-clamp-2 text-xs text-slate-300">{m.content?.slice(0, 300)}</p>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-slate-700/60 bg-slate-800/70 px-4 py-2.5 text-sm leading-relaxed text-slate-100">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <Sparkles className="h-3 w-3 text-emerald-400" /> AI
        </p>
        {m.thinking && (
          <details className="mb-2 rounded-lg bg-slate-900/60 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-violet-300">
              <Brain className="h-3 w-3" /> thinking trace ({m.thinking.length} chars)
            </summary>
            <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">{m.thinking}</p>
          </details>
        )}
        <p className="whitespace-pre-wrap">{m.content}</p>
        {(m.attachmentsParsed?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachmentsParsed.map((att, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg bg-slate-700/60 px-2 py-1 text-[10px] text-slate-300">
                <Paperclip className="h-2.5 w-2.5" /> {String(att?.type ?? att?.kind ?? 'attachment')}{att?.url ? '' : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConversationsView({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<SessionCard[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [active, setActive] = useState<Transcript | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '60' })
    if (q) params.set('q', q)
    if (kind) params.set('kind', kind)
    try {
      const r = await api<{ sessions: SessionCard[]; total: number }>(`/conversations?${params}`)
      setSessions(r.sessions)
      setTotal(r.total)
    } catch { /* handled by parent state */ }
  }, [q, kind])

  useEffect(() => { load() }, [load, refreshKey])

  const open = async (id: string) => {
    setLoadingTranscript(true)
    try {
      const r = await api<Transcript>(`/conversations/${id}`)
      setActive(r)
    } finally {
      setLoadingTranscript(false)
    }
  }

  if (active) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setActive(null)} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 transition hover:border-emerald-500/30">
            <ChevronLeft className="h-3.5 w-3.5" /> All conversations
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{active.session.title}</p>
            <p className="text-[11px] text-slate-500">
              {active.session.user.email}{active.session.user.id ? '' : ' (guest)'} · {active.stats.total} messages · {active.session.agentSlug ? `agent ${active.session.agentSlug}` : 'core NEXUS'}{active.session.project ? ` · project ${active.session.project.name}` : ''}
            </p>
          </div>
          <button
            onClick={() => exportTranscript(active)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" /> Export .md
          </button>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          {loadingTranscript && <p className="text-xs text-slate-500">Loading…</p>}
          {active.messages.map(m => <Bubble key={m.id} m={m} />)}
          {active.messages.length === 0 && !loadingTranscript && <p className="text-xs text-slate-500">No messages.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Search titles…"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500/50"
          />
        </div>
        {['', 'chat', 'agent'].map(k => (
          <button
            key={k || 'all'}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${kind === k ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
          >
            {k || 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{total} sessions</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => open(s.id)}
            className="group rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-emerald-500/30 hover:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              {s.kind === 'agent' ? <Bot className="h-4 w-4 shrink-0 text-violet-400" /> : <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />}
              <p className="truncate text-sm font-medium text-slate-200 group-hover:text-emerald-200">{s.title}</p>
            </div>
            <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-slate-500">{s.preview || 'No user messages yet.'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className={`rounded-full px-2 py-0.5 ${s.user.id ? 'bg-sky-500/10 text-sky-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {s.user.id ? s.user.email.split('@')[0] : 'guest'}
              </span>
              {s.agentSlug && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-300">{s.agentSlug}</span>}
              {s.project && <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-slate-300">{s.project.name}</span>}
              <span className="ml-auto text-slate-600">{s.messageCount} msgs · {timeAgo(s.updatedAt)}</span>
            </div>
          </button>
        ))}
        {sessions.length === 0 && <p className="text-sm text-slate-500">No conversations found.</p>}
      </div>
    </div>
  )
}
