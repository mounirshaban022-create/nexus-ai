'use client'

import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Markdown } from './markdown'
import { useToast } from '@/hooks/use-toast'

/**
 * DOCUMENTS STUDIO — Claude-level document intelligence.
 * Upload any document → AI reads it → chat about it → edit it → export.
 */

interface DocMeta {
  id: string
  filename: string
  format: string
  title: string
  metadata: {
    pages?: number
    wordCount: number
    readingTime: number
    sheetNames?: string[]
    slideCount?: number
  }
  sectionCount: number
  tableCount: number
  preview: string
  summary: string
}

interface QA {
  question: string
  answer: string
}

export function DocumentsMode() {
  const { toast } = useToast()
  const [doc, setDoc] = useState<DocMeta | null>(null)
  const [parsing, setParsing] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qaHistory, setQaHistory] = useState<QA[]>([])
  const [editInstruction, setEditInstruction] = useState('')
  const [editing, setEditing] = useState(false)
  const [editResult, setEditResult] = useState<{ content: string; downloadUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const formatMap: Record<string, string> = {
        pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', txt: 'txt', md: 'md', csv: 'csv',
      }
      const format = formatMap[ext]
      if (!format) {
        toast({ title: 'Unsupported format', description: 'PDF, Word, Excel, PowerPoint, TXT, MD, CSV', variant: 'destructive' })
        return
      }
      if (file.size > 12 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Max 12MB.', variant: 'destructive' })
        return
      }
      setParsing(true)
      setDoc(null)
      setQaHistory([])
      setEditResult(null)
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Read failed'))
          reader.readAsDataURL(file)
        })
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: b64, filename: file.name, format }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed.')
        setDoc(data.document)
        toast({ title: 'Document analyzed ✓', description: `${data.document.metadata.wordCount} words · ${data.document.sectionCount} sections` })
      } catch (error) {
        toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
      } finally {
        setParsing(false)
      }
    },
    [toast]
  )

  const ask = useCallback(async () => {
    if (!doc || !question.trim() || asking) return
    const q = question.trim()
    setAsking(true)
    setQuestion('')
    try {
      const res = await fetch(`/api/documents?id=${doc.id}&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Query failed.')
      setQaHistory((prev) => [...prev, { question: q, answer: data.answer }])
    } catch (error) {
      toast({ title: 'Query failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    } finally {
      setAsking(false)
    }
  }, [doc, question, asking, toast])

  const editDoc = useCallback(async () => {
    if (!doc || !editInstruction.trim() || editing) return
    setEditing(true)
    setEditResult(null)
    try {
      const res = await fetch('/api/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, instruction: editInstruction.trim(), outputFormat: 'docx' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Edit failed.')
      setEditResult(data.edited)
      toast({ title: 'Document edited ✓', description: 'Download the updated version below.' })
    } catch (error) {
      toast({ title: 'Edit failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    } finally {
      setEditing(false)
    }
  }, [doc, editInstruction, editing, toast])

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" aria-hidden /> Documents Studio
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Upload any document — AI reads it, answers questions, and edits it. Claude-level document intelligence.
          </p>
        </header>

        {/* Upload zone */}
        {!doc && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a document"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) upload(f)
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center transition ${
              dragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40 hover:bg-accent/50'
            }`}
          >
            {parsing ? (
              <>
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" aria-hidden />
                <p className="text-sm font-medium">Analyzing your document…</p>
                <p className="mt-1 text-xs text-muted-foreground">Extracting text, sections, tables & structure</p>
              </>
            ) : (
              <>
                <UploadCloud className="mb-3 h-8 w-8 text-muted-foreground/70" aria-hidden />
                <p className="text-sm font-medium">Drop a document here, or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">PDF · Word · Excel · PowerPoint · TXT · MD · CSV</p>
                <p className="mt-2 text-xs text-muted-foreground/60">Ask questions · Edit · Export — like Claude</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
                e.target.value = ''
              }}
            />
          </div>
        )}

        {/* Document panel */}
        {doc && (
          <>
            {/* Doc header */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">
                {doc.format === 'pdf' ? '📕' : doc.format === 'docx' ? '📄' : doc.format === 'xlsx' ? '📊' : doc.format === 'pptx' ? '📽️' : '📝'}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{doc.filename}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {doc.metadata.wordCount.toLocaleString()} words · {doc.metadata.readingTime} min read
                  {doc.metadata.pages ? ` · ${doc.metadata.pages} pages` : ''}
                  {doc.metadata.slideCount ? ` · ${doc.metadata.slideCount} slides` : ''}
                  {doc.metadata.sheetNames?.length ? ` · ${doc.metadata.sheetNames.length} sheets` : ''}
                  {doc.sectionCount > 0 ? ` · ${doc.sectionCount} sections` : ''}
                  {doc.tableCount > 0 ? ` · ${doc.tableCount} tables` : ''}
                </p>
                {doc.summary && (
                  <p className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    <Sparkles className="mr-1 inline h-3 w-3 text-primary" aria-hidden />
                    {doc.summary}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setDoc(null); setQaHistory([]); setEditResult(null) }}
                aria-label="Close document"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Q&A */}
            <section className="mt-5" aria-label="Ask about this document">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Ask anything about it
              </h4>
              {qaHistory.length > 0 && (
                <div className="omni-scroll mb-3 max-h-80 space-y-3 overflow-y-auto">
                  {qaHistory.map((qa, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <p className="text-sm font-medium">{qa.question}</p>
                      <div className="mt-1 rounded-xl bg-card px-4 py-3">
                        <Markdown content={qa.answer} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); ask() }}
              >
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What are the key findings? Summarize section 2…"
                  disabled={asking}
                  className="h-11 flex-1 rounded-full border-border bg-card px-4 focus-visible:ring-primary/40"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!question.trim() || asking}
                  aria-label="Ask"
                  className="h-11 w-11 rounded-full bg-primary text-primary-foreground"
                >
                  {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </section>

            {/* Edit */}
            <section className="mt-6" aria-label="Edit document">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit with AI
              </h4>
              <Textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                placeholder="e.g. Make the tone more formal · Add an executive summary · Shorten to 1 page · Fix grammar…"
                rows={2}
                className="resize-none rounded-2xl border-border bg-card focus-visible:ring-primary/40"
              />
              <Button
                onClick={editDoc}
                disabled={!editInstruction.trim() || editing}
                className="mt-2 w-full gap-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                {editing ? 'Editing…' : 'Edit document & export'}
              </Button>

              {editResult && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 overflow-hidden rounded-2xl border border-border">
                  <div className="flex items-center justify-between bg-secondary/60 px-4 py-2.5">
                    <span className="text-xs font-medium">Edited version</span>
                    <a
                      href={`${editResult.downloadUrl}&download=1`}
                      className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      Download .docx
                    </a>
                  </div>
                  <div className="omni-scroll max-h-64 overflow-y-auto bg-card px-4 py-3">
                    <Markdown content={editResult.content} />
                  </div>
                </motion.div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
