'use client'

/**
 * STUDIO PDF TOOLS — powered by Stirling-PDF
 * (github.com/Stirling-Tools/Stirling-PDF, ~40k stars), self-hosted.
 *
 * Real PDF EDITING that no JS library can do: merge, split, rotate,
 * remove/reorder pages, watermark, convert to HTML/images — every
 * operation runs on the actual PDF binary via the Stirling engine.
 */

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  Combine,
  Download,
  FileDown,
  FileImage,
  FileText,
  FileType,
  Info,
  Loader2,
  Merge,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

export interface StudioPdfProps {
  onDownloadFile: (file: { url: string; format: string; title: string; size: number }) => void
}

interface LoadedPdf {
  name: string
  dataUrl: string
  pageCount?: number
  fileSize?: number
}

type PdfOp =
  | 'info' | 'merge' | 'split' | 'rotate' | 'removePages' | 'rearrange'
  | 'singlePage' | 'toHtml' | 'toImages' | 'watermark'

interface OpDef {
  id: PdfOp
  label: string
  desc: string
  icon: any
  /** Extra inputs the operation needs */
  fields?: Array<{
    key: string
    label: string
    placeholder: string
    type?: 'text' | 'number'
    defaultValue?: string
  }>
  needsSecondFile?: boolean
}

const OPERATIONS: OpDef[] = [
  {
    id: 'rotate',
    label: 'Rotate',
    desc: 'Turn every page 90° / 180° / 270°',
    icon: ArrowLeftRight,
    fields: [{ key: 'angle', label: 'Angle (°)', placeholder: '90', defaultValue: '90' }],
  },
  {
    id: 'removePages',
    label: 'Delete pages',
    desc: 'Remove specific pages (e.g. 1,3-5)',
    icon: Trash2,
    fields: [{ key: 'pageNumbers', label: 'Pages to delete', placeholder: 'e.g. 1,3-5' }],
  },
  {
    id: 'rearrange',
    label: 'Reorder pages',
    desc: 'New order, e.g. 3,1,2',
    icon: ArrowLeftRight,
    fields: [{ key: 'newPageOrder', label: 'New page order', placeholder: 'e.g. 3,1,2' }],
  },
  {
    id: 'split',
    label: 'Split',
    desc: 'Extract pages to separate PDFs (ZIP)',
    icon: FileDown,
    fields: [{ key: 'pages', label: 'Pages', placeholder: 'all or e.g. 1-3' }],
  },
  {
    id: 'merge',
    label: 'Merge',
    desc: 'Combine this PDF with another',
    icon: Combine,
    needsSecondFile: true,
  },
  {
    id: 'watermark',
    label: 'Watermark',
    desc: 'Stamp text over every page',
    icon: ShieldCheck,
    fields: [
      { key: 'watermarkText', label: 'Watermark text', placeholder: 'CONFIDENTIAL' },
      { key: 'fontSize', label: 'Font size', placeholder: '30', defaultValue: '30' },
      { key: 'opacity', label: 'Opacity (0-1)', placeholder: '0.3', defaultValue: '0.3' },
      { key: 'rotation', label: 'Rotation (°)', placeholder: '45', defaultValue: '45' },
    ],
  },
  {
    id: 'singlePage',
    label: 'Single page',
    desc: 'Merge all pages into one long page',
    icon: FileText,
  },
  {
    id: 'toHtml',
    label: 'To HTML',
    desc: 'Convert the PDF to a web page',
    icon: FileType,
  },
  {
    id: 'toImages',
    label: 'To images',
    desc: 'Render pages as PNG images (ZIP)',
    icon: FileImage,
    fields: [
      { key: 'imageFormat', label: 'Format', placeholder: 'png', defaultValue: 'png' },
      { key: 'dpi', label: 'DPI', placeholder: '150', defaultValue: '150' },
    ],
  },
]

