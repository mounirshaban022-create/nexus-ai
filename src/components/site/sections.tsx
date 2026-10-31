'use client'

/**
 * NEXUS Official Site v3 — content sections.
 *
 * Design language: 2025 award-tier dark editorial — star-powered OSS
 * marquees, spotlight bento grid, snap-scroll agency gallery, CSS-sticky
 * stacking workflow deck, parallax showcase gallery, triple vertical
 * testimonial marquees, and a giant cropped footer wordmark.
 *
 * Reliability rule: zero GSAP pinning/spacers (that is what created the
 * black-void bug in v2). Scroll choreography = CSS sticky/masks/keyframes
 * + Framer Motion whileInView only.
 */

import Image from 'next/image'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Braces,
  Clapperboard,
  Code2,
  DollarSign,
  FileText,
  Gamepad2,
  Github,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  LifeBuoy,
  Mail,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
  Mic,
  PenTool,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  TrendingUp,
  Workflow as WorkflowIcon,
  Box,
  Boxes,
  ClipboardList,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react'
import { AGENCY_DIVISIONS, AGENCY_STATS, BrandLockup, TOOL_META } from '@/components/nexus/shared'
import { Reveal, SectionHeading, SpotlightCard, Waveform } from './fx'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Open-source stack — the star-count marquee                          */
/* ------------------------------------------------------------------ */

const OSS_STARS: Array<{ name: string; stars: string }> = [
  { name: 'React', stars: '230k' },
  { name: 'Next.js', stars: '128k' },
  { name: 'Three.js', stars: '105k' },
  { name: 'TypeScript', stars: '102k' },
  { name: 'Tailwind CSS', stars: '88k' },
  { name: 'shadcn/ui', stars: '80k' },
  { name: 'Prisma', stars: '42k' },
  { name: 'Framer Motion', stars: '29k' },
  { name: 'GSAP', stars: '20k' },
  { name: 'Radix UI', stars: '17k' },
  { name: 'Lucide', stars: '12k' },
  { name: 'Lenis', stars: '10k' },
]

const CAPABILITY_CHIPS = [
  '255 Agents', 'RAG Citations', 'Voice Calls', 'Code Sandbox', 'Live Browser',
  'WhatsApp', 'Photo Studio', 'Video Intelligence', 'Knowledge Base', 'Email',
  'Word · Excel · PPT', 'Web Search',
]

