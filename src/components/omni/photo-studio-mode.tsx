'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Camera, Download, ExternalLink, ImageDown, ImageIcon, Info, Loader2,
  RotateCcw, Search, Sparkles, Upload, Wand2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/* AI PHOTO STUDIO — instruction-based editing (Z.ai, free) + stock    */
/* image search. Two tabs: "AI Edit" (upload → describe → edit) and    */
/* "Stock Photos" (web-wide search with source attribution).           */
/* ------------------------------------------------------------------ */

type EditSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'

interface StockPhoto {
  original_url: string
  caption: string | null
  source: string | null
  width: number | null
  height: number | null
}

interface PhotoEditResponse {
  ok?: boolean
  id?: string
  url?: string
  size?: string
  error?: string
}

interface SearchResponse {
  query?: string
  results?: StockPhoto[]
  error?: string
}

const SIZES: { value: EditSize; label: string }[] = [
  { value: '1024x1024', label: 'Square · 1024×1024' },
  { value: '768x1344', label: 'Portrait · 768×1344' },
  { value: '864x1152', label: 'Portrait · 864×1152' },
  { value: '1344x768', label: 'Landscape · 1344×768' },
  { value: '1152x864', label: 'Landscape · 1152×864' },
  { value: '1440x720', label: 'Wide · 1440×720' },
  { value: '720x1440', label: 'Tall · 720×1440' },
]

const EDIT_PRESETS = [
  'Remove background',
  'Restore & colorize old photo',
  'Enhance quality & sharpness',
  'Cinematic color grade',
  'Change background to studio white',
  'Make it a professional headshot',
  'Turn into watercolor painting',
]

const SEARCH_IDEAS = [
  'mount fuji at dawn',
  'golden retriever puppy',
  'minimal workspace desk',
  'northern lights iceland',
]

// ~12MB — mirrors the API's data-URL ceiling.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

/** File/Blob → data URL (uploads + clipboard pastes). */
function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(file)
  })
}

