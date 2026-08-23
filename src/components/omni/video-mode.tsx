'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Clapperboard,
  Download,
  Film,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

interface Job {
  id: string
  status: 'planning' | 'images' | 'narration' | 'rendering' | 'done' | 'error'
  progress: number
  message: string
  url?: string
  error?: string
  prompt: string
  scenes?: Array<{ caption: string }>
}

const IDEAS = [
  'A cinematic travel video about Dubai',
  'An explainer about how solar panels work',
  'A promotional video for a coffee shop',
  'فيديو عن جمال الصحراء العربية',
]

const STYLES = ['cinematic', 'vibrant', 'minimal', 'documentary'] as const

const STATUS_ICON: Record<Job['status'], React.ReactNode> = {
  planning: <Film className="h-4 w-4" aria-hidden />,
  images: <Sparkles className="h-4 w-4" aria-hidden />,
  narration: <Film className="h-4 w-4" aria-hidden />,
  rendering: <Clapperboard className="h-4 w-4" aria-hidden />,
  done: <Clapperboard className="h-4 w-4" aria-hidden />,
  error: <Loader2 className="h-4 w-4" aria-hidden />,
}

export function VideoMode() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [scenes, setScenes] = useState('4')
  const [style, setStyle] = useState<(typeof STYLES)[number]>('cinematic')
  const [creating, setCreating] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const poll = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status/${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        setJob(data.job)
        if (data.job.status === 'done' || data.job.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current)
          setCreating(false)
          if (data.job.status === 'error') {
            toast({
              title: 'Video failed',
              description: data.job.error,
              variant: 'destructive',
            })
          } else {
            toast({ title: 'Video ready! 🎬' })
          }
        }
      } catch {
        /* keep polling */
      }
    }, 3000)
  }, [toast])

  const create = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setJob(null)
    try {
      const res = await fetch('/api/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, scenes, style }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start video generation.')
      setJob({
        id: data.jobId,
        status: 'planning',
        progress: 5,
        message: 'Directing your video…',
        prompt: trimmed,
      })
      poll(data.jobId)
    } catch (error) {
      toast({
        title: 'Failed to start',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
      setCreating(false)
    }
  }, [prompt, scenes, style, creating, poll, toast])

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clapperboard className="h-5 w-5 text-primary" aria-hidden /> Video Studio
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Describe a video — NEXUS directs scenes, generates AI imagery, narrates with neural
            voices, and renders a real MP4 with animation.
          </p>
        </header>

        {/* Composer */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A cinematic video showcasing the future of AI cities"
            rows={3}
            aria-label="Video prompt"
            className="resize-none border-border/60 bg-background/60 focus-visible:ring-primary/40"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Scenes</span>
              <div className="flex gap-1 rounded-full bg-secondary/50 p-0.5">
                {['3', '4', '5', '6'].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScenes(n)}
                    aria-pressed={scenes === n}
                    className={`h-6 w-6 rounded-full text-[11px] font-medium transition ${
                      scenes === n ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Style</span>
              <div className="flex gap-1 rounded-full bg-secondary/50 p-0.5">
                {STYLES.map((st) => (
                  <button
                    key={st}
                    onClick={() => setStyle(st)}
                    aria-pressed={style === st}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                      style === st ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={create}
              disabled={!prompt.trim() || creating}
              className="ml-auto gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:brightness-110 disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {creating ? 'Creating…' : 'Create video'}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => setPrompt(idea)}
                disabled={creating}
                className="rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-secondary/50 hover:text-foreground disabled:opacity-50"
              >
                {idea.length > 42 ? idea.slice(0, 42) + '…' : idea}
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        {job && job.status !== 'done' && job.status !== 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {STATUS_ICON[job.status]}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{job.message}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    animate={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {job.progress}%
              </span>
            </div>
            {job.scenes && job.scenes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {job.scenes.map((s, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-border/50 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {i + 1}. {s.caption?.slice(0, 30) || 'Scene'}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground/70">
              Generating a video takes 1–3 minutes — AI images, narration, and rendering happen
              sequentially.
            </p>
          </motion.div>
        )}

        {/* Result */}
        {job?.status === 'done' && job.url && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 overflow-hidden rounded-2xl border border-border/60"
          >
            <video
              controls
              playsInline
              className="aspect-video w-full bg-black"
              src={job.url}
              aria-label="Generated video"
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/40 px-4 py-3">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{job.prompt}</p>
              <Button asChild size="sm" className="shrink-0 gap-1.5 rounded-full">
                <a href={`${job.url}?download=1`}>
                  <Download className="h-3.5 w-3.5" /> Download MP4
                </a>
              </Button>
            </div>
          </motion.div>
        )}

        {job?.status === 'error' && (
          <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-red-200">
            {job.error}
          </div>
        )}
      </div>
    </div>
  )
}
