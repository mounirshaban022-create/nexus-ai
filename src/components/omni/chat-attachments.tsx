'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react'
import type { ChatAttachment } from './modes'

/**
 * Inline attachment cards rendered inside chat messages —
 * the unifying layer that makes every ability part of the conversation
 * (ChatGPT-style inline results).
 */

export function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.type === 'image' && attachment.url) {
    return (
      <motion.figure
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 overflow-hidden rounded-xl border border-border bg-card"
      >
        <img
          src={attachment.url}
          alt={attachment.title || 'Generated image'}
          className="max-h-[420px] w-full object-contain"
        />
        {attachment.title && (
          <figcaption className="flex items-center gap-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {attachment.title}
          </figcaption>
        )}
      </motion.figure>
    )
  }

  if (attachment.type === 'document' && attachment.url) {
    const formatIcon: Record<string, string> = { docx: '📄', xlsx: '📊', pptx: '📽️', md: '📝' }
    return (
      <motion.a
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        href={attachment.url}
        download
        className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition hover:bg-secondary/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
          {formatIcon[attachment.format ?? 'docx'] ?? '📄'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {attachment.title || 'Document'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {attachment.format?.toUpperCase()} document
            {attachment.size ? ` · ${(attachment.size / 1024).toFixed(1)} KB` : ''} · click to download
          </span>
        </span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </motion.a>
    )
  }

  if (attachment.type === 'code') {
    const ok = attachment.exitCode === 0
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 overflow-hidden rounded-xl border border-border"
      >
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3.5 py-2 text-xs">
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          <span className="font-medium capitalize">{attachment.language}</span>
          <span className="text-muted-foreground">· sandbox output</span>
          <span
            className={`ml-auto flex items-center gap-1 font-medium ${ok ? 'text-emerald-600' : 'text-destructive'}`}
          >
            {ok ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden />
            ) : (
              <XCircle className="h-3 w-3" aria-hidden />
            )}
            exit {attachment.exitCode ?? '?'}
          </span>
        </div>
        <pre className="omni-scroll max-h-52 overflow-auto bg-[oklch(0.2_0.005_70)] p-3.5 text-[12.5px] leading-relaxed text-[oklch(0.88_0.005_80)]">
          {attachment.stdout || attachment.stderr || '(no output)'}
        </pre>
      </motion.div>
    )
  }

  if (attachment.type === 'search' && attachment.results) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 overflow-hidden rounded-xl border border-border"
      >
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3.5 py-2 text-xs font-medium">
          <Search className="h-3.5 w-3.5" aria-hidden />
          Web results
        </div>
        <div className="divide-y divide-border">
          {attachment.results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3.5 py-2.5 transition hover:bg-secondary/40"
            >
              <p className="truncate text-[13px] font-medium text-foreground">{r.title}</p>
              <p className="flex items-center gap-1 truncate text-[11px] text-primary">
                <Globe className="h-3 w-3 shrink-0" aria-hidden />
                {new URL(r.url).hostname}
              </p>
              {r.snippet && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
              )}
            </a>
          ))}
        </div>
      </motion.div>
    )
  }

  return null
}

/** Compact inline tool-step chip for chat (lighter than agent's cards). */
export function ChatToolStep({
  tool,
  args,
  status,
}: {
  tool: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
}) {
  const [open, setOpen] = useState(false)
  const argSummary = Object.entries(args)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`)
    .join('  ·  ')
    .slice(0, 110)

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
          status === 'error'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : status === 'running'
              ? 'border-border bg-secondary/60 text-muted-foreground'
              : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70'
        }`}
      >
        {status === 'running' ? (
          <span className="omni-dot h-1.5 w-1.5 rounded-full bg-primary" />
        ) : status === 'done' ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="h-3 w-3" aria-hidden />
        )}
        <span className="font-medium">{tool}</span>
        {argSummary && <span className="hidden max-w-[300px] truncate text-muted-foreground/70 sm:inline">{argSummary}</span>}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <span className="text-[11px] text-muted-foreground/70">
          {status === 'running' ? 'running…' : status === 'done' ? 'completed' : 'failed'}
        </span>
      )}
    </div>
  )
}
