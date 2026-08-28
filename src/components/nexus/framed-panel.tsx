'use client'

/**
 * NEXUS One — premium framed surface for legacy light panels.
 *
 * Wraps a light-themed legacy view (Settings / WhatsApp) in a dark editorial
 * frame: display-font header + description, then a rounded white card with a
 * brand-gradient hairline along its top edge, inner hairline ring and a deep
 * soft shadow — so the legacy UI reads as an intentional premium card on the
 * dark NEXUS One shell.
 *
 * Two optional variants (default behavior is unchanged):
 *  - fill → the panel occupies the full viewport height like the chat view
 *           (h-[calc(100dvh-56px)] on mobile, h-screen on desktop) and the
 *           card stretches to fill the remaining space (flex column).
 *  - dark → the card surface becomes deep NEXUS dark (zinc) instead of white,
 *           for views that ship their own premium dark UI (Agent Skills).
 */

import { BRAND, BrandMark } from './shared'

export function FramedPanel({
  title,
  description,
  children,
  fill = false,
  dark = false,
}: {
  title: string
  description?: string
  children: React.ReactNode
  /** stretch to the full viewport height (chat-style) instead of auto */
  fill?: boolean
  /** deep dark card surface instead of the white legacy card */
  dark?: boolean
}) {
  return (
    <div
      className={
        fill
          ? // Mobile: viewport minus the 56px top bar AND the 55px bottom tab
            // bar (+ any safe-area inset) so the panel never slides under it.
            'mx-auto flex h-[calc(100dvh_-_111px_-_env(safe-area-inset-bottom))] w-full max-w-6xl flex-col px-4 py-4 md:h-screen md:px-8 md:py-6'
          : 'mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10'
      }
    >
      <header className={`flex shrink-0 items-end justify-between gap-4 ${fill ? 'mb-3' : 'mb-5'}`}>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        <BrandMark size={32} className="hidden shrink-0 opacity-60 sm:block" />
      </header>

      <div
        className={`overflow-hidden rounded-2xl border border-border shadow-[0_32px_90px_-32px_rgba(0,0,0,0.85)] ${
          fill ? 'flex min-h-0 flex-1 flex-col' : ''
        }`}
      >
        {/* Brand gradient hairline across the top of the card */}
        <div aria-hidden className="h-[3px] w-full shrink-0" style={{ backgroundImage: BRAND.gradient }} />
        <div
          className={
            fill
              ? `flex min-h-0 flex-1 flex-col framed-panel-dark ${
                  dark
                    ? 'bg-sidebar text-foreground ring-1 ring-border ring-inset'
                    : 'bg-white p-4 text-foreground ring-1 ring-border/60 ring-inset md:p-6'
                }`
              : 'bg-white p-4 text-foreground ring-1 ring-border/60 ring-inset md:p-6'
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