function OssRow({ items, reverse = false }: { items: Array<{ name: string; stars?: string }>; reverse?: boolean }) {
  const row = [...items, ...items]
  return (
    <div className="marquee-paused site-x-fade overflow-hidden py-2">
      <div className={cn('flex w-max gap-3', reverse ? 'site-marquee-reverse' : 'site-marquee')}>
        {row.map((item, i) => (
          <span
            key={`${item.name}-${i}`}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/40 px-4 py-2 text-[13px] font-medium text-muted-foreground backdrop-blur"
          >
            <Github className="h-3.5 w-3.5" aria-hidden />
            {item.name}
            {item.stars ? (
              <span className="flex items-center gap-0.5 text-xs">
                <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" aria-hidden />
                <span className="nx-gradient-text font-mono font-semibold">{item.stars}</span>
              </span>
            ) : (
              <Sparkles className="h-3 w-3 text-[#ff5a5f]" aria-hidden />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export function OssStack() {
  return (
    <section id="open-source" aria-labelledby="oss-title" className="relative scroll-mt-24 py-14 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
            Built in the open
          </p>
          <h2 id="oss-title" className="font-display mt-2 text-xl font-semibold tracking-tight text-foreground/90 sm:text-2xl">
            Standing on the most-starred projects on GitHub
          </h2>
        </Reveal>
      </div>
      <Reveal delay={0.1} className="space-y-1">
        <OssRow items={OSS_STARS} />
        <OssRow items={CAPABILITY_CHIPS.map((name) => ({ name }))} reverse />
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Features — spotlight bento grid                                     */
/* ------------------------------------------------------------------ */

const AGENT_CHIPS = [
  { name: 'Imagery Agent', dot: '#f5a623' },
  { name: 'Code Agent', dot: '#a78bfa' },
  { name: 'Docs Agent', dot: '#34d399' },
  { name: 'Web Agent', dot: '#22d3ee' },
  { name: 'Voice Agent', dot: '#ff5a5f' },
  { name: 'Mail Agent', dot: '#fb7185' },
]

function AgentsVisual() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {AGENT_CHIPS.map((chip, i) => (
        <div
          key={chip.name}
          className="site-chip-pulse flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs font-medium text-foreground/85 backdrop-blur"
          style={{ animationDelay: `${i * 0.45}s` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: chip.dot }} aria-hidden />
          <span className="truncate">{chip.name}</span>
          <Bot className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
        </div>
      ))}
    </div>
  )
}

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="features-title"
          kicker="Superpowers"
          title={
            <>
              One conversation. <span className="font-serif-accent nx-gradient-text font-normal italic">Every</span> superpower.
            </>
          }
          sub="Not a chatbot with plugins — a coordinated agency. The right specialist silently takes over the moment your request needs it."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {/* Big cell — the agency */}
          <Reveal className="sm:col-span-2 lg:col-span-4 lg:row-span-2">
            <SpotlightCard className="flex h-full flex-col p-6 sm:p-8">
              <span aria-hidden className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-[#ff5a5f]/12 text-[#ff5a5f]">
                <Bot className="h-5 w-5" />
              </span>
              <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                255 specialists. One mind.
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Ask once. NEXUS routes your request to marketing, imagery, code, docs or any of
                255 domain agents — mid-conversation, invisibly, with full context.
              </p>
              <div className="mt-auto">
                <AgentsVisual />
              </div>
            </SpotlightCard>
          </Reveal>

          {/* Voice */}
          <Reveal delay={0.06} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6">
              <span aria-hidden className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#ff8a4c]/12 text-[#ff8a4c]">
                <Mic className="h-4.5 w-4.5" />
              </span>
              <h3 className="text-sm font-semibold">Real-time voice</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Full-duplex calls with instant speech. Interrupt it mid-sentence — it listens.
              </p>
              <Waveform className="mt-auto pt-4" bars={20} />
            </SpotlightCard>
          </Reveal>

          {/* Vision */}
          <Reveal delay={0.1} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6">
              <div className="relative mb-4 h-32 overflow-hidden rounded-xl border border-border/60">
                <Image
                  src="/site/vision-studio.png"
                  alt="Editorial portrait generated and retouched by the NEXUS Photo Studio"
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-cover transition duration-700 hover:scale-105"
                />
                <span className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur">
                  “Restyle this — studio light.”
                </span>
              </div>
              <h3 className="text-sm font-semibold">Photo & video intelligence</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Edit photos with a sentence. NEXUS watches video and answers questions about it.
              </p>
            </SpotlightCard>
          </Reveal>

          {/* Documents */}
          <Reveal delay={0.06} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6">
              <span aria-hidden className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#34d399]/12 text-[#34d399]">
                <FileText className="h-4.5 w-4.5" />
              </span>
              <h3 className="text-sm font-semibold">Documents with citations</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Upload PDFs, Word or Excel — answers arrive grounded in your files, chip by chip.
              </p>
              <div className="mt-auto pt-4">
                <div className="rounded-xl border border-border/70 bg-background/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  “Revenue grew 18% QoQ
                  <button type="button" className="nx-gradient-surface mx-0.5 inline-grid h-4 w-4 place-items-center rounded align-middle text-[9px] font-bold text-white">1</button>
                  , driven by enterprise renewals
                  <button type="button" className="nx-gradient-surface mx-0.5 inline-grid h-4 w-4 place-items-center rounded align-middle text-[9px] font-bold text-white">2</button>
                  .”
                </div>
              </div>
            </SpotlightCard>
          </Reveal>

          {/* Code */}
          <Reveal delay={0.1} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6">
              <span aria-hidden className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#a78bfa]/12 text-[#a78bfa]">
                <Braces className="h-4.5 w-4.5" />
              </span>
              <h3 className="text-sm font-semibold">Code that ships</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Refactors, reviews and runnable sandboxes — with the terminal to prove it.
              </p>
              <div className="site-terminal mt-auto pt-4">
                <div className="flex gap-1.5 pb-2.5">
                  <span className="h-2 w-2 rounded-full bg-[#ff5f57]" aria-hidden />
                  <span className="h-2 w-2 rounded-full bg-[#febc2e]" aria-hidden />
                  <span className="h-2 w-2 rounded-full bg-[#28c840]" aria-hidden />
                </div>
                <p className="font-mono text-[11px] leading-relaxed text-emerald-300/90">
                  <span className="text-muted-foreground">$</span> nexus refactor auth.ts
                  <br />
                  <span className="text-muted-foreground">✓ 12 files updated · tests passing</span>
                  <span className="site-caret ml-1 inline-block h-3 w-[7px] translate-y-[2px] bg-[#ff5a5f]" aria-hidden />
                </p>
              </div>
            </SpotlightCard>
          </Reveal>

          {/* Live web */}
          <Reveal delay={0.06} className="sm:col-span-2 lg:col-span-3">
            <SpotlightCard className="flex h-full flex-col p-6 sm:flex-row sm:items-center sm:gap-6">
              <span aria-hidden className="mb-4 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#22d3ee]/12 text-[#22d3ee] sm:mb-0">
                <Globe className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">The live web, on tap</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  Searches, opens and reads real pages — then answers with today&apos;s facts, not training-data guesses.
                </p>
              </div>
              <div className="mt-4 hidden shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/50 px-3.5 py-2 text-[11px] text-muted-foreground sm:ml-auto sm:mt-0 sm:flex">
                <ShieldCheck className="h-3.5 w-3.5 text-[#22d3ee]" aria-hidden />
                source-linked
              </div>
            </SpotlightCard>
          </Reveal>

          {/* Messaging */}
          <Reveal delay={0.1} className="sm:col-span-2 lg:col-span-3">
            <SpotlightCard className="flex h-full flex-col p-6 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex shrink-0 items-center gap-2">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-[#34d399]/12 text-[#34d399]">
                  <MessageSquare className="h-4.5 w-4.5" />
                </span>
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-[#fb7185]/12 text-[#fb7185]">
                  <Mail className="h-4.5 w-4.5" />
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold">WhatsApp & email, native</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  Your AI answers customers on WhatsApp and drafts, sends and triages email — from the same conversation.
                </p>
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Divisions — snap-scroll gallery (CSS scroll-snap, no pinning)       */
/* ------------------------------------------------------------------ */

const DIVISION_ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  PenTool,
  Code: Code2,
  DollarSign,
  Gamepad2,
  Map: MapIcon,
  Stethoscope,
  Megaphone,
  Target,
  Box,
  ClipboardList,
  TrendingUp,
  ShieldCheck,
  Boxes,
  Sparkles,
  LifeBuoy,
  FlaskConical,
}

export function Divisions({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section id="divisions" aria-labelledby="divisions-title" className="relative scroll-mt-24 overflow-clip py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            id="divisions-title"
            kicker="The agency"
            title={
              <>
                Seventeen divisions. <span className="font-serif-accent nx-gradient-text font-normal italic">One mind.</span>
              </>
            }
          />
          <Reveal delay={0.12} className="hidden lg:block">
            <button
              type="button"
              onClick={onLaunch}
              className="group flex items-center gap-1.5 pb-1 text-sm font-semibold text-[#ff8a4c] transition hover:gap-2.5"
            >
              Meet them in the app
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </Reveal>
        </div>
      </div>

      <Reveal delay={0.1}>
        <div
          className="nx-scroll site-x-fade mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1rem,calc((100vw-72rem)/2))] pb-4 pt-2"
          role="list"
          aria-label="Agency divisions"
        >
          {AGENCY_DIVISIONS.map((d, i) => {
            const Icon = DIVISION_ICONS[d.icon] ?? Sparkles
            return (
              <article
                key={d.id}
                role="listitem"
                className="nx-glow-card group relative w-[248px] shrink-0 snap-start select-none overflow-hidden rounded-3xl p-6 sm:w-[288px] sm:p-7"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-90"
                  style={{ backgroundColor: `${d.color}26` }}
                />
                <div className="flex items-start justify-between">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-background/60"
                    style={{ color: d.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span aria-hidden className="font-display text-4xl font-bold text-border/90 transition-colors group-hover:text-muted-foreground/30">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-6 text-base font-semibold">{d.label}</h3>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold" style={{ color: d.color }}>
                    {d.count}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    specialists
                  </span>
                </p>
              </article>
            )
          })}
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Workflow — CSS-sticky stacking deck                                 */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: '01',
    title: 'Say what you need',
    desc: 'Plain words, any language — type it, speak it, or paste a file. No prompts to engineer, no modes to pick.',
    chips: ['“Plan my launch”', '“修复这个 bug”', '“Analiza este video”'],
  },
  {
    n: '02',
    title: 'The right specialists take over',
    desc: 'The orchestrator hands your request to the exact agents it needs — imagery, code, docs, web, mail — and they work as one team with shared context.',
    chips: ['Imagery Agent', 'Code Agent', 'Web Agent', '+ 3 more'],
  },
  {
    n: '03',
    title: 'Verified results, not vibes',
    desc: 'Answers grounded in your documents with numbered citations, files you can download, and voice summaries you can hear — all in the same thread.',
    chips: ['[1] Q3-report.pdf', '[2] contract.docx', '✓ verified'],
  },
]

export function Workflow() {
  return (
    <section id="how" aria-labelledby="how-title" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <SectionHeading
          id="how-title"
          kicker="How it works"
          title={
            <>
              Three steps. <span className="font-serif-accent nx-gradient-text font-normal italic">Zero</span> setup.
            </>
          }
        />
        <div className="mt-14 space-y-5">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={0.05 * i}>
              <article
                className="nx-glow-card sticky rounded-[1.75rem] border border-border/70 bg-[#0c0c11]/92 p-7 backdrop-blur-xl sm:p-9"
                style={{ top: `${6.5 + i * 0.9}rem` }}
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
                  <span
                    aria-hidden
                    className="nx-gradient-text font-display shrink-0 text-5xl font-bold leading-none opacity-90 sm:text-6xl"
                  >
                    {step.n}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{step.title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {step.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Showcase — made-with-NEXUS gallery                                  */
/* ------------------------------------------------------------------ */

const SHOWCASE: Array<{
  src: string
  alt: string
  tool: string
  title: string
  span: string
}> = [
  {
    src: '/site/show-product.png',
    alt: 'Premium product photography of headphones, generated by the Imagery Agent',
    tool: 'Imagery Agent',
    title: 'Product shots that convert',
    span: 'lg:col-span-2 lg:row-span-2',
  },
  {
    src: '/site/show-abstract.png',
    alt: 'Liquid chrome abstract render with ember and violet reflections',
    tool: 'Photo Studio',
    title: 'Brand visuals in seconds',
    span: 'lg:col-span-2',
  },
  {
    src: '/site/show-texture.png',
    alt: 'Iridescent glass wave lit by coral and violet light',
    tool: 'Imagery Agent',
    title: 'Textures & backdrops',
    span: '',
  },
  {
    src: '/site/vision-studio.png',
    alt: 'Editorial studio portrait retouched by the NEXUS Photo Studio',
    tool: 'Photo Studio',
    title: 'Editorial retouching',
    span: '',
  },
  {
    src: '/site/show-city.png',
    alt: 'Futuristic city at dusk, cinematic matte painting',
    tool: 'Video Intelligence',
    title: 'Scene-by-scene analysis',
    span: 'lg:col-span-2',
  },
]

export function Showcase() {
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="showcase-title"
          kicker="Made with NEXUS"
          title={
            <>
              Not mockups. <span className="font-serif-accent nx-gradient-text font-normal italic">Output.</span>
            </>
          }
          sub="Every image on this page was generated and art-directed inside NEXUS — the same pipeline you get in the app."
        />
        <div className="mt-14 grid grid-cols-2 gap-3 [grid-auto-rows:180px] sm:gap-4 lg:grid-cols-4 lg:[grid-auto-rows:210px]">
          {SHOWCASE.map((item, i) => (
            <Reveal key={item.src} delay={0.05 * i} className={cn('relative', item.span)}>
              <figure className="group relative h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-background/40">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition duration-700 ease-out group-hover:scale-[1.06]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-95"
                />
                <figcaption className="absolute inset-x-0 bottom-0 translate-y-1 p-4 transition-transform duration-500 group-hover:translate-y-0">
                  <span className="nx-gradient-surface inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    {item.tool}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-white/95">{item.title}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
          <Reveal delay={0.28} className="relative">
            <button
              type="button"
              onClick={() => {
                document.getElementById('talk')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="nx-glow-card group flex h-full w-full flex-col items-start justify-between rounded-2xl p-5 text-left"
            >
              <Sparkles className="h-5 w-5 text-[#ff8a4c]" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">Your project here</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                  Ask the concierge how
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </span>
            </button>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Testimonials — triple vertical marquee                              */
/* ------------------------------------------------------------------ */

const TESTIMONIALS: Array<{ quote: string; name: string; role: string; hue: string }> = [
  { quote: 'I asked for a launch logo and the announcement email in one breath — both landed before my coffee did.', name: 'Lena Kovács', role: 'Founder, Bloomkit', hue: '#f5a623' },
  { quote: 'The citation chips sold our legal team. Every number traces back to the exact PDF page.', name: 'Marcus Chen', role: 'Ops Lead, Fernway', hue: '#34d399' },
  { quote: 'Voice mode is uncannily fast. I interrupt it, it recovers, and the answer is already better.', name: 'Sofia Marino', role: 'Podcast Host', hue: '#ff5a5f' },
  { quote: 'It drafted, sent and triaged our WhatsApp support queue for a week. We only reviewed.', name: 'Ahmed Al-Rashid', role: 'CX Manager, Nabtah', hue: '#22d3ee' },
  { quote: 'The code agent refactored our auth flow and ran the tests. The diff review took 4 minutes.', name: 'Priya Sharma', role: 'Staff Engineer, Loop', hue: '#a78bfa' },
  { quote: 'Upload the quarterly deck, ask questions in Arabic, get cited answers. My board was impressed.', name: 'Omar Haddad', role: 'CFO, Mezan', hue: '#fb7185' },
  { quote: 'Video intelligence summarized a 40-minute webinar into six bullet points with timestamps.', name: 'Grace Okafor', role: 'Content Lead, Helix', hue: '#f5a623' },
  { quote: 'Guest mode meant zero onboarding. My whole team was using it the same afternoon.', name: 'Tom Fischer', role: 'CTO, Bitwave', hue: '#34d399' },
  { quote: 'One thread: research, deck, emails, follow-ups. I stopped tab-switching entirely.', name: 'Ines Duarte', role: 'Freelance Strategist', hue: '#a78bfa' },
]

function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  const initials = t.name.split(' ').map((p) => p[0]).join('')
  return (
    <figure className="nx-glow-card flex min-h-[190px] flex-col justify-between rounded-2xl p-5">
      <div>
        <Quote className="h-4 w-4 text-muted-foreground/40" aria-hidden />
        <blockquote className="mt-3 text-[13px] leading-relaxed text-foreground/85">{t.quote}</blockquote>
      </div>
      <figcaption className="mt-4 flex items-center gap-2.5 border-t border-border/60 pt-3.5">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${t.hue}33, ${t.hue}cc)` }}
        >
          {initials}
        </span>
        <span>
          <span className="block text-xs font-semibold text-foreground/90">{t.name}</span>
          <span className="block text-[11px] text-muted-foreground/80">{t.role}</span>
        </span>
      </figcaption>
    </figure>
  )
}

export function Testimonials() {
  const columns = [
    TESTIMONIALS.slice(0, 3),
    TESTIMONIALS.slice(3, 6),
    TESTIMONIALS.slice(6, 9),
  ]
  return (
    <section aria-labelledby="testimonials-title" className="relative py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="testimonials-title"
          kicker="Word of mouth"
          title={
            <>
              People <span className="font-serif-accent nx-gradient-text font-normal italic">talk</span> to it — then about it.
            </>
          }
        />
        <Reveal delay={0.1}>
          <div className="marquee-paused mt-14 hidden max-h-[560px] gap-4 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] md:grid md:grid-cols-3">
            {columns.map((col, ci) => (
              <div
                key={ci}
                className={cn(
                  'flex flex-col gap-4',
                  ci === 0 && 'site-marquee-y',
                  ci === 1 && 'site-marquee-y-reverse',
                  ci === 2 && 'site-marquee-y-slow',
                )}
              >
                {[...col, ...col].map((t, i) => (
                  <TestimonialCard key={`${t.name}-${i}`} t={t} />
                ))}
              </div>
            ))}
          </div>
          {/* Mobile: static grid (vertical marquees need height control) */}
          <div className="mt-12 grid gap-4 md:hidden">
            {TESTIMONIALS.slice(0, 3).map((t) => (
              <TestimonialCard key={t.name} t={t} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What exactly is NEXUS?',
    a: 'One premium AI conversation with 255 specialist agents that auto-take-over for their domain — images, video, documents, code, the live web, email, WhatsApp and real-time voice — without you ever picking a mode.',
  },
  {
    q: 'Do I need an account to try it?',
    a: 'No. Guest mode runs the full chat with no sign-up, and this website itself is hosted by the NEXUS concierge — ask it anything before you launch.',
  },
  {
    q: 'How does the voice call work?',
    a: 'It is a full-duplex, real-time call: NEXUS hears you as you speak, answers with instant neural speech, and lets you interrupt mid-sentence — just like a phone call with a very fast friend.',
  },
  {
    q: 'Can it really edit my photos and understand video?',
    a: 'Yes. The Photo Studio applies sentence-level edits — retouch, restore, restyle — and Video Intelligence watches uploaded or linked videos, delivering scene-by-scene analysis you can question.',
  },
  {
    q: 'How do document citations work?',
    a: 'Your files are chunked and indexed. Every grounded answer carries numbered chips — tap one and you see the exact passage it came from. Nothing is invented without a source.',
  },
  {
    q: 'Is it built on open source?',
    a: 'Extensively: Next.js, React, Three.js, Tailwind, shadcn/ui, Framer Motion, Radix, Lucide, Lenis, Prisma and more. The credits below link every star count.',
  },
]

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="relative scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading
          id="faq-title"
          kicker="Questions"
          title={
            <>
              Asked <span className="font-serif-accent nx-gradient-text font-normal italic">constantly.</span>
            </>
          }
        />
        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="mt-12">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-sm font-semibold sm:text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Final CTA                                                           */
/* ------------------------------------------------------------------ */

export function CtaBanner({ onJoin, onGuest }: { onJoin: () => void; onGuest: () => void }) {
  const tools = Object.keys(TOOL_META).length
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:26px_26px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,42,104,0.16),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-28 pt-10 sm:px-6">
        <Reveal>
          <div className="relative text-center">
            <Bell className="nx-gradient-text mx-auto h-8 w-8" aria-hidden />
            <h2
              id="cta-title"
              className="font-display mt-5 text-5xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-7xl"
            >
              Ready when
              <br />
              <span className="font-serif-accent nx-gradient-text font-normal italic">you are.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {AGENCY_STATS.agents} specialists, {tools}+ tools, one conversation — your first result is minutes away.
            </p>
            <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[52px] items-center gap-2 rounded-full px-9 text-sm font-semibold shadow-[0_10px_44px_-10px_rgba(255,90,95,0.5)]"
              >
                Launch NEXUS
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onGuest}
                className="flex min-h-[52px] items-center rounded-full border border-border px-8 text-sm font-semibold text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                Explore as guest
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Footer — giant cropped wordmark                                     */
/* ------------------------------------------------------------------ */

export function SiteFooter({ onTalk }: { onTalk: () => void }) {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto overflow-hidden border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <BrandLockup height={20} />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground/80">
            One AI. Every superpower. Built in the open on the most-starred projects on GitHub.
          </p>
        </div>
        <nav aria-label="Footer" className="text-xs">
          <p className="font-semibold uppercase tracking-wider text-muted-foreground/70">Explore</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><a className="transition hover:text-foreground" href="#features">Superpowers</a></li>
            <li><a className="transition hover:text-foreground" href="#divisions">Divisions</a></li>
            <li><a className="transition hover:text-foreground" href="#showcase">Showcase</a></li>
            <li><a className="transition hover:text-foreground" href="#open-source">Open source</a></li>
            <li><a className="transition hover:text-foreground" href="#faq">FAQ</a></li>
            <li>
              <button type="button" onClick={onTalk} className="transition hover:text-foreground">
                Talk to the concierge
              </button>
            </li>
          </ul>
        </nav>
        <div className="text-xs">
          <p className="font-semibold uppercase tracking-wider text-muted-foreground/70">Credits</p>
          <p className="mt-3 text-muted-foreground">
            Built by <span className="font-medium text-foreground/90">Mounir Shaaban</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-muted-foreground">
            <WorkflowIcon className="h-3 w-3" aria-hidden /> React · Next.js · Three.js · Framer Motion · Lenis
          </p>
          <p className="mt-4 text-muted-foreground/70">© {year} NEXUS. All rights reserved.</p>
        </div>
      </div>

      {/* Giant cropped wordmark — the editorial sign-off */}
      <div aria-hidden className="relative select-none px-2">
        <p className="footer-wordmark nx-gradient-text font-display text-center font-bold opacity-90">
          NEXUS
        </p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
      </div>
    </footer>
  )
}