export function StudioPdf({ onDownloadFile }: StudioPdfProps) {
  const { toast } = useToast()
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [pdf2, setPdf2] = useState<LoadedPdf | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [activeOp, setActiveOp] = useState<PdfOp | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ url: string; format: string; title: string; size: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const input2Ref = useRef<HTMLInputElement>(null)

  const loadPdf = useCallback(
    async (f: File, slot: 1 | 2) => {
      if (f.size > 40 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'PDFs up to 40MB.', variant: 'destructive' })
        return
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error('read failed'))
        r.readAsDataURL(f)
      })
      if (slot === 1) {
        setPdf({ name: f.name, dataUrl, fileSize: f.size })
        setResult(null)
        setActiveOp(null)
        // Fetch page count for context
        try {
          const res = await fetch('/api/studio/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'info', file: dataUrl }),
          })
          const data = await res.json()
          if (res.ok && data.info?.pageCount) {
            setPdf((p) => (p ? { ...p, pageCount: data.info.pageCount } : p))
          }
        } catch {
          /* info is best-effort */
        }
      } else {
        setPdf2({ name: f.name, dataUrl, fileSize: f.size })
      }
    },
    [toast]
  )

  const runOperation = useCallback(
    async (op: PdfOp) => {
      if (!pdf || busy) return
      if (op === 'merge' && !pdf2) {
        toast({ title: 'Add a second PDF', description: 'Pick the PDF to merge with first.' })
        input2Ref.current?.click()
        return
      }
      const def = OPERATIONS.find((o) => o.id === op)
      const params: Record<string, string> = {}
      let missing: string | null = null
      for (const f of def?.fields ?? []) {
        const v = (fieldValues[f.key] ?? f.defaultValue ?? '').trim()
        if (!v) missing = f.label
        params[f.key] = v
      }
      if (missing) {
        toast({ title: 'Fill in the required field', description: `“${missing}” is needed for ${def?.label}.`, variant: 'destructive' })
        return
      }
      setBusy(op)
      setResult(null)
      try {
        const res = await fetch('/api/studio/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: op,
            file: pdf.dataUrl,
            file2: op === 'merge' ? pdf2?.dataUrl : undefined,
            params,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'The PDF operation failed.')
        if (data.info) {
          // info op
          toast({ title: 'PDF info', description: `${data.info.pageCount} pages · ${(data.info.fileSize / 1024).toFixed(1)} KB · PDF v${data.info.pdfVersion}` })
          return
        }
        setResult(data.file)
        onDownloadFile(data.file)
        toast({ title: `${def?.label} done`, description: 'Result ready — download below.' })
      } catch (error) {
        toast({ title: 'Operation failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
      } finally {
        setBusy(null)
      }
    },
    [pdf, pdf2, busy, fieldValues, onDownloadFile, toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <FileDown className="h-5 w-5 text-primary" aria-hidden /> PDF Tools
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real PDF editing powered by{' '}
            <a href="https://github.com/Stirling-Tools/Stirling-PDF" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Stirling-PDF
            </a>{' '}
            — merge, split, rotate, reorder, watermark and convert the actual PDF file.
          </p>
        </header>

        {/* Upload zone */}
        {!pdf ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a PDF to edit"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) void loadPdf(f, 1)
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-16 text-center transition hover:border-primary/40 hover:bg-secondary/40"
          >
            <Upload className="mb-3 h-9 w-9 text-primary/70" aria-hidden />
            <p className="text-sm font-medium">Drop a PDF here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">Every operation runs on the real PDF binary — not a re-render</p>
          </div>
        ) : (
          <>
            {/* Loaded file card */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{pdf.name}</p>
                <p className="text-xs text-muted-foreground">
                  {pdf.pageCount ? `${pdf.pageCount} pages · ` : ''}
                  {pdf.fileSize ? `${(pdf.fileSize / 1024).toFixed(1)} KB` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} className="rounded-lg text-xs">
                <Upload className="mr-1 h-3.5 w-3.5" /> Replace
              </Button>
              <button
                onClick={() => { setPdf(null); setResult(null); setActiveOp(null) }}
                aria-label="Remove PDF"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Operation grid */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {OPERATIONS.map((op) => {
                const Icon = op.icon
                const isActive = activeOp === op.id
                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      const next = isActive ? null : op.id
                      setActiveOp(next)
                      // Reset field values to defaults when opening
                      if (next) {
                        const defaults: Record<string, string> = {}
                        for (const f of op.fields ?? []) defaults[f.key] = f.defaultValue ?? ''
                        setFieldValues(defaults)
                      }
                    }}
                    aria-pressed={isActive}
                    className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold">{op.label}</span>
                    <span className="text-[11px] leading-snug text-muted-foreground">{op.desc}</span>
                  </button>
                )
              })}
            </div>

            {/* Active operation panel */}
            <AnimatePresence>
              {activeOp && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
                    {(() => {
                      const def = OPERATIONS.find((o) => o.id === activeOp)!
                      return (
                        <>
                          <p className="flex items-center gap-2 text-sm font-semibold">
                            <def.icon className="h-4 w-4 text-primary" aria-hidden /> {def.label}
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {(def.fields ?? []).map((f) => (
                              <label key={f.key} className="flex flex-col gap-1 text-xs font-medium">
                                {f.label}
                                <input
                                  type={f.type ?? 'text'}
                                  value={fieldValues[f.key] ?? ''}
                                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                  placeholder={f.placeholder}
                                  aria-label={f.label}
                                  className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                                />
                              </label>
                            ))}
                            {def.needsSecondFile && (
                              <div className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">
                                Second PDF to merge
                                {pdf2 ? (
                                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                                    <span className="flex-1 truncate text-sm">{pdf2.name}</span>
                                    <button onClick={() => setPdf2(null)} aria-label="Remove second PDF" className="text-muted-foreground hover:text-destructive">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => input2Ref.current?.click()} className="w-fit rounded-lg text-xs">
                                    <Upload className="mr-1 h-3.5 w-3.5" /> Choose second PDF
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            onClick={() => runOperation(activeOp)}
                            disabled={!!busy || (activeOp === 'merge' && !pdf2)}
                            className="mt-4 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:brightness-110 sm:w-auto"
                          >
                            {busy === activeOp ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Processing with Stirling-PDF…
                              </>
                            ) : (
                              <>
                                <def.icon className="h-4 w-4" /> Run {def.label}
                              </>
                            )}
                          </Button>
                        </>
                      )
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                    <Download className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{result.title}</p>
                    <p className="text-xs text-muted-foreground">{result.format.toUpperCase()} · {(result.size / 1024).toFixed(1)} KB · ready</p>
                  </div>
                  <Button asChild size="sm" className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                    <a href={`${result.url}?download=1&title=${encodeURIComponent(result.title)}`}>Download</a>
                  </Button>
                  <button onClick={() => setResult(null)} aria-label="Dismiss result" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Hidden inputs */}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void loadPdf(f, 1)
            e.target.value = ''
          }}
        />
        <input
          ref={input2Ref}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void loadPdf(f, 2)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
