'use client'

/**
 * KNOWLEDGE BASE — RAG chat with your documents.
 *
 * Modeled on the most-starred open-source AI apps (AnythingLLM 45k★,
 * Open WebUI 100k★): upload PDF/DOCX/TXT/MD/CSV → the server chunks and
 * stores them → ask questions and get answers grounded ONLY in your
 * documents, with numbered citations that map back to the source file.
 *
 * Left rail: upload dropzone + document library (chunk counts, delete).
 * Right: cited Q&A thread with expandable source snippets.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  FileSpreadsheet,
  FileType2,
  Library,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  ChevronDown,
  Quote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

/* --------------------------------- types -------------------------------- */

interface KbDoc {
  id: string
  filename: string
  title: string
  format: string
  size: number
  chunkCount: number
  status: string
  error?: string | null
  createdAt: string
}

interface KbSource {
  n: number
  docId: string
  filename: string
  title: string
  chunk: number
  snippet: string
  score: number
}

interface KbTurn {
  role: 'user' | 'assistant'
  text: string
  sources?: KbSource[]
  note?: string
}

/* ------------------------------- helpers -------------------------------- */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatIcon(format: string) {
  if (format === 'pdf') return FileText
  if (format === 'csv') return FileSpreadsheet
  if (format === 'docx') return FileType2
  return FileText
}

