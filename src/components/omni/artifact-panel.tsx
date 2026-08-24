'use client'

/**
 * Artifact Panel — Claude Artifacts / ChatGPT Canvas pattern.
 *
 * Phase 1 P2 — supports in-place editing of generated code/documents:
 *   - Toggle between read-only Markdown view and editable textarea.
 *   - Version history stack (initial + AI patches + user Save commits).
 *   - Undo/Redo buttons cycle through versions.
 *   - AI-applied patches arrive as `artifact_patch` events from the chat
 *     stream; the parent passes them in via the `patch` prop, and this
 *     component applies find/replace to the current version and pushes
 *     the result as a new version.
 *
 * The panel never closes the user's edits silently — every AI patch and
 * every user Save pushes a new version, so undo always works.
 */

/* eslint-disable react-hooks/set-state-in-effect */
/* This component legitimately syncs external prop changes (a new artifact
 * opening, a new AI patch arriving) into internal state via useEffect +
 * setState. The "derive-from-props-during-render" alternative would
 * require reshaping the version stack as a memo of (artifact + patches)
 * which complicates the local-edit path and loses the per-patch nonce
 * deduplication. The setState-in-effect pattern here is correct. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Code2,
  Copy,
  Download,
  FileText,
  History,
  Pencil,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from './markdown'

export interface Artifact {
  id: string
  type: 'document' | 'code' | 'text'
  title: string
  content: string
  downloadUrl?: string
  format?: string
  artifactId?: string
}

/** One snapshot in the version history. */
interface ArtifactVersion {
  /** monotonically increasing version index, 0-based */
  index: number
  content: string
  /** who produced this version */
  source: 'initial' | 'ai-patch' | 'user-edit'
  /** human-readable label, e.g. "AI edit", "Your edit", "Initial" */
  label: string
  /** epoch ms */
  createdAt: number
  /** short note from the AI patch (if any) */
  note?: string
}

export interface ArtifactPanelProps {
  artifact: Artifact | null
  onClose: () => void
  /**
   * Phase 1 P2: when the chat stream emits an `artifact_patch` event
   * targeted at the open artifact, the parent passes it here. We apply
   * find/replace to the current version and push a new version. Each new
   * patch object must have a unique `nonce` so we can dedupe — the parent
   * should pass the same object reference for the same patch.
   */
  patch?: {
    nonce: string
    artifactId: string
    find: string
    replace: string
    note?: string
  } | null
}

const MAX_VERSIONS = 50

