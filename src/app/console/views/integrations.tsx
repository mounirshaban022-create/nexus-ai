'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plug, CheckCircle2, XCircle, GitBranch, Cloud, Database, Rocket, GitCommit,
} from 'lucide-react'
import { api, timeAgo, type Integrations } from '../console-types'

function StatusCard({ icon: Icon, title, ok, configured, children, onRetest, busy }: {
  icon: typeof Cloud; title: string; ok: boolean; configured: boolean
  children?: React.ReactNode; onRetest: () => void; busy: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${
          ok ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25' : configured ? 'bg-rose-500/10 text-rose-400 ring-rose-500/25' : 'bg-slate-700/40 text-slate-500 ring-slate-600/40'
        }`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-[11px]">
            {ok ? <span className="text-emerald-400">connected · live data</span>
              : configured ? <span className="text-rose-400">configured · probe failed</span>
              : <span className="text-slate-500">not configured</span>}
          </p>
        </div>
        <button
          onClick={onRetest}
          disabled={busy}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
        >
          {busy ? 'Testing…' : 'Test'}
        </button>
      </div>
      {children}
    </div>
  )
}

export function IntegrationsView({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Integrations | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await api<Integrations>('/integrations'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const retest = async (platform: string) => {
    setBusy(platform)
    try {
      await api('/integrations', { method: 'POST', body: JSON.stringify({ platform }) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
    } finally { setBusy('') }
  }

  if (!data) return <p className="text-sm text-slate-500">{error || 'Probing integrations…'}</p>

  const { vercel, github, supabase } = data.integrations

  return (
    <div className="space-y-5">
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* VERCEL */}
        <StatusCard icon={Cloud} title="Vercel" ok={vercel.ok} configured={vercel.configured} busy={busy === 'vercel'} onRetest={() => retest('vercel')}>
          {vercel.ok && vercel.projects && (
            <div className="space-y-1.5">
              {vercel.projects.slice(0, 4).map(p => (
                <div key={p.id} className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                  <p className="font-medium text-slate-200">{p.name}</p>
                  <p className="text-[10px] text-slate-500">{p.framework} · {p.latestDeployment ?? 'no deployment'}</p>
                </div>
              ))}
            </div>
          )}
          {vercel.configured && !vercel.ok && <p className="text-[11px] text-rose-400">{vercel.error}</p>}
          {!vercel.configured && <p className="text-[11px] text-slate-500">Add VERCEL_TOKEN to the deployment env.</p>}
        </StatusCard>

        {/* GITHUB */}
        <StatusCard icon={GitBranch} title="GitHub" ok={github.ok} configured={github.configured} busy={busy === 'github'} onRetest={() => retest('github')}>
          {github.ok && github.repo && (
            <div className="space-y-1.5">
              <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                <p className="font-medium text-slate-200">{github.repo.fullName}</p>
                <p className="text-[10px] text-slate-500">
                  {github.repo.branch} · {github.repo.language} · ★ {github.repo.stars} · pushed {timeAgo(github.repo.pushedAt)}
                </p>
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {github.commits?.map(c => (
                  <div key={c.sha} className="flex items-start gap-2 rounded-lg bg-slate-900/70 px-3 py-1.5 text-[11px]">
                    <GitCommit className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                    <p className="min-w-0 flex-1 truncate text-slate-300">{c.message}</p>
                    <span className="shrink-0 font-mono text-[9px] text-slate-600">{c.sha}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {github.configured && !github.ok && <p className="text-[11px] text-rose-400">{github.error}</p>}
        </StatusCard>

        {/* SUPABASE */}
        <StatusCard icon={Database} title="Supabase" ok={supabase.ok} configured={supabase.configured} busy={busy === 'supabase'} onRetest={() => retest('supabase')}>
          {supabase.configured ? (
            <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
              <p className="truncate font-medium text-slate-200">{supabase.url}</p>
              <p className="text-[10px] text-slate-500">
                auth health {supabase.ok ? 'OK' : `HTTP ${supabase.status ?? 'error'}`}{supabase.error ? ` · ${supabase.error}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">NEXT_PUBLIC_SUPABASE_URL not present in this deployment.</p>
          )}
        </StatusCard>
      </div>

      {/* Deployments */}
      {data.deployments.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Rocket className="h-4 w-4 text-emerald-400" /> Production deployments (live from Vercel)
          </p>
          <div className="space-y-1.5">
            {data.deployments.map(d => (
              <div key={d.url} className="flex items-center gap-3 rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.state === 'READY' ? 'bg-emerald-400' : d.state === 'ERROR' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                <a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-[10px] text-sky-400 hover:text-sky-300">{d.url.split('-')[0]}…</a>
                <p className="min-w-0 flex-1 truncate text-slate-400">{d.commit}</p>
                <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(new Date(d.createdAt).toISOString())}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credential vault presence map */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Plug className="h-4 w-4 text-emerald-400" /> Credential vault — presence only (values never leave the server)
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(data.presence).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
              {v ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
              <span className={`truncate text-[11px] ${v ? 'text-slate-300' : 'text-slate-600'}`}>{k}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          Console checks: checked {timeAgo(data.checkedAt)}. Secrets stay server-side; the console exposes only their presence and live connectivity results.
        </p>
      </div>
    </div>
  )
}
