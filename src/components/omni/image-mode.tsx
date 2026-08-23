'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, ImageIcon, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { GeneratedImageItem } from './modes'
import { useToast } from '@/hooks/use-toast'

const SIZES = [
  { value: '1024x1024', label: 'Square · 1024×1024' },
  { value: '1344x768', label: 'Landscape · 1344×768' },
  { value: '1440x720', label: 'Wide · 1440×720' },
  { value: '768x1344', label: 'Portrait · 768×1344' },
  { value: '720x1440', label: 'Tall · 720×1440' },
  { value: '864x1152', label: 'Portrait · 864×1152' },
  { value: '1152x864', label: 'Landscape · 1152×864' },
]

const PROMPT_IDEAS = [
  'A cozy cyberpunk ramen shop in the rain, neon reflections',
  'An astronaut relaxing on a giant crescent moon, dreamy pastel colors',
  'Isometric cutaway of a wizard tower, warm candlelight, detailed illustration',
  'A samurai cat standing in cherry blossoms, cinematic lighting',
]

export function ImageMode() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [provider, setProvider] = useState<'nexus' | 'free'>('nexus')
  const [generating, setGenerating] = useState(false)
  const [gallery, setGallery] = useState<GeneratedImageItem[]>([])
  const [preview, setPreview] = useState<GeneratedImageItem | null>(null)

  const loadGallery = useCallback(async () => {
    try {
      const res = await fetch('/api/image')
      if (res.ok) {
        const data = await res.json()
        setGallery(data.images ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadGallery()
  }, [loadGallery])

  const generate = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? prompt).trim()
      if (!trimmed || generating) return
      setGenerating(true)
      setPreview(null)
      try {
        const res = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmed, size, provider }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Image generation failed.')
        setPreview(data.image)
        loadGallery()
      } catch (error) {
        toast({
          title: 'Generation failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setGenerating(false)
      }
    },
    [prompt, size, provider, generating, loadGallery, toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Sparkles className="h-5 w-5 text-rose-600" aria-hidden /> Image Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe anything — OMNI paints it in seconds.
          </p>
        </header>

        {/* Prompt composer */}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A crystal palace floating above a sea of clouds at golden hour…"
            aria-label="Image prompt"
            rows={3}
            className="resize-none border-border/70 bg-background/60 focus-visible:ring-primary/40"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger
                  aria-label="Image size"
                  className="w-[210px] rounded-lg bg-background/60 text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex overflow-hidden rounded-lg border border-border/70 bg-background/60" role="group" aria-label="Image provider">
                <button
                  type="button"
                  onClick={() => setProvider('nexus')}
                  aria-pressed={provider === 'nexus'}
                  className={`px-3 py-2 text-xs font-medium transition ${
                    provider === 'nexus' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  NEXUS
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('free')}
                  aria-pressed={provider === 'free'}
                  className={`border-l border-border/70 px-3 py-2 text-xs font-medium transition ${
                    provider === 'free' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Free · Pollinations
                </button>
              </div>
            </div>
            <Button
              onClick={() => generate()}
              disabled={!prompt.trim() || generating}
              className="gap-2 rounded-xl bg-primary px-6 text-primary-foreground hover:brightness-110 disabled:opacity-40"
            >
              <Wand2 className="h-4 w-4" />
              {generating ? 'Painting…' : provider === 'free' ? 'Generate (free)' : 'Generate'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPT_IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => {
                  setPrompt(idea)
                  generate(idea)
                }}
                disabled={generating}
                className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
              >
                {idea.length > 48 ? idea.slice(0, 48) + '…' : idea}
              </button>
            ))}
          </div>
        </div>

        {/* Result / loading */}
        <section className="mt-6" aria-label="Generated image">
          {generating && (
            <div className="overflow-hidden rounded-2xl border border-border/60">
              <Skeleton className="omni-shimmer h-[380px] w-full rounded-none sm:h-[480px]" />
              <div className="flex items-center gap-2 border-t border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-pulse text-rose-600" />
                Dreaming up your image… this usually takes 10–30 seconds.
              </div>
            </div>
          )}

          {!generating && preview && (
            <motion.figure
              key={preview.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              className="overflow-hidden rounded-2xl border border-border/60 bg-card/70"
            >
              <img
                src={preview.url}
                alt={preview.prompt}
                className="max-h-[560px] w-full bg-background/40 object-contain"
              />
              <figcaption className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="line-clamp-2 text-sm text-muted-foreground">{preview.prompt}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="text-[11px]">{preview.size}</Badge>
                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-lg">
                    <a href={preview.url} download={`omni-${preview.id}.png`}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </Button>
                </div>
              </figcaption>
            </motion.figure>
          )}

          {!generating && !preview && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-16 text-center">
              <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Your generated art will appear here.
              </p>
            </div>
          )}
        </section>

        {/* Gallery */}
        {gallery.length > 0 && (
          <section className="mt-8" aria-label="Gallery">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              Gallery · {gallery.length} image{gallery.length === 1 ? '' : 's'}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((img) => (
                <button
                  key={img.id}
                  onClick={() => {
                    setPreview(img)
                    scrollParentTop()
                  }}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/50"
                  aria-label={`View image: ${img.prompt.slice(0, 60)}`}
                >
                  <img
                    src={img.url}
                    alt={img.prompt}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-8 text-left text-[11px] leading-snug text-white/90 opacity-0 transition group-hover:opacity-100">
                    {img.prompt}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function scrollParentTop() {
  if (typeof document !== 'undefined') {
    document.querySelector('.omni-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