/** Render [n] citation markers inside an answer as highlighted chips. */
function CitedText({ text, sources }: { text: string; sources?: KbSource[] }) {
  if (!sources || sources.length === 0) return <>{text}</>
  const parts = text.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        if (!m) return <span key={i}>{part}</span>
        const n = Number(m[1])
        const src = sources.find((s) => s.n === n)
        if (!src) return <span key={i}>{part}</span>
        return (
          <button
            key={i}
            type="button"
            title={`${src.filename} · chunk ${src.chunk}: ${src.snippet.slice(0, 140)}…`}
            onClick={() => {
              const el = document.getElementById(`kb-src-${n}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1 align-baseline text-[11px] font-semibold text-emerald-500 transition hover:bg-emerald-500/20"
          >
            {n}
          </button>
        )
      })}
    </>
  )
}

/* ================================ component ============================== */

export function KnowledgeMode() {
  const { toast } = useToast()
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [totals, setTotals] = useState({ docs: 0, chunks: 0, bytes: 0 })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [turns, setTurns] = useState<KbTurn[]>([])
  const [showPaste, setShowPaste] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /* ------------------------------ data layer ----------------------------- */

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kb', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setDocs(data.docs ?? [])
        setTotals(data.totals ?? { docs: 0, chunks: 0, bytes: 0 })
      }
    } catch {
      // silent — list stays empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, asking])

  /* -------------------------------- upload ------------------------------- */

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/kb', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')
        toast({
          title: 'Added to knowledge base',
          description: `${data.doc.filename} → ${data.doc.chunkCount} searchable chunks`,
        })
        load()
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Try again',
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    [load, toast]
  )

  const uploadPasted = useCallback(async () => {
    if (!pasteTitle.trim() || !pasteText.trim()) return
    setUploading(true)
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pasteTitle.trim(), text: pasteText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      toast({ title: 'Added to knowledge base', description: `${data.doc.chunkCount} searchable chunks` })
      setPasteTitle('')
      setPasteText('')
      setShowPaste(false)
      load()
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }, [pasteTitle, pasteText, load, toast])

  const deleteDoc = useCallback(
    async (id: string) => {
      setDocs((d) => d.filter((x) => x.id !== id))
      try {
        const res = await fetch(`/api/kb?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
        toast({ title: 'Document removed' })
        load()
      } catch {
        toast({ title: 'Delete failed', variant: 'destructive' })
        load()
      }
    },
    [load, toast]
  )

  /* --------------------------------- ask --------------------------------- */

  const ask = useCallback(async () => {
    const q = question.trim()
    if (!q || asking) return
    setQuestion('')
    setTurns((t) => [...t, { role: 'user', text: q }, { role: 'assistant', text: '' }])
    setAsking(true)
    try {
      const res = await fetch('/api/kb/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Knowledge chat failed')
      setTurns((t) => {
        const next = [...t]
        next[next.length - 1] = {
          role: 'assistant',
          text: data.answer || data.note || '',
          sources: data.sources ?? [],
          note: data.note,
        }
        return next
      })
    } catch (err) {
      setTurns((t) => {
        const next = [...t]
        next[next.length - 1] = {
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Something went wrong.',
        }
        return next
      })
    } finally {
      setAsking(false)
      inputRef.current?.focus()
    }
  }, [question, asking])

  /* -------------------------------- render ------------------------------- */

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="knowledge-mode">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Library className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground">Knowledge Base</h1>
          <p className="truncate text-xs text-muted-foreground">
            Chat with your documents — answers grounded in your files with citations
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            {totals.docs} docs
          </span>
          <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            {totals.chunks} chunks
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:flex-row sm:overflow-hidden sm:p-6">
        {/* Left: library */}
        <aside className="flex w-full shrink-0 flex-col gap-3 sm:w-80" aria-label="Document library">
          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload documents"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const files = Array.from(e.dataTransfer.files).slice(0, 5)
              files.forEach(uploadFile)
            }}
            className={cn(
              'group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition',
              dragOver
                ? 'border-emerald-500/70 bg-emerald-500/10'
                : 'border-border bg-muted/30 hover:border-emerald-500/50 hover:bg-emerald-500/5'
            )}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-hidden />
            ) : (
              <Upload className="h-6 w-6 text-emerald-500 transition group-hover:scale-110" aria-hidden />
            )}
            <p className="text-[13px] font-medium text-foreground">
              {uploading ? 'Parsing…' : 'Drop files or click to upload'}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              PDF · DOCX · TXT · MD · CSV — up to 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,text/plain,application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).slice(0, 5)
                files.forEach(uploadFile)
                e.target.value = ''
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPaste((s) => !s)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Paste text instead
          </button>

          {showPaste && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="overflow-hidden rounded-xl border border-border bg-card p-3"
            >
              <input
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="Title…"
                className="mb-2 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] outline-none focus:border-emerald-500/50"
              />
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste any text — notes, articles, transcripts…"
                rows={5}
                className="mb-2 w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] outline-none focus:border-emerald-500/50"
              />
              <button
                type="button"
                onClick={uploadPasted}
                disabled={!pasteTitle.trim() || !pasteText.trim() || uploading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add to knowledge base
              </button>
            </motion.div>
          )}

          {/* Doc list */}
          <div className="nx-scroll min-h-0 flex-1 space-y-2 overflow-y-auto sm:max-h-none" role="list">
            {loading ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
                <Library className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" aria-hidden />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  No documents yet. Upload files above and NEXUS will index them for cited answers.
                </p>
              </div>
            ) : (
              docs.map((doc) => {
                const Icon = formatIcon(doc.format)
                return (
                  <motion.div
                    key={doc.id}
                    role="listitem"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-emerald-500/30"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{doc.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {doc.chunkCount} chunks · {formatBytes(doc.size)} · {doc.format.toUpperCase()}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${doc.title}`}
                      onClick={() => deleteDoc(doc.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground/60 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </motion.div>
                )
              })
            )}
          </div>
        </aside>

        {/* Right: cited Q&A */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-label="Ask your documents">
          {/* Thread */}
          <div ref={threadRef} className="nx-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500"
                >
                  <Sparkles className="h-7 w-7" aria-hidden />
                </motion.span>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">Ask your knowledge base</p>
                  <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                    Every answer is grounded in your uploaded documents with numbered citations you can verify.
                  </p>
                </div>
                {docs.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {['Summarize my documents', 'What are the key points?', 'List any deadlines or dates'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setQuestion(s)
                          inputRef.current?.focus()
                        }}
                        className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[12px] text-muted-foreground transition hover:border-emerald-500/40 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              turns.map((turn, i) =>
                turn.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#ff5a5f] to-[#e8484d] px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-sm">
                      {turn.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <Library className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 max-w-[88%] flex-1">
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-muted/40 px-4 py-3 text-[13.5px] leading-relaxed text-foreground">
                        {asking && turn.text === '' && i === turns.length - 1 ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Searching your documents…
                          </span>
                        ) : (
                          <CitedText text={turn.text} sources={turn.sources} />
                        )}
                      </div>
                      {/* Sources */}
                      {turn.sources && turn.sources.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            <Quote className="h-3 w-3" aria-hidden /> Sources
                          </p>
                          {turn.sources.map((s) => (
                            <details
                              key={s.n}
                              id={`kb-src-${s.n}`}
                              className="group rounded-xl border border-border bg-muted/30 px-3 py-2"
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-foreground">
                                <span className="grid h-5 min-w-5 place-items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1 text-[10px] font-bold text-emerald-500">
                                  {s.n}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{s.filename} · chunk {s.chunk}</span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden />
                              </summary>
                              <p className="mt-2 border-t border-border pt-2 text-[12px] leading-relaxed text-muted-foreground">
                                {s.snippet}…
                              </p>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/40 p-2 transition focus-within:border-emerald-500/50">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask()
                  }
                }}
                rows={1}
                placeholder={docs.length === 0 ? 'Upload a document first…' : 'Ask anything about your documents…'}
                aria-label="Ask your knowledge base"
                disabled={docs.length === 0}
                className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={ask}
                disabled={!question.trim() || asking || docs.length === 0}
                aria-label="Send question"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/70">
              Answers come only from your documents — every claim is cited.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
