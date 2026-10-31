'use client'

import { useEffect, useState } from 'react'
import { Images, Film, FileText, ExternalLink, CircleAlert } from 'lucide-react'
import { api, timeAgo } from '../console-types'

interface Item {
  id: string
  prompt?: string
  title?: string
  filename?: string
  size?: number
  provider?: string
  status?: string
  scenes?: number
  format?: string
  error?: string | null
  createdAt: string
  fileUrl: string
  user?: { email: string; name: string } | null
  userId?: string | null
}

const TABS = [
  { id: 'images', label: 'Images', icon: Images },
  { id: 'videos', label: 'Videos', icon: Film },
  { id: 'documents', label: 'Documents', icon: FileText },
] as const

export function GenerationsView({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<'images' | 'videos' | 'documents'>('images')
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    // Async fetch inside the effect (no synchronous setState — the initial
    // error clear happens on the result path, avoiding cascading renders).
    let cancelled = false
    ;(async () => {
      try {
        const r = await api<{ items: Item[]; total: number }>(`/generations?type=${tab}&limit=48`)
        if (cancelled) return
        setItems(r.items)
        setTotal(r.total)
        setError('')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed')
      }
    })()
    return () => { cancelled = true }
  }, [tab, refreshKey])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              tab === t.id ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{total} items</span>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {tab === 'images' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map(it => (
            <div key={it.id} className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 transition hover:border-emerald-500/30">
              <div className="aspect-square bg-slate-800">
                {/* Real bytes from the console file endpoint (auth-gated). */}
                <img
                  src={it.fileUrl}
                  alt={it.prompt ?? 'generated'}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-[11px] leading-snug text-slate-300">{it.prompt}</p>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400/90">{it.provider}</span>
                  <span>{it.user?.email?.split('@')[0] ?? it.userId ? 'user' : 'guest'} · {timeAgo(it.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && !error && <p className="text-sm text-slate-500">No images generated yet.</p>}
        </div>
      )}

      {tab === 'videos' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(it => (
            <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                  it.status === 'done' ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
                  : it.status === 'error' ? 'bg-rose-500/10 text-rose-300 ring-rose-500/25'
                  : 'bg-amber-500/10 text-amber-300 ring-amber-500/25'}`}>
                  {it.status}
                </span>
                <span className="text-[10px] text-slate-500">{it.scenes} scenes · {timeAgo(it.createdAt)}</span>
              </div>
              <p className="line-clamp-2 text-xs text-slate-300">{it.prompt}</p>
              {it.error && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400"><CircleAlert className="h-3 w-3" /> {it.error}</p>}
              {it.status === 'done' && (
                <a href={it.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300">
                  <ExternalLink className="h-3 w-3" /> Open video
                </a>
              )}
              <p className="mt-2 text-[10px] text-slate-600">{it.user?.email ?? it.userId ? `user: ${it.user?.email ?? it.userId}` : 'guest'}</p>
            </div>
          ))}
          {items.length === 0 && !error && <p className="text-sm text-slate-500">No videos generated yet.</p>}
        </div>
      )}

      {tab === 'documents' && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Format</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Size</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 bg-slate-900/30">
              {items.map(it => (
                <tr key={it.id} className="transition hover:bg-slate-800/40">
                  <td className="max-w-xs px-4 py-3">
                    <p className="truncate font-medium text-slate-200">{it.title || it.filename}</p>
                    <p className="truncate text-[11px] text-slate-500">{it.filename}</p>
                  </td>
                  <td className="hidden px-4 py-3"><span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] uppercase text-sky-300">{it.format}</span></td>
                  <td className="hidden px-4 py-3 text-xs text-slate-400 lg:table-cell">{((it.size ?? 0) / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(it.createdAt)}</td>
                  <td className="px-4 py-3">
                    <a href={it.fileUrl} className="text-xs text-emerald-400 hover:text-emerald-300">Download</a>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !error && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No documents yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
