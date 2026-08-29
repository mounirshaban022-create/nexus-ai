'use client'

/**
 * STUDIO DOC EDITOR — powered by BlockNote (github.com/TypeCellOS/BlockNote).
 * A Notion-style block editor with slash commands, drag-and-drop blocks,
 * rich formatting and markdown import/export — the Claude-Canvas-class
 * writing surface for NEXUS Studio.
 */

import { useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

export interface StudioDocEditorProps {
  /** Initial markdown to load into the editor. */
  initialMarkdown?: string
  theme?: 'light' | 'dark'
  /** Called with the editor instance once created (parent drives AI + export). */
  onReady?: (editor: BlockNoteEditor) => void
  /** Called on every content change with the live markdown (debounced). */
  onChange?: (markdown: string) => void
}

export function StudioDocEditor({ initialMarkdown, theme = 'light', onReady, onChange }: StudioDocEditorProps) {
  const editor = useCreateBlockNote({})
  const lastMd = useRef<string>('')
  const debounceTimer = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)

  // Keep the onChange ref current without updating it during render.
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Load initial markdown once the editor exists.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!editor || !initialMarkdown?.trim()) return
      try {
        const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown)
        if (!cancelled && blocks && blocks.length > 0) {
          await editor.replaceBlocks(editor.document, blocks)
          lastMd.current = initialMarkdown
        }
      } catch {
        /* fall back to empty editor */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editor, initialMarkdown])

  // Expose the editor to the parent.
  useEffect(() => {
    if (editor && onReady) onReady(editor)
  }, [editor, onReady])

  // Clean up the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    }
  }, [])

  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
      onChange={() => {
        // Debounced markdown extraction — parsing on every keystroke is wasteful.
        if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
        debounceTimer.current = window.setTimeout(async () => {
          try {
            const md = await editor.blocksToMarkdownLossy()
            if (md !== lastMd.current) {
              lastMd.current = md
              onChangeRef.current?.(md)
            }
          } catch {
            /* ignore */
          }
        }, 600)
      }}
      slashMenu={true}
      formattingToolbar={true}
    />
  )
}
