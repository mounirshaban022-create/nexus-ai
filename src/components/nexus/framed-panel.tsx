'use client'

/**
 * NEXUS One — premium framed surface for legacy light panels.
 *
 * Wraps a light-themed legacy view (Settings / WhatsApp) in a dark editorial
 * frame: display-font header + description, then a rounded white card with a
 * brand-gradient hairline along its top edge, inner hairline ring and a deep
 * soft shadow — so the legacy UI reads as an intentional premium card on the
 * dark NEXUS One shell.
 */

import { BRAND, BrandMark } from './shared'

export function FramedPanel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-100 md:text-[28px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>
          )}
        </div>
        <BrandMark size={32} className="hidden shrink-0 opacity-60 sm:block" />
      </header>

      <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_32px_90px_-32px_rgba(0,0,0,0.85)]">
        {/* Brand gradient hairline across the top of the white card */}
        <div aria-hidden className="h-[3px] w-full" style={{ backgroundImage: BRAND.gradient }} />
        <div className="bg-white p-4 text-zinc-900 ring-1 ring-zinc-950/5 ring-inset md:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
