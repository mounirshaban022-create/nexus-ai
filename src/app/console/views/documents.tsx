'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, Download, Wand2, LayoutTemplate } from 'lucide-react'
import { api, timeAgo, type DocTemplate, type DocRow } from '../console-types'

export function DocumentsView({ refreshKey }: { refreshKey: number }) {
  const [templates, setTemplates] = useState<DocTemplate[]>([])
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [active, setActive] = useState<DocTemplate | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api<{ templates: DocTemplate[]; documents: DocRow[] }>('/documents')
      setTemplates(r.templates)
      setDocuments(r.documents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const pick = (t: DocTemplate) => {
    setActive(t)
    setFields({})
    setError('')
  }

  const generate = async () => {
    if (!active) return
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api<{ ok: boolean; document: DocRow }>('/documents', {
        method: 'POST',
        body: JSON.stringify({ template: active.id, fields }),
      })
      setNotice(`“${r.document.filename}” generated — real .docx, ${(r.document.size / 1024).toFixed(1)} KB`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {/* Template gallery */}
      <div className="space-y-3 xl:col-span-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <LayoutTemplate className="h-4 w-4 text-emerald-400" /> Premium templates
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className={`rounded-xl border p-3.5 text-left transition ${
                active?.id === t.id
                  ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/25'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <FileText className="h-3.5 w-3.5 text-emerald-400/80" /> {t.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t.description}</p>
            </button>
          ))}
        </div>

        {/* Recent documents */}
        <p className="pt-2 text-sm font-semibold text-slate-200">Recent documents</p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {documents.map(d => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-300">{d.title || d.filename}</p>
                <p className="text-[10px] text-slate-500">{d.format.toUpperCase()} · {((d.size ?? 0) / 1024).toFixed(1)} KB · {timeAgo(d.createdAt)}</p>
              </div>
              <a href={d.fileUrl ?? `/api/console/generations/file/documents/${d.id}`} className="shrink-0 text-emerald-400 hover:text-emerald-300" title="Download">
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
          {documents.length === 0 && <p className="text-xs text-slate-500">No documents yet — generate one from a template.</p>}
        </div>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 xl:col-span-3">
        {!active ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <FileText className="mb-3 h-10 w-10 text-slate-700" />
            <p className="text-sm font-medium text-slate-400">Select a premium template</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-600">
              Templates render into real Word files (native headings, tables, page numbers) and are stored in the app&apos;s document library for permanent download.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{active.name}</h3>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/25">real .docx output</span>
            </div>
            {(notice || error) && <p className={`text-xs ${error ? 'text-rose-400' : 'text-emerald-400'}`}>{error || notice}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {active.fields.map(f => (
                <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">
                    {f.label}{f.required && <span className="text-emerald-400"> *</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={fields[f.key] ?? ''}
                      onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={3}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-500/50"
                    />
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={fields[f.key] ?? ''}
                      onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-500/50"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={generate}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" /> {busy ? 'Rendering…' : 'Generate document'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
