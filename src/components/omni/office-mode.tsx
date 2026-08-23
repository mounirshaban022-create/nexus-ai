'use client'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Presentation,
  Sparkles,
  UploadCloud,
  Wand2,
  Download,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from './markdown'
import { useToast } from '@/hooks/use-toast'

type Format = 'docx' | 'xlsx' | 'pptx' | 'md'

interface OfficeBlock {
  type: 'heading' | 'paragraph' | 'bullets' | 'table' | 'slide'
  text?: string
  level?: number
  items?: string[]
  title?: string
  bullets?: string[]
  rows?: string[][]
}

interface GeneratedFile {
  url: string
  format: string
  title: string
  filename: string
  size: number
}

const FORMATS: Array<{ id: Format; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: 'docx', label: 'Word', icon: FileText, hint: 'Reports, letters, plans' },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, hint: 'Budgets, data, trackers' },
  { id: 'pptx', label: 'PowerPoint', icon: Presentation, hint: 'Pitch decks, presentations' },
  { id: 'md', label: 'Markdown', icon: FileType2, hint: 'Docs, notes, READMEs' },
]

const THEMES = [
  { id: 'nexus', label: 'Nexus Violet', swatch: 'linear-gradient(135deg,#7C3AED,#C026D3)' },
  { id: 'executive', label: 'Executive', swatch: 'linear-gradient(135deg,#0F766E,#D97706)' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#B45309,#BE185D)' },
  { id: 'rosewood', label: 'Rosewood', swatch: 'linear-gradient(135deg,#BE123C,#7C3AED)' },
]

const IDEAS = [
  'A pitch deck for an AI startup raising a seed round',
  'A weekly meal plan with a grocery budget spreadsheet',
  'A project plan document for launching a mobile app',
  'A business review presentation with revenue tables',
]

/** Asks the LLM to turn a prompt into structured document blocks. */
async function planDocument(prompt: string): Promise<{ title: string; blocks: OfficeBlock[] }> {
  const res = await fetch('/api/office/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Could not plan the document.')
  return { title: data.title, blocks: data.blocks }
}

export function OfficeMode() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [format, setFormat] = useState<Format>('docx')
  const [theme, setTheme] = useState<string>('nexus')
  const [generating, setGenerating] = useState(false)
  const [file, setFile] = useState<GeneratedFile | null>(null)

  // Reading state
  const [reading, setReading] = useState(false)
  const [readResult, setReadResult] = useState<{
    format: string
    text?: string
    slides?: Array<{ title?: string; texts: string[] }>
    sheets?: Array<{ name: string; rows: string[][] }>
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const generate = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || generating) return
    setGenerating(true)
    setFile(null)
    try {
      // Step 1: plan the document structure with the LLM
      const plan = await planDocument(trimmed)
      // Step 2: build the real file
      const res = await fetch('/api/office/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, title: plan.title, blocks: plan.blocks, theme }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Document generation failed.')
      setFile(data.file)
      toast({
        title: `${data.file.format.toUpperCase()} ready!`,
        description: `${plan.title} — ${(data.file.size / 1024).toFixed(1)} KB`,
      })
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }, [prompt, format, generating, toast])

  const readFile = useCallback(
    async (f: File) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      const formatMap: Record<string, string> = {
        pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', txt: 'txt', md: 'md',
      }
      const fmt = formatMap[ext]
      if (!fmt) {
        toast({ title: 'Unsupported file', description: 'Upload PDF, DOCX, XLSX, PPTX, TXT or MD.', variant: 'destructive' })
        return
      }
      if (f.size > 12 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Please use a file under 12MB.', variant: 'destructive' })
        return
      }
      setReading(true)
      setReadResult(null)
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Could not read file'))
          reader.readAsDataURL(f)
        })
        const res = await fetch('/api/office/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: b64, format: fmt, filename: f.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not read that file.')
        setReadResult(data.document)
      } catch (error) {
        toast({
          title: 'Read failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setReading(false)
      }
    },
    [toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <FileText className="h-5 w-5 text-sky-700" aria-hidden /> Office Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create real Word, Excel, PowerPoint &amp; Markdown documents — or read any file you
            upload. Powered by open-source engines (docx · SheetJS · PptxGenJS).
          </p>
        </header>

        {/* Format picker */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Document format">
          {FORMATS.map((f) => {
            const Icon = f.icon
            const active = format === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 transition ${
                  active
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-border/60 bg-card/60 text-muted-foreground hover:border-sky-500/30'
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? 'text-sky-700' : ''}`} aria-hidden />
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[10px] text-muted-foreground">{f.hint}</span>
              </button>
            )
          })}
        </div>

        {/* Theme picker */}
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Document theme">
          <span className="text-xs font-medium text-muted-foreground">Theme:</span>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                theme === t.id
                  ? 'border-border bg-secondary text-foreground'
                  : 'border-border/60 bg-card/50 text-muted-foreground hover:border-sky-500/30'
              }`}
            >
              <span
                className="h-3.5 w-3.5 rounded-full shadow-inner"
                style={{ background: t.swatch }}
                aria-hidden
              />
              {t.label}
            </button>
          ))}
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
            Auto-picked from title if not set
          </span>
        </div>

        {/* Create */}
        <div className="mt-5 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <label htmlFor="office-prompt" className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            Describe your document
          </label>
          <Textarea
            id="office-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A 5-slide pitch deck for a food-delivery startup: problem, solution, market, traction, ask"
            rows={3}
            className="mt-2 resize-none border-border/70 bg-background/60 focus-visible:ring-primary/40"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => setPrompt(idea)}
                disabled={generating}
                className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-700 disabled:opacity-50"
              >
                {idea.length > 44 ? idea.slice(0, 44) + '…' : idea}
              </button>
            ))}
          </div>
          <Button
            onClick={generate}
            disabled={!prompt.trim() || generating}
            className="mt-4 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Planning &amp; building your document…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Generate {FORMATS.find((f) => f.id === format)?.label}
              </>
            )}
          </Button>
        </div>

        {/* Generated file */}
        <AnimatePresence>
          {file && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 p-4"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-secondary text-sky-700">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.title}</p>
                <p className="text-xs text-muted-foreground">
                  {file.format.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB · ready to download
                </p>
              </div>
              <Button asChild className="gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 text-white hover:from-sky-400 hover:to-violet-400">
                <a href={`${file.url}?download=1&title=${encodeURIComponent(file.title)}`}>
                  <Download className="h-4 w-4" /> Download
                </a>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Read files */}
        <section className="mt-8" aria-label="Read a document">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Or read an existing file
          </h3>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a document to read"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) readFile(f)
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 text-center transition ${
              dragging
                ? 'border-primary/50 bg-primary/10'
                : 'border-border bg-card hover:bg-secondary/60'
            }`}
          >
            {reading ? (
              <>
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-sky-700" aria-hidden />
                <p className="text-sm text-muted-foreground">Extracting content…</p>
              </>
            ) : (
              <>
                <UploadCloud className="mb-3 h-8 w-8 text-sky-700/70" aria-hidden />
                <p className="text-sm font-medium">Drop a file here, or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF · Word · Excel · PowerPoint · TXT · MD — analyzed instantly
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) readFile(f)
                e.target.value = ''
              }}
            />
          </div>

          <AnimatePresence>
            {readResult && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur"
              >
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <p className="text-sm font-semibold">
                    Extracted content
                    <span className="ml-2 rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] font-normal text-muted-foreground uppercase">
                      {readResult.format}
                    </span>
                  </p>
                  <button
                    onClick={() => setReadResult(null)}
                    aria-label="Close extracted content"
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="omni-scroll max-h-[50vh] overflow-y-auto px-4 py-4">
                  {readResult.slides && readResult.slides.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {readResult.slides.map((s, i) => (
                        <span
                          key={i}
                          className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          {i + 1}. {s.title?.slice(0, 40) || 'Slide'}
                        </span>
                      ))}
                    </div>
                  )}
                  {readResult.sheets && readResult.sheets.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {readResult.sheets.map((s) => (
                        <span
                          key={s.name}
                          className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          📊 {s.name} ({s.rows.length} rows)
                        </span>
                      ))}
                    </div>
                  )}
                  <Markdown content={readResult.text ?? ''} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
