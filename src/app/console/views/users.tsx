'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Search, ShieldBan, ShieldCheck, BadgeCheck, Trash2, UserX,
  ChevronRight, Mail, MapPin, Clock, Ban,
} from 'lucide-react'
import { api, timeAgo, fmtNum, type ConsoleUser } from '../console-types'

export function UsersView({ refreshKey }: { refreshKey: number }) {
  const [users, setUsers] = useState<ConsoleUser[]>([])
  const [total, setTotal] = useState(0)
  const [guests, setGuests] = useState<{ sessions: number; messages: number } | null>(null)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<ConsoleUser | null>(null)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (query: string) => {
    setError('')
    try {
      const r = await api<{ users: ConsoleUser[]; total: number; guests: { sessions: number; messages: number } }>(
        `/users?limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`
      )
      setUsers(r.users)
      setTotal(r.total)
      setGuests(r.guests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [])

  useEffect(() => { load(q) }, [load, q, refreshKey])

  const action = async (u: ConsoleUser, act: 'suspend' | 'unsuspend' | 'verify_email' | 'delete') => {
    if (act === 'delete') {
      const email = window.prompt(`PERMANENTLY delete ${u.email}?\n\nType the full email to confirm:`)
      if (!email) return
      setBusyId(u.id)
      try {
        await api(`/users/${u.id}?confirm=${encodeURIComponent(email)}`, { method: 'DELETE' })
        setNotice(`${u.email} deleted`)
        setSelected(null)
        await load(q)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      } finally { setBusyId('') }
      return
    }
    setBusyId(u.id)
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ action: act }) })
      setNotice(act === 'suspend' ? `${u.email} suspended — their next request signs them out`
        : act === 'unsuspend' ? `${u.email} restored`
        : `${u.email} marked verified`)
      await load(q)
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally { setBusyId('') }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search email or name…"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500/50"
          />
        </div>
        <span className="text-xs text-slate-500">{total} registered accounts</span>
        {guests && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            <UserX className="h-3.5 w-3.5" /> {guests.sessions} guest sessions · {fmtNum(guests.messages)} guest messages
          </span>
        )}
      </div>

      {(notice || error) && (
        <p className={`text-xs ${error ? 'text-rose-400' : 'text-emerald-400'}`}>{error || notice}</p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Usage</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Status</th>
              <th className="px-4 py-2.5 font-medium">Control</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 bg-slate-900/30">
            {users.map(u => {
              const s = u.stats
              return (
                <tr key={u.id} className="transition hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
                        {(u.name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium text-slate-200">
                          {u.name || u.email.split('@')[0]}
                          {u.emailVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
                          {u.control?.suspended && <Ban className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                        </p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {s && (
                      <p className="text-xs text-slate-400">
                        <span className="font-medium text-slate-300">{fmtNum(s.messages)}</span> msgs · {s.sessions} chats ·{' '}
                        {s.images + s.videos + s.documents} media
                      </p>
                    )}
                    <p className="text-[11px] text-slate-600">active {timeAgo(u.lastActiveAt)}</p>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {u.control?.suspended ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/25">suspended</span>
                    ) : u.emailVerified ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/20">verified</span>
                    ) : (
                      <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-400">pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.control?.suspended ? (
                        <button
                          onClick={() => action(u, 'unsuspend')}
                          disabled={busyId === u.id}
                          className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                        >
                          <ShieldCheck className="h-3 w-3" /> Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => action(u, 'suspend')}
                          disabled={busyId === u.id}
                          className="flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-40"
                        >
                          <ShieldBan className="h-3 w-3" /> Suspend
                        </button>
                      )}
                      {!u.emailVerified && (
                        <button
                          onClick={() => action(u, 'verify_email')}
                          disabled={busyId === u.id}
                          className="rounded-md bg-slate-700/50 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
                        >
                          Verify
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => setSelected(u)} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No accounts match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-900 p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{selected.name || selected.email.split('@')[0]}</h3>
                <p className="text-xs text-slate-500">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300">✕</button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {selected.stats && Object.entries({
                  Chats: selected.stats.sessions, Messages: selected.stats.messages,
                  Images: selected.stats.images, Videos: selected.stats.videos,
                  Documents: selected.stats.documents, Projects: selected.stats.projects,
                }).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
                    <p className="text-lg font-semibold text-slate-200">{v}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-xs text-slate-400">
                {selected.location && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-500" /> {selected.location}</p>}
                {selected.timezone && <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-slate-500" /> {selected.timezone}</p>}
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-500" /> joined {new Date(selected.createdAt).toLocaleDateString()} · active {timeAgo(selected.lastActiveAt)}</p>
                {selected.bio && <p className="rounded-lg bg-slate-800/50 p-3 italic text-slate-300">“{selected.bio}”</p>}
              </div>
              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={() => action(selected, 'delete')}
                  className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete account permanently
                </button>
                <p className="mt-2 text-[10px] text-slate-600">Cascades: chats, media, documents, projects, connected accounts.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
