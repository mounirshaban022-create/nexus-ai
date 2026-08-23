'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpenText, Globe, Link2, Sparkles, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

interface PageResult {
  title: string
  url: string
  publishedTime: string | null
  text: string
  wordCount: number
}

const EXAMPLE_URLS = [
  'https://en.wikipedia.org/wiki/Artificial_intelligence',
  'https://nextjs.org/blog/next-16',
  'https://example.com',
]

export function ReaderMode() {
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<PageResult | null>(null)
  const [error, setError] = useState('')

  const read = async (target?: string) => {
    const trimmed = (target ?? url).trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError('')
    setPage(null)
    try {
      const res = await fetch('/api/reader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not read that page.')
      setPage(data.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <BookOpenText className="h-5 w-5 text-orange-600" aria-hidden /> Page Reader
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste any URL — OMNI extracts the full content, clean and distraction-free.
          </p>
        </header>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            read()
          }}
        >
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500/70" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              aria-label="URL to read"
              inputMode="url"
              className="h-12 rounded-xl border-border bg-card pl-10 pr-4 text-base focus-visible:ring-primary/40"
            />
          </div>
          <Button
            type="submit"
            disabled={!url.trim() || loading}
            className="h-12 gap-2 rounded-xl bg-primary px-5 text-primary-foreground hover:brightness-110 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Reading…' : 'Read'}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="py-1.5 text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_URLS.map((u) => (
            <button
              key={u}
              onClick={() => {
                setUrl(u)
                read(u)
              }}
              disabled={loading}
              className="rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
            >
              {u.replace(/^https?:\/\//, '').slice(0, 42)}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-6 space-y-3">
            <Skeleton className="omni-shimmer h-8 w-2/3 rounded-lg" />
            <Skeleton className="omni-shimmer h-5 w-1/3 rounded-md" />
            <Skeleton className="omni-shimmer h-24 w-full rounded-xl" />
            <Skeleton className="omni-shimmer h-24 w-full rounded-xl" />
            <Skeleton className="omni-shimmer h-24 w-full rounded-xl" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Result */}
        {!loading && page && (
          <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur"
          >
            <header className="border-b border-border/60 px-5 py-4 sm:px-6">
              <h3 className="text-lg font-bold leading-snug">{page.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-full items-center gap-1 truncate text-primary hover:underline"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{new URL(page.url).hostname}</span>
                </a>
                <Badge variant="secondary" className="text-[11px]">
                  {page.wordCount.toLocaleString()} words
                </Badge>
                {page.publishedTime && (
                  <Badge variant="secondary" className="text-[11px]">
                    {new Date(page.publishedTime).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Badge>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(page.text)
                      .then(() => toast({ title: 'Article text copied' }))
                      .catch(() => toast({ title: 'Copy failed', variant: 'destructive' }))
                  }}
                  className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy text
                </button>
              </div>
            </header>
            <div className="omni-scroll max-h-[65vh] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                {page.text}
              </div>
            </div>
          </motion.article>
        )}

        {/* Empty state */}
        {!loading && !page && !error && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-16 text-center">
            <BookOpenText className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              Articles, docs, blog posts, wiki pages — paste a link and read it here without the
              clutter.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
