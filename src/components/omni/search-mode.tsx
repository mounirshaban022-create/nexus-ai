'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Globe2, Search, Sparkles, ExternalLink, Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Markdown } from './markdown'
import type { SearchResultItem } from './modes'
import { useToast } from '@/hooks/use-toast'

const TRENDING = [
  'AI breakthroughs this week',
  'Next.js 16 new features',
  'Best travel destinations 2026',
  'How do solar panels work',
]

export function SearchMode() {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [summarize, setSummarize] = useState(true)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [summary, setSummary] = useState('')
  const [note, setNote] = useState('')
  const [searched, setSearched] = useState('')

  const runSearch = useCallback(
    async (q?: string) => {
      const trimmed = (q ?? query).trim()
      if (!trimmed || loading) return
      setLoading(true)
      setResults([])
      setSummary('')
      setNote('')
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, summarize }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Search failed.')
        setResults(data.results ?? [])
        setSummary(data.summary ?? '')
        setNote(data.note ?? '')
        setSearched(trimmed)
      } catch (error) {
        toast({
          title: 'Search failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [query, loading, summarize, toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Globe2 className="h-5 w-5 text-rose-600" aria-hidden /> Web Search
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live results from across the web, distilled by AI.
          </p>
        </header>

        {/* Search bar */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            runSearch()
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-500/70" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the web…"
              aria-label="Search query"
              className="h-12 rounded-xl border-border bg-card pl-10 pr-4 text-base focus-visible:ring-primary/40"
            />
          </div>
          <Button
            type="submit"
            disabled={!query.trim() || loading}
            className="h-12 gap-2 rounded-xl bg-primary px-5 text-primary-foreground hover:brightness-110 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TRENDING.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setQuery(t)
                  runSearch(t)
                }}
                disabled={loading}
                className="rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50"
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={summarize} onCheckedChange={setSummarize} aria-label="AI digest toggle" />
            AI digest
          </label>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-6 space-y-3">
            <Skeleton className="omni-shimmer h-36 w-full rounded-2xl" />
            <Skeleton className="omni-shimmer h-20 w-full rounded-xl" />
            <Skeleton className="omni-shimmer h-20 w-full rounded-xl" />
            <Skeleton className="omni-shimmer h-20 w-full rounded-xl" />
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <div className="mt-6 space-y-5">
            {note && <p className="text-sm text-muted-foreground">{note}</p>}

            {summary && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur"
                aria-label="AI digest"
              >
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-700">
                  <Sparkles className="h-4 w-4" aria-hidden /> AI digest
                </h3>
                <Markdown content={summary} />
              </motion.section>
            )}

            {results.length > 0 && (
              <section aria-label="Search results" className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {results.length} result{results.length === 1 ? '' : 's'} for “{searched}”
                </h3>
                <div className="grid gap-3">
                  {results.map((r, i) => (
                    <motion.a
                      key={`${r.url}-${i}`}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                      className="group rounded-xl border border-border/60 bg-card/60 p-4 transition hover:border-border hover:bg-secondary/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold uppercase">
                              {r.host_name?.replace(/^www\./, '')?.slice(0, 2) || '?'}
                            </span>
                            <span className="truncate">{r.host_name}</span>
                            {r.date && <span className="shrink-0 opacity-70">· {r.date}</span>}
                          </div>
                          <h4 className="mt-1.5 font-semibold leading-snug text-foreground group-hover:text-primary">
                            {r.name}
                          </h4>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {r.snippet}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-rose-600" aria-hidden />
                      </div>
                    </motion.a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !searched && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 py-16 text-center">
            <Newspaper className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask about anything current — news, releases, prices, research. OMNI searches the
              live web and summarizes what it finds.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
