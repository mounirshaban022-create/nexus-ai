'use client'

import { useEffect, useState } from 'react'
import {
  Users, MessagesSquare, Images, Mail, Database, Zap, TrendingUp,
  ShieldCheck, ShieldX, CheckCircle2, XCircle, Clock, Globe, Server,
} from 'lucide-react'
import { api, fmtNum, timeAgo, type Overview } from '../console-types'

function Kpi({ icon: Icon, label, value, sub, tone = 'emerald' }: {
  icon: typeof Users; label: string; value: string; sub?: string; tone?: 'emerald' | 'sky' | 'violet' | 'amber'
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/25',
    sky: 'text-sky-400 bg-sky-500/10 ring-sky-500/25',
    violet: 'text-violet-400 bg-violet-500/10 ring-violet-500/25',
    amber: 'text-amber-400 bg-amber-500/10 ring-amber-500/25',
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function EngineDot({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      {on ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-slate-600" />}
      <span className={`text-xs ${on ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
      <span className={`ml-auto text-[10px] font-medium uppercase tracking-wider ${on ? 'text-emerald-400' : 'text-slate-600'}`}>
        {on ? 'live' : 'off'}
      </span>
    </div>
  )
}

export function OverviewView({ pulse, refreshKey }: { pulse: boolean; refreshKey: number }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Overview>('/overview')
      .then(setData)
      .catch(e => setError(e.message))
  }, [refreshKey, pulse])

  if (error) return <p className="text-sm text-rose-400">{error}</p>
  if (!data) return <p className="text-sm text-slate-500">Loading live metrics…</p>

  const maxActivity = Math.max(...data.activity.map(a => a.count), 1)

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Users} label="Accounts" value={fmtNum(data.users.total)} sub={`+${data.users.new24h} in 24h · ${data.users.activeWeek} active/wk`} />
        <Kpi icon={MessagesSquare} label="Sessions" value={fmtNum(data.conversations.sessions)} sub={`${data.conversations.agentSessions} with agents`} tone="sky" />
        <Kpi icon={Zap} label="AI messages" value={fmtNum(data.conversations.messages)} sub={`+${fmtNum(data.conversations.messages24h)} in 24h`} tone="violet" />
        <Kpi icon={Images} label="Media" value={fmtNum(data.generations.images + data.generations.videos)} sub={`${data.generations.images} images · ${data.generations.videos} videos`} tone="amber" />
        <Kpi icon={Mail} label="WhatsApp msgs" value={fmtNum(data.messaging.whatsappMessages)} sub={`+${data.messaging.whatsappIn24h} in 24h`} tone="emerald" />
        <Kpi icon={Database} label="DB latency" value={data.platform.dbLatencyMs >= 0 ? `${data.platform.dbLatencyMs}ms` : 'offline'} sub={data.platform.supabaseConfigured ? 'Supabase reachable' : 'local database'} tone="sky" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Activity chart */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Messages per day — last 14 days</p>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex h-36 items-end gap-1.5">
            {data.activity.length === 0 && <p className="text-xs text-slate-500">No activity data yet.</p>}
            {data.activity.map(a => (
              <div key={a.day} className="group relative flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-emerald-600/60 to-emerald-400/80 transition group-hover:from-emerald-500 group-hover:to-emerald-300"
                  style={{ height: `${Math.max((a.count / maxActivity) * 100, 3)}%` }}
                />
                <span className="mt-1 text-[9px] text-slate-600">{a.day.slice(5)}</span>
                <span className="pointer-events-none absolute -top-5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 opacity-0 shadow group-hover:opacity-100">
                  {a.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Engine status */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-300">AI engines (live)</p>
          <div className="space-y-1.5">
            <EngineDot label="Google Gemini" on={data.engines.gemini} />
            <EngineDot label="Hugging Face" on={data.engines.huggingface} />
            <EngineDot label="xAI Grok" on={data.engines.xai} />
            <EngineDot label="Groq" on={data.engines.groq} />
            <EngineDot label="Vercel AI Gateway" on={data.engines.vercelGateway} />
            <EngineDot label="Agnes Video" on={data.engines.agnesVideo} />
            <EngineDot label="Pollinations FLUX" on={data.engines.pollinations} />
            <EngineDot label="Z.ai (disabled)" on={false} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Platform */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-300">Platform</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Globe className="h-3.5 w-3.5 text-slate-500" /> Environment
              <span className="ml-auto font-medium text-slate-200">{data.platform.nodeEnv}{data.platform.isVercel ? ` · ${data.platform.region}` : ' · local'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Database className="h-3.5 w-3.5 text-slate-500" /> Supabase
              <span className={`ml-auto font-medium ${data.platform.supabaseConfigured ? 'text-emerald-400' : 'text-slate-500'}`}>
                {data.platform.supabaseConfigured ? 'connected' : 'local sqlite'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Server className="h-3.5 w-3.5 text-slate-500" /> Workspace
              <span className="ml-auto font-medium text-slate-200">{data.workspace.projects} projects · {data.workspace.memories} memories</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="h-3.5 w-3.5 text-slate-500" /> Guests
              <span className="ml-auto font-medium text-slate-200">{data.users.guests} guest sessions</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-500" /> Updated
              <span className="ml-auto font-medium text-slate-200">{timeAgo(data.generatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Audit trail */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Console audit trail</p>
            {data.auditTrail.some(a => a.action === 'console.login_failed') && (
              <span className="flex items-center gap-1 text-[10px] text-rose-400"><ShieldX className="h-3 w-3" /> failed attempts recorded</span>
            )}
          </div>
          {data.auditTrail.length === 0 ? (
            <p className="text-xs text-slate-500">No console actions recorded yet.</p>
          ) : (
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {data.auditTrail.map(a => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-1.5 text-xs">
                  <span className="font-mono text-[10px] text-emerald-400/90">{a.action}</span>
                  <span className="truncate text-slate-400">{a.target ?? ''}{a.detail ? ` — ${a.detail}` : ''}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-600">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
