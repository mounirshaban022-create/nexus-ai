'use client'

/**
 * Voice picker — premium voice catalog popover used inside the voice overlay.
 *
 * Lists the full server catalog (Z.ai + free Microsoft neural voices from
 * src/lib/voices.ts) grouped by language with a live search, plus the Kokoro
 * offline voices which are ONLY surfaced once the in-browser model has
 * finished loading (fail-soft: if the model can't load, the section simply
 * never appears and nothing else is affected).
 */

import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AudioLines, Check, ChevronDown, Loader2, Search, WifiOff } from 'lucide-react'
import { ALL_VOICES, resolveVoice, type VoiceOption } from '@/lib/voices'
import { KOKORO_VOICES, KOKORO_PREFIX } from '@/components/omni/kokoro-voice'

export { KOKORO_PREFIX }

interface VoiceEntry {
  id: string
  label: string
  language: string
  provider: 'nexus' | 'edge' | 'kokoro'
}

interface VoiceGroup {
  key: string
  label: string
  voices: VoiceEntry[]
}

/** Groups the server catalog into scannable language families (best first). */
function buildGroups(): VoiceGroup[] {
  const entries: VoiceEntry[] = ALL_VOICES.map((v: VoiceOption) => ({
    id: v.id,
    label: v.label,
    language: v.language,
    provider: v.provider,
  }))

  const group = (key: string, label: string, pred: (v: VoiceEntry) => boolean): VoiceGroup => ({
    key,
    label,
    voices: entries.filter(pred),
  })

  return [
    group('en-us', 'English · United States', (v) => v.id.startsWith('en-US')),
    group('en-more', 'English · UK, AU & India', (v) => /^en-(?!US)/.test(v.id)),
    group('ar', 'العربية · Arabic', (v) => v.id.startsWith('ar-')),
    group('nexus', 'NEXUS Original', (v) => v.provider === 'nexus'),
    group('europe', 'Europe', (v) => /^(fr|es|de|it|pt|ru)-/.test(v.id)),
    group('asia', 'Asia & Türkiye', (v) => /^(hi|ja|zh|ko|tr)-/.test(v.id)),
  ].filter((g) => g.voices.length > 0)
}

const KOKORO_GROUP: VoiceGroup = {
  key: 'kokoro',
  label: 'Offline · Kokoro neural',
  voices: KOKORO_VOICES.map((v) => ({
    id: `${KOKORO_PREFIX}${v.id}`,
    label: `${v.label} (offline)`,
    language: 'English · runs in your browser, no internet needed',
    provider: 'kokoro' as const,
  })),
}

/** Human label for any picker voice id (server or kokoro). */
export function voiceLabel(id: string): string {
  if (id.startsWith(KOKORO_PREFIX)) {
    const v = KOKORO_VOICES.find((k) => `${KOKORO_PREFIX}${k.id}` === id)
    return v ? `${v.label} · offline` : 'Offline voice'
  }
  return resolveVoice(id)?.label ?? 'Aria'
}

export function VoicePicker({
  value,
  onChange,
  kokoroReady,
  kokoroLoading,
}: {
  value: string
  onChange: (id: string) => void
  kokoroReady: boolean
  kokoroLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const all = kokoroReady ? [...buildGroups(), KOKORO_GROUP] : buildGroups()
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all
      .map((g) => ({
        ...g,
        voices: g.voices.filter(
          (v) =>
            v.label.toLowerCase().includes(q) ||
            v.language.toLowerCase().includes(q) ||
            v.id.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.voices.length > 0)
  }, [query, kokoroReady])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Voice: ${voiceLabel(value)}. Change voice.`}
          className="flex h-9 max-w-[62vw] items-center gap-1.5 rounded-full border border-white/12 bg-white/5 pl-2.5 pr-2 text-xs font-medium text-zinc-200 transition hover:border-[#ff5a5f]/45 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a5f]/50 sm:max-w-none"
        >
          <AudioLines className="h-3.5 w-3.5 shrink-0 text-[#ff8a8d]" aria-hidden />
          <span className="truncate">
            <span className="hidden text-zinc-500 sm:inline">Voice:&nbsp;</span>
            {voiceLabel(value)}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="z-[60] w-[min(86vw,360px)] rounded-2xl border-white/10 bg-[#14101a] p-0 text-zinc-100 shadow-2xl shadow-black/60"
      >
        {/* search */}
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices or languages…"
            aria-label="Search voices"
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="rounded-full px-1.5 text-xs text-zinc-500 hover:text-zinc-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* grouped list */}
        <div className="nx-scroll max-h-[46vh] overflow-y-auto px-2 py-2" role="listbox" aria-label="Voices">
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No voices match “{query}”.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.key} className="mb-1.5 last:mb-0">
              <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {g.label}
              </p>
              <div className="space-y-0.5">
                {g.voices.map((v) => {
                  const active = value === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(v.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                        active
                          ? 'bg-[#ff5a5f]/15 ring-1 ring-inset ring-[#ff5a5f]/35'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold uppercase ${
                          v.provider === 'kokoro'
                            ? 'bg-[#f5a623]/15 text-[#f5a623]'
                            : v.provider === 'nexus'
                              ? 'bg-[#ff2a68]/15 text-[#ff7a9e]'
                              : 'bg-[#ff5a5f]/15 text-[#ff8a8d]'
                        }`}
                      >
                        {v.provider === 'kokoro' ? <WifiOff className="h-3.5 w-3.5" /> : v.label.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-100">{v.label}</span>
                        <span className="block truncate text-xs text-zinc-500">{v.language}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#ff5a5f]" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* offline section still warming up */}
          {kokoroLoading && !kokoroReady && (
            <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-zinc-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading offline Kokoro voices…
            </p>
          )}
        </div>

        <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
          Neural voices stream from the server. Offline voices run entirely in your
          browser once loaded.
        </p>
      </PopoverContent>
    </Popover>
  )
}