export function ArtifactPanel({ artifact, onClose, patch }: ArtifactPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [versions, setVersions] = useState<ArtifactVersion[]>([])
  const [cursor, setCursor] = useState(-1) // index into versions[]
  const [copyOk, setCopyOk] = useState(false)
  const lastPatchNonceRef = useRef<string | null>(null)

  // (Re)initialise version history when a NEW artifact opens.
  // We key off artifact.id (the ArtifactPanel-level id, stable per open).
  // setState-in-effect here syncs an external prop change (which artifact
  // is open) into the internal version stack — the correct pattern for
  // "respond to a new prop arriving."
  useEffect(() => {
    if (!artifact) {
      setVersions([])
      setCursor(-1)
      setEditMode(false)
      setDraft('')
      lastPatchNonceRef.current = null
      return
    }
    // If the artifact.id changed (different artifact opened), reset state.
    setVersions([
      {
        index: 0,
        content: artifact.content,
        source: 'initial',
        label: 'Initial',
        createdAt: Date.now(),
      },
    ])
    setCursor(0)
    setEditMode(false)
    setDraft(artifact.content)
    lastPatchNonceRef.current = null
  }, [artifact?.id, artifact])

  // Apply incoming AI patches.
  // This effect syncs the externally-controlled `patch` prop (a discrete
  // event from the parent, where each unique nonce represents one patch
  // the AI emitted via the chat stream) into the internal version stack.
  // setState-in-effect is the correct pattern here: the patch is an external
  // event, not derivable from render.
  useEffect(() => {
    if (!patch || !artifact) return
    // Dedupe: each patch has a unique nonce; ignore if we've already applied it.
    if (patch.nonce === lastPatchNonceRef.current) return
    // Only apply patches targeted at THIS artifact.
    if (patch.artifactId !== artifact.artifactId && patch.artifactId !== artifact.id) return
    lastPatchNonceRef.current = patch.nonce

    setVersions((prev) => {
      const current = prev[cursor] ?? prev[prev.length - 1]
      if (!current) return prev
      const { find, replace } = patch
      let nextContent: string
      let appliedNote: string | undefined = patch.note
      if (!find) {
        // Empty find = no-op patch (shouldn't happen, but be defensive)
        return prev
      }
      const idx = current.content.indexOf(find)
      if (idx === -1) {
        // Patch doesn't apply cleanly — push a "failed" version marker so the
        // user can see the AI tried but the substring wasn't found. This
        // preserves the user's ability to undo/redo and surfaces the failure
        // rather than silently swallowing it.
        appliedNote = `Patch failed: "${find.slice(0, 40)}" not found in current content. ${patch.note ?? ''}`.trim()
        nextContent = current.content
      } else {
        nextContent =
          current.content.slice(0, idx) +
          replace +
          current.content.slice(idx + find.length)
      }
      const next: ArtifactVersion = {
        index: current.index + 1,
        content: nextContent,
        source: 'ai-patch',
        label: 'AI edit',
        createdAt: Date.now(),
        note: appliedNote,
      }
      // Truncate history if it grew too long (oldest non-initial versions dropped).
      const trimmed = [...prev, next].slice(-MAX_VERSIONS)
      setCursor(trimmed.length - 1)
      // Sync the draft textarea to the new content if we're in edit mode.
      setDraft(nextContent)
      return trimmed
    })
  }, [patch, artifact, cursor])

  // ESC closes the panel.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (artifact) {
      document.addEventListener('keydown', esc)
      return () => document.removeEventListener('keydown', esc)
    }
  }, [artifact, onClose])

  const currentVersion = cursor >= 0 ? versions[cursor] : null
  const visibleContent = editMode ? draft : (currentVersion?.content ?? artifact?.content ?? '')

  const handleStartEdit = () => {
    setDraft(currentVersion?.content ?? '')
    setEditMode(true)
  }
  const handleCancelEdit = () => {
    setEditMode(false)
    setDraft(currentVersion?.content ?? '')
  }
  const handleSaveEdit = () => {
    const newContent = draft
    setVersions((prev) => {
      const current = prev[cursor] ?? prev[prev.length - 1]
      if (!current) return prev
      const next: ArtifactVersion = {
        index: current.index + 1,
        content: newContent,
        source: 'user-edit',
        label: 'Your edit',
        createdAt: Date.now(),
      }
      const trimmed = [...prev, next].slice(-MAX_VERSIONS)
      setCursor(trimmed.length - 1)
      return trimmed
    })
    setEditMode(false)
  }

  const handleUndo = useCallback(() => {
    setCursor((c) => Math.max(0, c - 1))
    setEditMode(false)
  }, [])
  const handleRedo = useCallback(() => {
    setCursor((c) => Math.min(versions.length - 1, c + 1))
    setEditMode(false)
  }, [versions.length])
  const canUndo = cursor > 0
  const canRedo = cursor >= 0 && cursor < versions.length - 1

  const handleCopy = () => {
    if (!visibleContent) return
    navigator.clipboard?.writeText(visibleContent)
    setCopyOk(true)
    setTimeout(() => setCopyOk(false), 1500)
  }

  return (
    <AnimatePresence>
      {artifact && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[560px]"
          aria-label={`Artifact: ${artifact.title}`}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              {artifact.type === 'code' ? (
                <Code2 className="h-4.5 w-4.5 text-primary" aria-hidden />
              ) : (
                <FileText className="h-4.5 w-4.5 text-primary" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{artifact.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {artifact.format?.toUpperCase() ?? (artifact.type === 'code' ? 'CODE' : 'DOCUMENT')}
                {versions.length > 1 ? ` · v${currentVersion?.index ?? 0}` : ''}
                {' · '}created by NEXUS
              </p>
            </div>

            {/* Copy */}
            <button
              onClick={handleCopy}
              aria-label={copyOk ? 'Copied!' : 'Copy content'}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Copy className={copyOk ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4'} aria-hidden />
            </button>

            {/* Undo / Redo */}
            {versions.length > 1 && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  aria-label="Undo to previous version"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  aria-label="Redo to next version"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Redo2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}

            {/* Edit / Save toggle */}
            {!editMode ? (
              <button
                onClick={handleStartEdit}
                aria-label="Edit content"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleSaveEdit}
                  aria-label="Save changes as new version"
                  className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <Save className="h-4 w-4" aria-hidden />
                </button>
                <button
                  onClick={handleCancelEdit}
                  aria-label="Cancel edit"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}

            {/* Download (only when there's a downloadUrl — documents) */}
            {artifact.downloadUrl && (
              <Button asChild size="sm" className="gap-1.5 rounded-full text-xs">
                <a href={artifact.downloadUrl} download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close artifact"
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          {/* Content */}
          <div className="omni-scroll flex-1 overflow-y-auto px-5 py-4">
            {editMode ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="h-full min-h-[60vh] w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Edit artifact content"
              />
            ) : artifact.type === 'code' ? (
              <pre className="overflow-x-auto rounded-lg bg-[oklch(0.2_0.005_70)] p-4 text-[12.5px] leading-relaxed text-[oklch(0.88_0.005_80)]">
                <code>{visibleContent}</code>
              </pre>
            ) : (
              <Markdown content={visibleContent} />
            )}
          </div>

          {/* Version history footer */}
          {versions.length > 1 && (
            <footer className="border-t border-border px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="font-medium">
                  v{currentVersion?.index ?? 0}
                  {' · '}
                  {currentVersion?.label}
                </span>
                {currentVersion?.note && (
                  <span className="truncate">— {currentVersion.note}</span>
                )}
                <span className="ml-auto text-[10px]">
                  {versions.length} version{versions.length === 1 ? '' : 's'}
                </span>
              </div>
            </footer>
          )}

          {/* Footer hint (only when no version history yet) */}
          {versions.length <= 1 && (
            <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              <p className="text-xs text-muted-foreground">
                Keep chatting — ask NEXUS to revise this, or click the pencil to edit inline.
              </p>
            </footer>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/**
 * Hook: manages the open artifact state AND queues AI-applied patches so
 * the ArtifactPanel can dedupe them.
 *
 * Phase 1 P2: the parent calls `enqueuePatch(patch)` for each
 * `artifact_patch` event received from the chat stream. The hook wraps the
 * patch with a unique nonce and exposes it via `pendingPatch` — the
 * ArtifactPanel applies it and the parent clears it via `clearPatch`.
 */
export function useArtifact() {
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [pendingPatch, setPendingPatch] = useState<{
    nonce: string
    artifactId: string
    find: string
    replace: string
    note?: string
  } | null>(null)

  const openArtifact = useCallback((a: Artifact) => {
    setArtifact(a)
  }, [])
  const closeArtifact = useCallback(() => {
    setArtifact(null)
    setPendingPatch(null)
  }, [])
  const enqueuePatch = useCallback(
    (p: { artifactId: string; find: string; replace: string; note?: string }) => {
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      setPendingPatch({ ...p, nonce })
    },
    []
  )
  const clearPatch = useCallback(() => setPendingPatch(null), [])

  return {
    artifact,
    openArtifact,
    closeArtifact,
    pendingPatch,
    enqueuePatch,
    clearPatch,
  }
}
