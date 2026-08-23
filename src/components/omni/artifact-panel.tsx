'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Download, FileText, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from './markdown'

/**
 * Artifact Panel — Claude Artifacts / ChatGPT Canvas pattern.
 * Documents created in chat open in a side panel for reading & download,
 * keeping the conversation flowing alongside.
 */

export interface Artifact {
  id: string
  type: 'document' | 'code' | 'text'
  title: string
  content: string
  downloadUrl?: string
  format?: string
}

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: Artifact | null
  onClose: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (artifact) {
      document.addEventListener('keydown', esc)
      return () => document.removeEventListener('keydown', esc)
    }
  }, [artifact, onClose])

  return (
    <AnimatePresence>
      {artifact && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[520px]"
          aria-label={`Artifact: ${artifact.title}`}
        >
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <FileText className="h-4.5 w-4.5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{artifact.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {artifact.format?.toUpperCase() ?? 'Document'} · created by NEXUS
              </p>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(artifact.content)}
              aria-label="Copy content"
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Copy className="h-4 w-4" aria-hidden />
            </button>
            {artifact.downloadUrl && (
              <Button asChild size="sm" className="gap-1.5 rounded-full text-xs">
                <a href={artifact.downloadUrl} download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            )}
            <button
              onClick={onClose}
              aria-label="Close artifact"
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          {/* Content */}
          <div className="omni-scroll flex-1 overflow-y-auto px-6 py-5">
            <Markdown content={artifact.content} />
          </div>

          {/* Footer hint */}
          <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            <p className="text-xs text-muted-foreground">
              Keep chatting — ask NEXUS to revise this document anytime
            </p>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** Hook: manages the open artifact state. */
export function useArtifact() {
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const openArtifact = (a: Artifact) => setArtifact(a)
  const closeArtifact = () => setArtifact(null)
  return { artifact, openArtifact, closeArtifact }
}
