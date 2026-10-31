'use client'

/**
 * VIDEO INTELLIGENCE — upload/paste a video, get an AI scene-analysis
 * report (markdown) and ask follow-up questions about it. Powered by the
 * platform's Z.ai vision engine (POST /api/video/analyze).
 *
 * Design language mirrors VideoMode/VisionMode: dark warm cards, the
 * orange→rose primary gradient CTA, pill toggles, omni-scroll panels.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Clapperboard,
  Copy,
  Link2,
  Loader2,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/omni/markdown'

const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25MB — matches the API guard
const MAX_URL_CHARS = 2048

interface UploadedVideo {
  dataUrl: string
  previewUrl: string
  name: string
  size: number
}

interface QAPair {
  id: string
  q: string
  a: string
}

type SourceMode = 'upload' | 'url'
type EngineStatus = 'checking' | 'ready' | 'unavailable'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoIntelMode() {
  const [mode, setMode] = useState<SourceMode>('upload')
  const [engine, setEngine] = useState<EngineStatus>('checking')

  const [video, setVideo] = useState<UploadedVideo | null>(null)
  const [urlValue, setUrlValue] = useState('')
  const [dragging, setDragging] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qa, setQA] = useState<QAPair[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Object URLs must be revoked when replaced/cleared/unmounted.
  const previewRef = useRef<string | null>(null)
  const qaEndRef = useRef<HTMLDivElement>(null)

  const clearPreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
  }, [])

  useEffect(() => clearPreview, [clearPreview])

  // Capability probe — decide feature vs "configure engine" hint.
  useEffect(() => {
    let alive = true
    fetch('/api/video/analyze/status')
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => {
        if (alive) setEngine(d.ok ? 'ready' : 'unavailable')
      })
      .catch(() => {
        if (alive) setEngine('unavailable')
      })
    return () => {
      alive = false
    }
  }, [])

  // The source sent to the API (data URL for uploads, direct URL otherwise).
  const trimmedUrl = urlValue.trim()
  const urlValid = /^https?:\/\/\S+$/i.test(trimmedUrl) && trimmedUrl.length <= MAX_URL_CHARS
  const activeSource = mode === 'upload' ? video?.dataUrl ?? null : urlValid ? trimmedUrl : null

  // A changed source invalidates the previous report + Q&A history.
  useEffect(() => {
    setReport(null)
    setQA([])
  }, [activeSource])

  // Keep the latest Q/A pair in view while answers stream in.
  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [qa.length, asking])

  const pickFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('video/')) {
        toast.error('Unsupported file', {
          description: 'Please choose a video file (MP4, WebM, MOV…).',
        })
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error('Video too large', {
          description: `"${file.name}" is ${formatBytes(file.size)} — the limit is 25MB. Trim it or paste a URL instead.`,
        })
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        clearPreview()
        const previewUrl = URL.createObjectURL(file)
        previewRef.current = previewUrl
        setVideo({ dataUrl: reader.result as string, previewUrl, name: file.name, size: file.size })
      }
      reader.onerror = () => toast.error('Could not read that file.')
      reader.readAsDataURL(file)
    },
    [clearPreview]
  )

  const clearVideo = useCallback(() => {
    clearPreview()
    setVideo(null)
  }, [clearPreview])

  const analyze = useCallback(async () => {
    const source = activeSource
    if (!source || analyzing) return
    setAnalyzing(true)
    setReport(null)
    try {
      const res = await fetch('/api/video/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = (await res.json()) as { analysis?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Video analysis failed.')
      setReport(data.analysis ?? '')
      toast.success('Video analysis ready')
    } catch (error) {
      toast.error('Analysis failed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setAnalyzing(false)
    }
  }, [activeSource, analyzing])

  const ask = useCallback(async () => {
    const source = activeSource
    const q = question.trim()
    if (!source || !q || asking) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setQA((prev) => [...prev, { id, q, a: '' }])
    setQuestion('')
    setAsking(true)
    try {
      const res = await fetch('/api/video/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, question: q }),
      })
      const data = (await res.json()) as { analysis?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not answer that question.')
      const a = data.analysis ?? ''
      setQA((prev) => prev.map((p) => (p.id === id ? { ...p, a } : p)))
    } catch (error) {
      // Drop the pending pair and restore the draft so the user can retry.
      setQA((prev) => prev.filter((p) => p.id !== id))
      setQuestion(q)
      toast.error('Follow-up failed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setAsking(false)
    }
  }, [activeSource, question, asking])

  const copyReport = useCallback(async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      toast.success('Report copied to clipboard')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not copy the report.')
    }
  }, [report])

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clapperboard className="h-5 w-5 text-primary" aria-hidden /> Video Intelligence
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Upload or paste a video — NEXUS watches it, breaks down the scenes, and answers your
            questions about what it sees.
          </p>
        </header>

        {engine === 'unavailable' && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-200"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <p>
              The video understanding engine isn&apos;t configured on this deployment yet — add the
              Z.ai gateway config (or <code className="font-mono text-[12px]">ZAI_BASE_URL</code> +{' '}
              <code className="font-mono text-[12px]">ZAI_API_KEY</code> env vars) to enable it.
            </p>
          </div>
        )}

        {/* Source input card */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-full bg-secondary/50 p-0.5" role="group" aria-label="Video source">
              {(
                [
                  { id: 'upload', label: 'Upload video', Icon: Upload },
                  { id: 'url', label: 'Paste URL', Icon: Link2 },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  aria-pressed={mode === id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    mode === id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[11px] text-muted-foreground/70">
              MP4, WebM, MOV · up to 25MB
            </span>
          </div>

          {mode === 'upload' ? (
            video ? (
              /* Local preview for uploads */
              <div className="relative mt-3 overflow-hidden rounded-xl border border-border/60 bg-black">
                <video
                  controls
                  playsInline
                  src={video.previewUrl}
                  className="max-h-72 w-full"
                  aria-label={`Preview of ${video.name}`}
                />
                <button
                  onClick={clearVideo}
                  aria-label="Remove video"
                  className="nx-scrim absolute right-2.5 top-2.5 rounded-full p-1.5 text-white/90 backdrop-blur transition hover:bg-destructive"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <p className="truncate border-t border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                  {video.name} · {formatBytes(video.size)}
                </p>
              </div>
            ) : (
              /* Drop zone + file picker */
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload a video for analysis"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) pickFile(file)
                }}
                className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-center transition ${
                  dragging
                    ? 'border-rose-400/70 bg-rose-500/10'
                    : 'border-border/70 bg-background/40 hover:border-rose-500/40 hover:bg-rose-500/5'
                }`}
              >
                <Upload className="mb-3 h-8 w-8 text-rose-400/70" aria-hidden />
                <p className="text-sm font-medium">Drop a video here, or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  MP4, WebM, MOV · up to 25MB · analysed privately
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) pickFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
            )
          ) : (
            /* Paste-URL mode */
            <div className="mt-3">
              <div className="relative">
                <Link2
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  maxLength={MAX_URL_CHARS}
                  inputMode="url"
                  aria-label="Video URL"
                  className="h-11 rounded-xl border-border/60 bg-background/60 pl-9 focus-visible:ring-primary/40"
                />
              </div>
              {urlValid && (
                <div className="relative mt-3 overflow-hidden rounded-xl border border-border/60 bg-black">
                  <video
                    controls
                    playsInline
                    src={trimmedUrl}
                    className="max-h-72 w-full"
                    aria-label="Preview of pasted video URL"
                  />
                  <button
                    onClick={() => setUrlValue('')}
                    aria-label="Clear video URL"
                    className="nx-scrim absolute right-2.5 top-2.5 rounded-full p-1.5 text-white/90 backdrop-blur transition hover:bg-destructive"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={analyze}
            disabled={!activeSource || analyzing || engine !== 'ready'}
            className="mt-4 h-11 w-full gap-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110 disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {analyzing ? 'Analyzing…' : 'Analyze video'}
          </Button>
        </div>

        {/* Loading state */}
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-8 text-center"
          >
            <div className="mb-4 flex items-center justify-center gap-1.5">
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-orange-400" />
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="omni-dot h-2.5 w-2.5 rounded-full bg-amber-400" />
            </div>
            <p className="text-sm font-medium">AI is watching your video…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scene detection, objects, pacing and more — longer clips can take up to a minute.
            </p>
          </motion.div>
        )}

        {/* Report panel */}
        {report && !analyzing && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            aria-label="Video analysis report"
            className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-card/40"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Clapperboard className="h-4 w-4 text-primary" aria-hidden /> Scene analysis
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyReport}
                className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
                {copied ? 'Copied' : 'Copy report'}
              </Button>
            </div>
            <div className="omni-scroll max-h-[520px] overflow-y-auto p-5">
              <Markdown content={report} />
            </div>
          </motion.section>
        )}

        {/* Follow-up Q&A */}
        {report && !analyzing && (
          <section
            aria-label="Follow-up questions about the video"
            className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-4"
          >
            <h3 className="text-sm font-semibold">Ask about this video</h3>
            {qa.length > 0 && (
              <div className="omni-scroll mt-3 max-h-96 space-y-4 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {qa.map((pair) => (
                    <motion.div
                      key={pair.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <div className="flex justify-end">
                        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2 text-sm text-foreground">
                          {pair.q}
                        </p>
                      </div>
                      <div className="rounded-2xl rounded-bl-md border border-border/50 bg-background/60 px-3.5 py-2.5">
                        {pair.a ? (
                          <Markdown content={pair.a} />
                        ) : (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-rose-400" />
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-orange-400" />
                            <span className="omni-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
                            <span className="ml-1 text-xs text-muted-foreground">Thinking…</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={qaEndRef} />
              </div>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                ask()
              }}
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What happens at 0:30? Who is speaking?"
                maxLength={500}
                disabled={asking}
                aria-label="Ask a follow-up question about the video"
                className="h-11 flex-1 rounded-full border-border/60 bg-background/60 focus-visible:ring-primary/40"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!question.trim() || asking}
                aria-label="Send question"
                className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {asking ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
