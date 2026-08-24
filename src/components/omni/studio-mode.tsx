'use client'

/**
 * NEXUS STUDIO — the ONE unified creative suite that replaces the old
 * scattered document tools (Writing / Office / Documents / Upload /
 * Document analysis).
 *
 * Built on the best open-source engines from GitHub:
 *   - BlockNote   (github.com/TypeCellOS/BlockNote) — Notion-style block
 *     editor with slash commands & drag-and-drop. Rivals Claude's Canvas.
 *   - Excalidraw  (github.com/excalidraw/excalidraw) — visual whiteboard
 *     with shapes, arrows & freehand drawing. Rivals Canva.
 *
 * One surface, every power: AI writing, AI editing, AI canvas design,
 * file import (PDF/Word/Excel/PPT), and real exports (DOCX / MD / PNG).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FileText,
  Languages,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  ListChecks,
  Upload,
  Wand2,
  X,
  Type,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePreferences } from '@/lib/preferences'
import { useToast } from '@/hooks/use-toast'

// Heavy editor is lazy-loaded (client only) — keeps the main bundle fast.
const StudioDocEditor = dynamic(
  () => import('./studio-doc-editor').then((m) => m.StudioDocEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    ),
  }
)
// Lightweight built-in SVG canvas — imports directly (no compile-time cost).
import { StudioCanvas, exportSvgToPng, type CanvasElementSeed } from './studio-canvas'

// Editor API types (loose — the real types come from the lazy modules)
type BlockNoteEditorLike = {
  document: unknown[]
  getSelection: () => unknown[] | null
  replaceBlocks: (blocksToRemove: unknown[], blocks: unknown[]) => Promise<void>
  insertBlocks: (blocks: unknown[], reference: unknown, placement?: string) => Promise<void>
  tryParseMarkdownToBlocks: (md: string) => unknown[]
  blocksToMarkdownLossy: (blocks?: unknown[]) => Promise<string>
  focus: () => void
}
type CanvasApiLike = {
  getSvg: () => SVGSVGElement | null
  loadSeeds: (seeds: CanvasElementSeed[]) => void
}

type StudioTab = 'doc' | 'canvas'

export interface StudioModeProps {
  open: boolean
  onClose: () => void
}

const TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank document',
    icon: FileText,
    markdown: '# Untitled\n\nStart writing, or use the AI tools above…',
  },
  {
    id: 'report',
    label: 'Report',
    icon: FileText,
    markdown:
      '# Report Title\n\n## Overview\n\nDescribe the purpose of this report.\n\n## Key Findings\n\n- Finding one\n- Finding two\n\n## Recommendations\n\n1. First recommendation\n2. Second recommendation\n\n## Conclusion\n\nWrap up with the main takeaway.',
  },
  {
    id: 'letter',
    label: 'Letter',
    icon: PenLine,
    markdown:
      '# Formal Letter\n\n**Date:** (today)\n\n**To:**\nRecipient name\nAddress\n\nDear Recipient,\n\nOpening paragraph — state the purpose of your letter.\n\nBody paragraph — provide context and details.\n\nClosing paragraph — state the expected next step.\n\nSincerely,\nYour name',
  },
  {
    id: 'notes',
    label: 'Meeting notes',
    icon: PenLine,
    markdown:
      '# Meeting Notes\n\n**Date:** (today)\n**Attendees:** \n\n## Agenda\n\n- Topic one\n- Topic two\n\n## Discussion\n\nSummary of what was covered.\n\n## Action Items\n\n| Task | Owner | Due |\n|------|-------|-----|\n|      |       |     |\n\n## Next Steps\n\nFollow-ups and next meeting.',
  },
]

export function StudioMode({ open, onClose }: StudioModeProps) {
  const { theme } = usePreferences()
  const { toast } = useToast()

  const [tab, setTab] = useState<StudioTab>('doc')
  const [title, setTitle] = useState('Untitled document')
  const [initialMarkdown, setInitialMarkdown] = useState<string | undefined>(undefined)
  const [docStarted, setDocStarted] = useState(false)

  const [busy, setBusy] = useState<string | null>(null) // 'write' | 'import' | 'export' | 'enhance'...
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiKind, setAiKind] = useState('document')
  const [canvasPrompt, setCanvasPrompt] = useState('')
  const [canvasAiOpen, setCanvasAiOpen] = useState(false)

  const editorRef = useRef<BlockNoteEditorLike | null>(null)
  const canvasRef = useRef<CanvasApiLike | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportedFile, setExportedFile] = useState<{ url: string; format: string; title: string; size: number } | null>(null)

  // Reset on open.
  useEffect(() => {
    if (open) {
      setExportedFile(null)
      setAiOpen(false)
      setCanvasAiOpen(false)
    }
  }, [open])

  /* ---------------- AI actions ---------------- */

  const runAi = useCallback(async (action: string, prompt: string, text?: string, language?: string) => {
    setBusy(action)
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prompt, text, language, kind: action === 'write' ? aiKind : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI request failed.')
      return data
    } finally {
      setBusy(null)
    }
  }, [aiKind])

  const aiWrite = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || busy) return
    setAiOpen(false)
    try {
      const data = await runAi('write', prompt)
      const markdown: string = data.markdown || ''
      if (!markdown) throw new Error('The AI returned an empty document. Try rephrasing.')
      // Derive the title from the first heading
      const h1 = /^#\s+(.+)$/m.exec(markdown)
      if (h1) setTitle(h1[1].trim().slice(0, 80))
      const editor = editorRef.current
      if (editor) {
        const blocks = editor.tryParseMarkdownToBlocks(markdown)
        if (blocks && blocks.length > 0) {
          await editor.replaceBlocks(editor.document, blocks)
        }
      } else {
        setInitialMarkdown(markdown)
        setDocStarted(false)
      }
      setTab('doc')
      toast({ title: 'Document written', description: 'The AI draft is now in the editor — edit anything you like.' })
    } catch (error) {
      toast({ title: 'AI write failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    }
    setAiPrompt('')
  }, [aiPrompt, busy, runAi, toast])

  /** Applies an AI text transformation to the editor's current selection. */
  const aiTransform = useCallback(async (action: 'enhance' | 'summarize' | 'translate' | 'continue', language?: string) => {
    const editor = editorRef.current
    if (!editor || busy) return
    const selection = editor.getSelection()
    const target = selection && selection.length > 0 ? selection : editor.document
    const hasSelection = !!(selection && selection.length > 0)
    if (!hasSelection && action !== 'continue') {
      toast({ title: 'Select some text first', description: 'Click into the editor and highlight the blocks you want to transform.' })
      return
    }
    try {
      const sourceMd = await editor.blocksToMarkdownLossy(target as never)
      if (!sourceMd.trim() && action !== 'continue') {
        toast({ title: 'Nothing selected', description: 'Select blocks in the editor first.' })
        return
      }
      const data = await runAi(action, action, sourceMd, language)
      const markdown: string = data.markdown || ''
      if (!markdown) throw new Error('The AI returned empty output. Try again.')
      const newBlocks = editor.tryParseMarkdownToBlocks(markdown)
      if (action === 'continue') {
        // Append at the end of the document.
        const doc = editor.document as unknown[]
        const last = doc[doc.length - 1]
        await editor.insertBlocks(newBlocks, last, 'after')
      } else {
        await editor.replaceBlocks(target as never, newBlocks as never)
      }
      toast({
        title: action === 'enhance' ? 'Selection enhanced' : action === 'summarize' ? 'Summary created' : action === 'translate' ? 'Translation applied' : 'Continued',
      })
    } catch (error) {
      toast({ title: 'AI edit failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    }
  }, [busy, runAi, toast])

  /** AI designs a canvas scene from a prompt. */
  const aiDesign = useCallback(async () => {
    const prompt = canvasPrompt.trim()
    if (!prompt || busy) return
    const api = canvasRef.current
    if (!api) return
    setBusy('design')
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'canvas_plan', prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Canvas design failed.')
      const seeds = data.elements ?? []
      if (!Array.isArray(seeds) || seeds.length === 0) {
        throw new Error('The AI could not design that. Try describing a diagram or flow.')
      }
      api.loadSeeds(seeds)
      setCanvasAiOpen(false)
      setCanvasPrompt('')
      toast({ title: 'Canvas designed', description: 'AI laid out a starter scene — move, restyle and add to it freely.' })
    } catch (error) {
      toast({ title: 'Canvas design failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }, [busy, canvasPrompt, toast])

  /* ---------------- Import ---------------- */

  const importFile = useCallback(async (f: File) => {
    if (busy) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    const formatMap: Record<string, string> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', txt: 'txt', md: 'md', csv: 'csv' }
    const fmt = formatMap[ext]
    if (!fmt) {
      toast({ title: 'Unsupported file', description: 'Import PDF, DOCX, XLSX, PPTX, TXT, MD or CSV.', variant: 'destructive' })
      return
    }
    if (f.size > 12 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please use a file under 12MB.', variant: 'destructive' })
      return
    }
    setBusy('import')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Could not read file'))
        reader.readAsDataURL(f)
      })
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: dataUrl, filename: f.name, format: fmt }),
      })
      const data = await res.json()
      if (!res.ok || !data.document) throw new Error(data.error || 'Could not read that file.')
      // The POST returns only a preview — fetch the fully parsed document
      // (sections, tables, text) from the GET endpoint.
      const fullRes = await fetch(`/api/documents?id=${encodeURIComponent(data.document.id)}`)
      const fullData = await fullRes.json()
      const doc = fullData.document ?? data.document
      // Build markdown from the parsed sections (fallback: raw text/preview)
      const parts: string[] = [`# ${doc.title || f.name}`]
      if (doc.metadata?.wordCount) parts.push(`*${doc.metadata.wordCount.toLocaleString()} words · imported from ${f.name}*`)
      if (Array.isArray(doc.sections) && doc.sections.length > 0) {
        for (const section of doc.sections) {
          parts.push('', `## ${section.heading}`, section.content)
        }
      } else {
        const raw = doc.text || doc.preview || ''
        if (raw.trim()) parts.push('', raw)
      }
      if (doc.tables?.length) {
        for (const t of doc.tables) {
          parts.push('', `**${t.caption}**`)
          if (t.rows?.length) {
            const [head, ...rest] = t.rows
            parts.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`)
            for (const row of rest.slice(0, 30)) parts.push(`| ${row.join(' | ')} |`)
          }
        }
      }
      const markdown = parts.join('\n').slice(0, 60000)
      setInitialMarkdown(markdown)
      setDocStarted(false)
      setTitle((doc.title || f.name).slice(0, 80))
      setTab('doc')
      toast({ title: 'Imported', description: `${f.name} is now fully editable in the Studio.` })
    } catch (error) {
      toast({ title: 'Import failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }, [busy, toast])

  /* ---------------- Export ---------------- */

  const exportDoc = useCallback(async (format: 'docx' | 'md') => {
    const editor = editorRef.current
    if (!editor || busy) return
    setBusy('export')
    try {
      const markdown = await editor.blocksToMarkdownLossy()
      if (!markdown.trim()) {
        toast({ title: 'Nothing to export', description: 'Write something first.' })
        return
      }
      const res = await fetch('/api/studio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, title, markdown }),
      })
      const data = await res.json()
      if (!res.ok || !data.file) throw new Error(data.error || 'Export failed.')
      setExportedFile(data.file)
      toast({ title: `${format.toUpperCase()} ready`, description: `${data.file.filename} — download below.` })
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }, [busy, title, toast])

  const exportCanvas = useCallback(async () => {
    const api = canvasRef.current
    if (!api || busy) return
    setBusy('export')
    try {
      const svg = api.getSvg()
      if (!svg) throw new Error('Canvas not ready')
      await exportSvgToPng(svg, `${title.replace(/\s+/g, '-').toLowerCase() || 'canvas'}.png`)
      toast({ title: 'PNG exported', description: 'Your canvas was saved as an image.' })
    } catch (error) {
      toast({ title: 'Canvas export failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }, [busy, title, toast])

  /* ---------------- Templates ---------------- */

  const applyTemplate = useCallback((markdown: string, label: string) => {
    setInitialMarkdown(markdown)
    setDocStarted(false)
    const h1 = /^#\s+(.+)$/m.exec(markdown)
    if (h1) setTitle(h1[1].replace(/\s*\(.*\)/, '').trim().slice(0, 80))
    setTab('doc')
    toast({ title: `${label} template loaded` })
  }, [toast])

  const bnTheme = theme === 'dark' ? 'dark' : 'light'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex flex-col bg-background"
          role="dialog"
          aria-label="NEXUS Studio"
        >
          {/* ===== Header ===== */}
          <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
                <Wand2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-bold">Studio</span>
                <span className="hidden text-[10px] text-muted-foreground sm:block">BlockNote + Excalidraw · open-source</span>
              </div>
            </div>

            {/* Title input */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Document title"
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium outline-none transition hover:border-border focus:border-primary/40 focus:bg-card sm:max-w-xs"
              placeholder="Untitled"
            />

            {/* Tabs */}
            <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
              <button
                onClick={() => setTab('doc')}
                aria-pressed={tab === 'doc'}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === 'doc' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden /> Document
              </button>
              <button
                onClick={() => setTab('canvas')}
                aria-pressed={tab === 'canvas'}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === 'canvas' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden /> Canvas
              </button>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {tab === 'doc' ? (
                <>
                  <Button size="sm" onClick={() => setAiOpen(!aiOpen)} className="h-8 gap-1.5 rounded-lg bg-primary text-primary-foreground hover:brightness-110">
                    {busy === 'write' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI Write
                  </Button>
                  <div className="hidden items-center gap-1 sm:flex">
                    <Button size="sm" variant="outline" onClick={() => aiTransform('enhance')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs" title="Improve the selected blocks">
                      {busy === 'enhance' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Enhance
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => aiTransform('summarize')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs" title="Summarize the selection">
                      {busy === 'summarize' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />} Summarize
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => aiTransform('translate', 'Arabic')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs" title="Translate to Arabic">
                      <Languages className="h-3.5 w-3.5" /> عربي
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => aiTransform('translate', 'English')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs" title="Translate to English">
                      <Languages className="h-3.5 w-3.5" /> EN
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => aiTransform('continue')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs" title="Let the AI keep writing">
                      {busy === 'continue' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Continue
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs">
                    {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportDoc('docx')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs">
                    {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Word
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportDoc('md')} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs">
                    <FileText className="h-3.5 w-3.5" /> .md
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => setCanvasAiOpen(!canvasAiOpen)} className="h-8 gap-1.5 rounded-lg bg-primary text-primary-foreground hover:brightness-110">
                    {busy === 'design' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI Design
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportCanvas} disabled={!!busy} className="h-8 gap-1 rounded-lg text-xs">
                    {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PNG
                  </Button>
                </>
              )}
              <button
                onClick={onClose}
                aria-label="Close Studio"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* ===== AI Write drawer ===== */}
          <AnimatePresence>
            {aiOpen && tab === 'doc' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b border-border bg-secondary/40"
              >
                <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kind:</span>
                    {['document', 'report', 'letter', 'blog post', 'essay', 'proposal', 'meeting notes', 'documentation'].map((k) => (
                      <button
                        key={k}
                        onClick={() => setAiKind(k)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          aiKind === k ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-background/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aiWrite()
                      }}
                      rows={2}
                      placeholder="Describe the document — e.g. 'a project proposal for a mobile app with timeline and budget'…"
                      aria-label="AI document prompt"
                      className="min-h-[52px] flex-1 resize-none rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                    />
                    <Button onClick={aiWrite} disabled={!aiPrompt.trim() || !!busy} className="gap-1.5 rounded-xl">
                      <Sparkles className="h-3.5 w-3.5" /> Write it
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== AI Design drawer ===== */}
          <AnimatePresence>
            {canvasAiOpen && tab === 'canvas' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b border-border bg-secondary/40"
              >
                <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3">
                  <textarea
                    value={canvasPrompt}
                    onChange={(e) => setCanvasPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        aiDesign()
                      }
                    }}
                    rows={2}
                    placeholder="Describe the visual — e.g. 'a sales funnel flow with 4 stages and arrows', 'SWOT analysis quadrant'…"
                    aria-label="AI canvas prompt"
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                  />
                  <Button onClick={aiDesign} disabled={!canvasPrompt.trim() || !!busy} className="gap-1.5 rounded-xl">
                    <Sparkles className="h-3.5 w-3.5" /> Design it
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== Exported file banner ===== */}
          <AnimatePresence>
            {exportedFile && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border bg-emerald-500/5"
              >
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2.5">
                  <FileText className="h-4 w-4 text-emerald-600" aria-hidden />
                  <span className="flex-1 truncate text-sm font-medium">{exportedFile.title}</span>
                  <span className="text-xs text-muted-foreground">{exportedFile.format.toUpperCase()} · {(exportedFile.size / 1024).toFixed(1)} KB</span>
                  <Button asChild size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                    <a href={`${exportedFile.url}?download=1&title=${encodeURIComponent(exportedFile.title)}`}>Download</a>
                  </Button>
                  <button onClick={() => setExportedFile(null)} aria-label="Dismiss" className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== Editors ===== */}
          <div className="relative min-h-0 flex-1">
            {/* Document tab */}
            <div className={tab === 'doc' ? 'flex h-full flex-col' : 'hidden'}>
              {!docStarted && !initialMarkdown ? (
                <div className="omni-scroll flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-3xl px-4 py-10">
                    <h2 className="text-xl font-semibold">Start a document</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Write freely with the Notion-style editor, let AI draft it for you, or import an existing file.
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {TEMPLATES.map((t) => {
                        const Icon = t.icon
                        return (
                          <button
                            key={t.id}
                            onClick={() => applyTemplate(t.markdown, t.label)}
                            className="group flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                          >
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="text-sm font-medium">{t.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-5 text-center">
                      <UploadCloud className="mx-auto h-7 w-7 text-muted-foreground/70" aria-hidden />
                      <p className="text-sm font-medium">Import an existing file</p>
                      <p className="text-xs text-muted-foreground">PDF · Word · Excel · PowerPoint · TXT · MD · CSV — becomes fully editable</p>
                      <div className="mt-1 flex justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!!busy} className="rounded-lg text-xs">
                          {busy === 'import' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />} Choose file
                        </Button>
                        <Button size="sm" onClick={() => setAiOpen(true)} className="rounded-lg text-xs">
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> Or let AI write it
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto h-full w-full max-w-4xl px-2 sm:px-6">
                  <StudioDocEditor
                    key={initialMarkdown === undefined ? 'fresh' : `md-${initialMarkdown.length}-${initialMarkdown.slice(0, 40)}`}
                    initialMarkdown={initialMarkdown}
                    theme={bnTheme as 'light' | 'dark'}
                    onReady={(editor) => {
                      editorRef.current = editor as unknown as BlockNoteEditorLike
                      setDocStarted(true)
                    }}
                  />
                </div>
              )}
            </div>

            {/* Canvas tab */}
            <div className={tab === 'canvas' ? 'absolute inset-0' : 'hidden'}>
              <StudioCanvas
                onReady={(api) => {
                  canvasRef.current = api as unknown as CanvasApiLike
                }}
              />
            </div>
          </div>

          {/* Hidden file input for imports */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importFile(f)
              e.target.value = ''
            }}
          />

          {/* Mobile AI quick-actions bar (doc tab) */}
          {tab === 'doc' && docStarted && (
            <div className="flex items-center gap-1 overflow-x-auto border-t border-border bg-background px-3 py-1.5 sm:hidden">
              <Button size="sm" variant="ghost" onClick={() => aiTransform('enhance')} disabled={!!busy} className="h-8 shrink-0 gap-1 rounded-lg text-xs">
                <Wand2 className="h-3.5 w-3.5" /> Enhance
              </Button>
              <Button size="sm" variant="ghost" onClick={() => aiTransform('summarize')} disabled={!!busy} className="h-8 shrink-0 gap-1 rounded-lg text-xs">
                <ListChecks className="h-3.5 w-3.5" /> Summarize
              </Button>
              <Button size="sm" variant="ghost" onClick={() => aiTransform('translate', 'Arabic')} disabled={!!busy} className="h-8 shrink-0 gap-1 rounded-lg text-xs">
                <Languages className="h-3.5 w-3.5" /> عربي
              </Button>
              <Button size="sm" variant="ghost" onClick={() => aiTransform('continue')} disabled={!!busy} className="h-8 shrink-0 gap-1 rounded-lg text-xs">
                <Type className="h-3.5 w-3.5" /> Continue
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAiOpen(true)} className="h-8 shrink-0 gap-1 rounded-lg text-xs">
                <Plus className="h-3.5 w-3.5" /> AI Write
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Icon re-used in the empty state (kept at bottom to avoid a long import list above)
function UploadCloud({ className, ...props }: React.SVGProps<SVGSVGElement> & { 'aria-hidden'?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  )
}