/** Fetch a served image URL (e.g. the previous result) back into a data URL. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load the image.')
  const blob = await res.blob()
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Result is too large to re-edit — download it instead.')
  return readAsDataUrl(blob)
}

export function PhotoStudioMode() {
  const { toast } = useToast()

  // --- AI Edit tab ---
  const [source, setSource] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [size, setSize] = useState<EditSize>('1024x1024')
  const [editing, setEditing] = useState(false)
  const [result, setResult] = useState<{ id?: string; url: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Stock Photos tab ---
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [photos, setPhotos] = useState<StockPhoto[]>([])

  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Not an image',
          description: 'Pick a JPG, PNG, WebP or GIF file.',
          variant: 'destructive',
        })
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: 'Image too large',
          description: 'Please use an image under 12MB.',
          variant: 'destructive',
        })
        return
      }
      readAsDataUrl(file)
        .then((dataUrl) => {
          setSource(dataUrl)
          setSourceName(file.name)
          setResult(null)
        })
        .catch(() =>
          toast({ title: 'Could not read file', description: 'Try a different image.', variant: 'destructive' })
        )
    },
    [toast]
  )

  // Paste-from-clipboard: any image on the clipboard becomes the source.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        acceptFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptFile])

  const applyEdit = useCallback(async () => {
    if (!source || editing) return
    const trimmed = instruction.trim()
    if (trimmed.length < 3) {
      toast({
        title: 'Describe your edit first',
        description: 'For example: "Remove the background" or "Make it a headshot".',
        variant: 'destructive',
      })
      return
    }
    setEditing(true)
    try {
      const res = await fetch('/api/photo-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: source, instruction: trimmed, size }),
      })
      const data = (await res.json().catch(() => ({}))) as PhotoEditResponse
      if (!res.ok || !data.url) throw new Error(data.error || 'AI photo edit failed. Please try again.')
      setResult({ id: data.id, url: data.url })
    } catch (error) {
      toast({
        title: 'Edit failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setEditing(false)
    }
  }, [source, instruction, size, editing, toast])

  // Feed the edited result back in as the new source (iterative retouching).
  const editResultAgain = useCallback(async () => {
    if (!result || editing) return
    try {
      const dataUrl = await fetchAsDataUrl(result.url)
      setSource(dataUrl)
      setSourceName('previous-result.png')
      setResult(null)
    } catch (error) {
      toast({
        title: 'Could not load result',
        description: error instanceof Error ? error.message : 'Download it and upload again.',
        variant: 'destructive',
      })
    }
  }, [result, editing, toast])

  const runSearch = useCallback(
    async (rawQuery?: string) => {
      const q = (rawQuery ?? query).trim()
      if (q.length < 2 || searching) return
      setSearching(true)
      try {
        const res = await fetch(`/api/image-search?q=${encodeURIComponent(q)}&count=12`)
        const data = (await res.json().catch(() => ({}))) as SearchResponse
        if (!res.ok) throw new Error(data.error || 'Image search failed. Please try again.')
        setPhotos(data.results ?? [])
        setSearched(true)
      } catch (error) {
        toast({
          title: 'Search failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setSearching(false)
      }
    },
    [query, searching, toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Camera className="h-5 w-5 text-primary" aria-hidden /> AI Photo Studio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Retouch real photos with a sentence — or find stock imagery from the open web.
          </p>
        </header>

        <Tabs defaultValue="edit">
          <TabsList className="rounded-xl bg-secondary/50">
            <TabsTrigger value="edit" className="gap-1.5 rounded-lg">
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> AI Edit
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5 rounded-lg">
              <Search className="h-3.5 w-3.5" aria-hidden /> Stock Photos
            </TabsTrigger>
          </TabsList>

          {/* ============================ AI EDIT ============================ */}
          <TabsContent value="edit" className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose an image file"
              onChange={(e) => {
                acceptFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            {!source && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload a photo to edit — drop, paste or browse"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  acceptFile(e.dataTransfer.files?.[0])
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                  dragOver ? 'border-primary/70 bg-primary/5' : 'border-border/70 bg-card/30 hover:border-border hover:bg-card/50'
                }`}
              >
                <Upload className="mb-3 h-9 w-9 text-muted-foreground/50" aria-hidden />
                <p className="text-sm font-medium">
                  Drop a photo, paste from clipboard, or <span className="text-primary underline underline-offset-2">browse</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">JPG · PNG · WebP — up to 12MB</p>
              </div>
            )}

            {source && (
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                <img
                  src={source}
                  alt="Photo selected for editing"
                  className="mx-auto max-h-96 w-auto max-w-full bg-background/40 object-contain"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
                  <p className="truncate text-xs text-muted-foreground">{sourceName || 'Pasted image'}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => fileInputRef.current?.click()}>
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSource(null)
                        setSourceName('')
                        setResult(null)
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Instruction composer */}
            <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
              <div className="flex flex-wrap gap-2" role="group" aria-label="One-click edit presets">
                {EDIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInstruction(preset)}
                    disabled={editing}
                    aria-pressed={instruction === preset}
                    className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                      instruction === preset
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/70 bg-background/40 text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={600}
                rows={3}
                placeholder="Describe your edit…"
                aria-label="Edit instruction"
                className="mt-3 resize-none border-border/70 bg-background/60 focus-visible:ring-primary/40"
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Select value={size} onValueChange={(v) => setSize(v as EditSize)}>
                  <SelectTrigger aria-label="Output size" className="w-[210px] rounded-lg bg-background/60 text-sm">
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
                <Button
                  onClick={applyEdit}
                  disabled={!source || editing || instruction.trim().length < 3}
                  className="gap-2 rounded-xl bg-primary px-6 text-primary-foreground hover:brightness-110 disabled:opacity-40"
                >
                  {editing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                  {editing ? 'Retouching…' : 'Apply AI Edit'}
                </Button>
              </div>
            </div>

            {/* Loading state */}
            {editing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 overflow-hidden rounded-2xl border border-border/60"
                aria-live="polite"
              >
                <Skeleton className="omni-shimmer h-[280px] w-full rounded-none sm:h-[360px]" />
                <div className="flex items-center gap-2 border-t border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden />
                  AI is retouching your photo… this usually takes 15–45 seconds.
                </div>
              </motion.div>
            )}

            {/* Before | After result */}
            {!editing && result && source && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mt-6"
                aria-label="Edit result"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <figure className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                    <img
                      src={source}
                      alt="Original photo"
                      className="max-h-96 w-full bg-background/40 object-contain"
                    />
                    <figcaption className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Before</Badge>
                      <span className="truncate text-xs text-muted-foreground">{sourceName || 'Pasted image'}</span>
                    </figcaption>
                  </figure>
                  <figure className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                    <img
                      src={result.url}
                      alt={`Edited photo — ${instruction.trim()}`}
                      className="max-h-96 w-full bg-background/40 object-contain"
                    />
                    <figcaption className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
                      <Badge className="bg-primary/15 text-primary text-[10px] uppercase tracking-wide">After</Badge>
                      <span className="truncate text-xs text-muted-foreground">{instruction.trim()}</span>
                    </figcaption>
                  </figure>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-lg">
                    <a href={result.url} download={`nexus-photo-${result.id ?? Date.now()}.png`}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> Download
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => void editResultAgain()}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Edit result again
                  </Button>
                </div>
              </motion.section>
            )}

            {/* Empty state */}
            {!editing && !result && source && (
              <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-12 text-center">
                <ImageIcon className="mb-3 h-9 w-9 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Describe an edit above — your before/after comparison will appear here.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ========================= STOCK PHOTOS ========================= */}
          <TabsContent value="stock" className="mt-4">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault()
                  void runSearch()
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={120}
                    placeholder="Search the open web — e.g. golden retriever puppy…"
                    aria-label="Search stock photos"
                    className="rounded-xl border-border/70 bg-background/60 pl-9 focus-visible:ring-primary/40"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={query.trim().length < 2 || searching}
                  className="gap-2 rounded-xl bg-primary px-5 text-primary-foreground hover:brightness-110 disabled:opacity-40"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                  Search
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {SEARCH_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setQuery(idea)
                      void runSearch(idea)
                    }}
                    disabled={searching}
                    className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading skeletons */}
            {searching && (
              <div className="mt-4 columns-2 gap-3 sm:columns-3 lg:columns-4" aria-label="Loading results" aria-live="polite">
                {[220, 300, 180, 260, 240, 200, 280, 220].map((h, i) => (
                  <Skeleton key={i} style={{ height: h }} className="omni-shimmer mb-3 w-full break-inside-avoid rounded-xl" />
                ))}
              </div>
            )}

            {/* Results — CSS-columns masonry (varied aspect ratios) */}
            {!searching && photos.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="mt-4 columns-2 gap-3 sm:columns-3 lg:columns-4"
              >
                {photos.map((photo, i) => (
                  <motion.figure
                    key={`${photo.original_url}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.32) }}
                    className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border/60 bg-card/50"
                  >
                    <img
                      src={photo.original_url}
                      alt={photo.caption ?? 'Stock photo'}
                      loading="lazy"
                      className="w-full bg-background/40 object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    {/* Hover / focus overlay: source + dimensions + actions */}
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <p className="line-clamp-2 text-[11px] leading-snug text-white/90">{photo.caption ?? 'Untitled'}</p>
                      <p className="mt-0.5 text-[10px] text-white/60">
                        {photo.source ?? 'open web'}
                        {photo.width && photo.height ? ` · ${photo.width}×${photo.height}` : ''}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        <Button asChild size="sm" variant="secondary" className="h-7 gap-1 rounded-md px-2 text-[11px]">
                          <a href={photo.original_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" aria-hidden /> Open
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="secondary" className="h-7 gap-1 rounded-md px-2 text-[11px]">
                          <a href={photo.original_url} download target="_blank" rel="noopener noreferrer">
                            <ImageDown className="h-3 w-3" aria-hidden /> Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  </motion.figure>
                ))}
              </motion.div>
            )}

            {/* Empty states */}
            {!searching && searched && photos.length === 0 && (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-12 text-center">
                <ImageIcon className="mb-3 h-9 w-9 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">No photos found — try a different query.</p>
              </div>
            )}
            {!searching && !searched && (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-12 text-center">
                <Search className="mb-3 h-9 w-9 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Search the open web for photos — results link back to their source.
                </p>
              </div>
            )}

            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Images found on the open web — always credit their source.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
