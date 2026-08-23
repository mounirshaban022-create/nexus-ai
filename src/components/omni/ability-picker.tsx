'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { MODES, MODE_MAP, type ModeId } from './modes'

interface AbilityPickerProps {
  activeMode: ModeId
  onSelect: (mode: ModeId) => void
}

/** ChatGPT-style grouped ability picker shown in the chat header. */
export function AbilityPicker({ activeMode, onSelect }: AbilityPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const current = MODE_MAP[activeMode]

  const groups: Array<{ label: string; ids: ModeId[] }> = [
    { label: 'Converse', ids: ['chat', 'voice-live', 'agent'] },
    { label: 'Create', ids: ['code', 'video', 'image', 'office', 'documents'] },
    { label: 'Tools', ids: ['voice', 'search', 'reader', 'vision'] },
    { label: 'Platform', ids: ['settings', 'models', 'connectors', 'home'] },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose ability"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-secondary/60"
      >
        <span className="omni-text-gradient">NEXUS</span>
        <span className="text-muted-foreground">{current.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label="All abilities"
            className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl"
          >
            {groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </p>
                {group.ids.map((id) => {
                  const mode = MODE_MAP[id]
                  if (!mode) return null
                  const Icon = mode.icon
                  const active = id === activeMode
                  return (
                    <button
                      key={id}
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onSelect(id)
                        setOpen(false)
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active ? 'bg-secondary' : 'hover:bg-secondary/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                          active
                            ? `${mode.accentBg} ${mode.accentBorder}`
                            : 'border-border bg-card'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${active ? mode.accentText : 'text-muted-foreground'}`} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {mode.label}
                          {id === 'chat' && (
                            <Sparkles className="h-3 w-3 text-primary" aria-label="default" />
                          )}
                        </span>
                      </span>
                      {active && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            ))}
            <p className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground/60">
              {MODES.length - 1} abilities · switch anytime
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
