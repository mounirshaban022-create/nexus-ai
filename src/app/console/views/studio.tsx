'use client'

import { useEffect, useState, useCallback } from 'react'
import { FlaskConical, Play, CheckCircle2, XCircle, Image as ImageIcon, MessagesSquare, Film } from 'lucide-react'
import { api, timeAgo, type StudioEngines } from '../console-types'

interface StudioData {
  engines: StudioEngines
  recentImages: { id: string; prompt: string; provider: string; createdAt: string }[]
  zaiDisabled: boolean
}

export function StudioView({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<StudioData | null>(null)
  const [chatPrompt, setChatPrompt] = useState('Give me a 2-sentence product pitch for an AI workspace app.')
  const [chatResult, setChatResult] = useState<{ engine: string; text: string } | null>(null)
  const [imgPrompt, setImgPrompt] = useState('A cinematic wide shot of a futuristic Dubai skyline at golden hour, ultra detailed')
  const [imgResult, setImgResult] = useState<string | null>(null)
  const [videoInfo, setVideoInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api<StudioData>('/studio'))
    } catch { /* parent handles */ }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const runChat = async () => {
    setBusy('chat'); setError(''); setChatResult(null)
    try {
      const r = await api<{ engine: string; text: string }>('/studio', {
        method: 'POST', body: JSON.stringify({ test: 'chat', prompt: chatPrompt }),
      })
      setChatResult({ engine: r.engine, text: r.text })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat test failed')
    } finally { setBusy('') }
  }

  const runImage = async () => {
    setBusy('image'); setError(''); setImgResult(null)
    try {
      const r = await api<{ engine: string; fileUrl: string }>('/studio', {
        method: 'POST', body: JSON.stringify({ test: 'image', prompt: imgPrompt }),
      })
      setImgResult(r.fileUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image test failed')
    } finally { setBusy('') }
  }

  const runVideo = async () => {
    setBusy('video'); setError(''); setVideoInfo(null)
    try {
      const r = await api<{ video: { note: string; pipeline: string; jobSystem: string } }>('/studio', {
        method: 'POST', body: JSON.stringify({ test: 'video' }),
      })
      setVideoInfo(`${r.video.pipeline} — ${r.video.jobSystem}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video test failed')
    } finally { setBusy('') }
  }

  if (!data) return <p className="text-sm text-slate-500">Loading studio…</p>

  return (
    <div className="space-y-5">
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {data.zaiDisabled && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300">
          <XCircle className="h-3.5 w-3.5" /> Z.ai is permanently disabled (owner directive). All capabilities below run on premium Vercel-native engines.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* CHAT */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <MessagesSquare className="h-4 w-4 text-emerald-400" /> Chat brain test
          </p>
          <p className="mb-3 text-[11px] text-slate-500">
            Chain: {data.engines.chat.map(c => `${c.name}${c.available ? '' : ' (no key)'}`).join(' → ')}
          </p>
          <textarea value={chatPrompt} onChange={e => setChatPrompt(e.target.value)} rows={2}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
          <button onClick={runChat} disabled={busy === 'chat'}
            className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            <Play className="h-3 w-3" /> {busy === 'chat' ? 'Running…' : 'Run real chat test'}
          </button>
          {chatResult && (
            <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-800/60 p-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> served by {chatResult.engine}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">{chatResult.text}</p>
            </div>
          )}
        </div>

        {/* IMAGE */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ImageIcon className="h-4 w-4 text-emerald-400" /> Image engine test
          </p>
          <p className="mb-3 text-[11px] text-slate-500">
            Chain: {data.engines.image.map(c => c.name).join(' → ')}
          </p>
          <textarea value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} rows={2}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs" />
          <button onClick={runImage} disabled={busy === 'image'}
            className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            <Play className="h-3 w-3" /> {busy === 'image' ? 'Generating…' : 'Generate real image'}
          </button>
          {imgResult && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-700/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgResult} alt="AI test result" className="max-h-56 w-full object-cover" />
            </div>
          )}
        </div>

        {/* VIDEO */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Film className="h-4 w-4 text-emerald-400" /> Video pipeline check
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{data.engines.video.note}</p>
          <button onClick={runVideo} disabled={busy === 'video'}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            <Play className="h-3 w-3" /> {busy === 'video' ? 'Checking…' : 'Run pipeline check'}
          </button>
          {videoInfo && (
            <p className="mt-3 rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-300">
              <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" /> {videoInfo}
            </p>
          )}
        </div>

        {/* RECENT */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FlaskConical className="h-4 w-4 text-emerald-400" /> Recent engine results
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {data.recentImages.map(r => (
              <div key={r.id} className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                <p className="line-clamp-1 text-slate-300">{r.prompt}</p>
                <p className="text-[10px] text-slate-500"><span className="text-emerald-400/90">{r.provider}</span> · {timeAgo(r.createdAt)}</p>
              </div>
            ))}
            {data.recentImages.length === 0 && <p className="text-xs text-slate-500">No engine results yet — run a test.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
