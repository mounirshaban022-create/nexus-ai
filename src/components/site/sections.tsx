'use client'

/**
 * NEXUS Official Site v2 — content sections.
 *
 * Design language: award-tier 2025 — rotated dual marquees, spotlight
 * bento grid, GSAP-pinned horizontal division gallery, sticky stacking
 * workflow cards, clip-path parallax showcase, serif-italic editorial
 * headings, outline type and a giant cropped footer wordmark.
 * Libraries: Framer Motion (28k★), GSAP ScrollTrigger (20k★),
 * Lucide icons — all open source.
 */

import {
  motion,
} from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  ArrowRight,
  Bell,
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
  MousePointerClick,
  PenTool,
  Quote,
  Search,
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
import { HorizontalScroll, ParallaxFigure } from './gsap-fx'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* OSS marquee v2 — rotated dual rows, opposite directions             */
/* ------------------------------------------------------------------ */

const ROW_ONE = [
  'Next.js', 'React 19', 'TypeScript', 'Tailwind CSS 4', 'shadcn/ui', 'Radix UI',
  'Three.js', 'GSAP', 'Framer Motion', 'Lenis', 'Prisma', 'socket.io',
]
const ROW_TWO = [
  '255 Agents', 'RAG Citations', 'Voice Calls', 'Code Sandbox', 'Live Browser',
  'WhatsApp', 'Photo Studio', 'Video Intelligence', 'Knowledge Base', 'Email',
  'Word · Excel · PowerPoint', 'Web Search',
]

function MarqueeRow({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items]
  return (
    <div className="marquee-mask marquee-paused overflow-hidden py-3">
      <div className={cn('flex w-max items-center gap-8 pr-8', reverse ? 'site-marquee-reverse' : 'site-marquee')}>
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
            <span className="font-display text-sm font-semibold text-muted-foreground/85">{item}</span>
            <Star
              className="h-3 w-3 fill-[#ff5a5f]/50 text-[#ff5a5f]/50"
              aria-hidden
            />
          </span>
        ))}
      </div>
    </div>
  )
}

export function OssMarquee() {
  return (
    <section
      aria-label="Open-source technologies powering NEXUS"
      className="relative -rotate-[1.1deg] scale-[1.02] border-y border-border/60 bg-muted/30 py-4"
    >
      <MarqueeRow items={ROW_ONE} />
      <div className="mx-auto max-w-6xl border-t border-dashed border-border/40" />
      <MarqueeRow items={ROW_TWO} reverse />
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Superpowers — spotlight bento grid                                  */
/* ------------------------------------------------------------------ */

const SMALL_FEATURES = [
  { icon: ImageIcon, title: 'Images by sentence', desc: 'Generate, restyle and retouch photos inline — logos to portraits.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Clapperboard, title: 'AI video', desc: 'Multi-scene clips with narration, captions and analysis.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
  { icon: FileText, title: 'Documents, done', desc: 'Word, Excel, PowerPoint and PDF — built and exported for you.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Braces, title: 'Code & terminal', desc: 'Runs real code and shell commands in a live sandbox.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: MousePointerClick, title: 'Real browser', desc: 'Opens, clicks, fills and reads live web pages like an intern.', tint: 'rgba(217,70,239,0.10)', color: '#d946ef' },
  { icon: Mail, title: 'Email & WhatsApp', desc: 'Drafts and actually sends messages through your accounts.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: Search, title: 'Cited web search', desc: 'Fresh answers with sources you can open and verify.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Globe, title: 'Knowledge Base', desc: 'Upload docs, get grounded answers with numbered citations.', tint: 'rgba(217,70,239,0.10)', color: '#d946ef' },
]

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-24" aria-labelledby="features-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="features-title"
          kicker="Superpowers"
          title={<>Everything, in <span className="font-serif-accent nx-gradient-text font-normal">one chat.</span></>}
          sub="No add-ons, no plugins, no mode-switching. Every power is native to the conversation — and the right specialist picks itself."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Bento large 1 — agents */}
          <Reveal className="md:col-span-2">
            <SpotlightCard className="overflow-hidden p-6 sm:p-8">
              <div className="flex h-full flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div className="max-w-sm">
                  <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl" style={{ backgroundColor: 'rgba(255,90,95,0.12)', color: '#ff5a5f' }}>
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-xl font-bold">{AGENCY_STATS.agents} specialists. Zero switching.</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Ask once. NEXUS routes your request across {AGENCY_STATS.divisions} divisions — design, code, data, writing, ops — and the right expert silently takes over, then hands the thread back.
                  </p>
                </div>
                {/* Mini agent chips animation */}
                <div className="grid shrink-0 grid-cols-3 gap-2" aria-hidden>
                  {['🎨', '🧑‍💻', '📊', '✍️', '🎧', '📚'].map((e, i) => (
                    <motion.span
                      key={e}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-border/70 bg-background/60 text-lg"
                      animate={{ scale: [1, 1.12, 1], borderColor: ['rgba(255,255,255,0.08)', 'rgba(255,90,95,0.45)', 'rgba(255,255,255,0.08)'] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
                    >
                      {e}
                    </motion.span>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          </Reveal>

          {/* Bento large 2 — voice */}
          <Reveal delay={0.08} className="md:col-span-1">
            <SpotlightCard className="overflow-hidden p-6 sm:p-8">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl" style={{ backgroundColor: 'rgba(255,42,104,0.12)', color: '#ff2a68' }}>
                <Mic className="h-5 w-5" />
              </span>
              <h3 className="font-display text-xl font-bold">Voice that talks back</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Real-time calls with instant speech and transcription — this very site greets you out loud.
              </p>
              <Waveform className="mt-6" bars={18} />
            </SpotlightCard>
          </Reveal>

          {/* Small cards */}
          {SMALL_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={0.04 * (i % 3)}>
              <SpotlightCard className="p-5">
                <span aria-hidden className="mb-4 grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: f.tint, color: f.color }}>
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/85">{f.desc}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Divisions — GSAP-pinned horizontal gallery (17 divisions)           */
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
    <HorizontalScroll
      id="divisions"
      kicker="The agency"
      title={<>Seventeen divisions. <span className="font-serif-accent nx-gradient-text font-normal">One mind.</span></>}
    >
      {AGENCY_DIVISIONS.map((d, i) => {
        const Icon = DIVISION_ICONS[d.icon] ?? Sparkles
        return (
          <article
            key={d.id}
            className="nx-glow-card relative flex w-[268px] shrink-0 select-none flex-col justify-between overflow-hidden rounded-3xl p-6 sm:w-[320px] sm:p-7"
          >
            {/* Division-colored glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full blur-3xl"
              style={{ backgroundColor: `${d.color}26` }}
            />
            <div className="relative">
              <div className="flex items-start justify-between">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl"
                  style={{ backgroundColor: `${d.color}1f`, color: d.color }}
                >
                  <Icon className="h-5.5 w-5.5" />
                </span>
                <span className="text-outline font-display text-4xl font-bold">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="font-display mt-6 text-lg font-bold">{d.label}</h3>
            </div>
            <div className="relative mt-8">
              <p className="nx-gradient-text font-display text-2xl font-bold">{d.count}</p>
              <p className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground/75">specialists</p>
            </div>
          </article>
        )
      })}

      {/* Terminal CTA card */}
      <button
        type="button"
        onClick={onLaunch}
        className="nx-gradient-surface group relative flex w-[268px] shrink-0 flex-col justify-between rounded-3xl p-6 text-left sm:w-[320px] sm:p-7"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-white">
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
        </span>
        <span className="mt-10">
          <span className="font-display block text-lg font-bold">Your domain next.</span>
          <span className="mt-1 block text-sm text-white/80">Meet all {AGENCY_STATS.agents} inside the app.</span>
        </span>
      </button>
    </HorizontalScroll>
  )
}

/* ------------------------------------------------------------------ */
/* Workflow — sticky stacking cards                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: '01',
    title: 'Say what you need',
    desc: 'One message box, no modes or menus. Plain language in — any language.',
    visual: 'composer' as const,
  },
  {
    n: '02',
    title: 'The specialist takes over',
    desc: `${AGENCY_STATS.agents} agents route themselves into your chat automatically — and hand back when done.`,
    visual: 'agents' as const,
  },
  {
    n: '03',
    title: 'Get the real thing',
    desc: 'Downloadable files, generated media, sent emails, browsed pages — results, not links.',
    visual: 'results' as const,
  },
]

function StepVisual({ kind }: { kind: 'composer' | 'agents' | 'results' }) {
  if (kind === 'composer') {
    return (
      <div className="rounded-2xl border border-border/70 bg-background/60 p-3" aria-hidden>
        <span className="block rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
          Build me a launch site, logo included…
        </span>
        <span className="nx-gradient-surface mt-2 block h-9 w-24 rounded-lg" />
      </div>
    )
  }
  if (kind === 'agents') {
    return (
      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {['🎨', '🧑‍💻', '📊', '🎧', '✍️', '📚', '🚀', '🛠️'].map((e, i) => (
          <motion.span
            key={e}
            className="grid h-11 place-items-center rounded-xl border border-border/70 bg-background/60 text-lg"
            animate={{ borderColor: ['rgba(255,255,255,0.08)', 'rgba(255,90,95,0.5)', 'rgba(255,255,255,0.08)'] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.28 }}
          >
            {e}
          </motion.span>
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-2" aria-hidden>
      {['logo-final.png', 'launch-site.zip', 'announcement.docx'].map((f, i) => (
        <motion.span
          key={f}
          className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-2.5 text-[12.5px] text-foreground/85"
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.15, duration: 0.5 }}
        >
          <span className="nx-gradient-text font-display text-[10px] font-bold">✓</span>
          {f}
        </motion.span>
      ))}
    </div>
  )
}

export function Workflow() {
  return (
    <section id="how" className="scroll-mt-24" aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="how-title"
          kicker="How it works"
          title={<>Three steps. <span className="font-serif-accent nx-gradient-text font-normal">Zero friction.</span></>}
        />
        <div className="mx-auto mt-14 max-w-3xl space-y-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.n}>
              <div
                className="stack-card gradient-border rounded-[2rem] p-6 sm:p-8"
                style={{ zIndex: i + 1, ['--gb-fill' as string]: '#0b0910' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="text-outline font-display text-5xl font-bold sm:text-6xl">{s.n}</span>
                  <span className="nx-gradient-surface font-display grid h-10 w-10 place-items-center rounded-xl text-sm font-bold">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-display mt-5 text-xl font-bold sm:text-2xl">{s.title}</h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{s.desc}</p>
                <div className="mt-6">
                  <StepVisual kind={s.visual} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Showcase — GSAP clip-path parallax, editorial staggered grid        */
/* ------------------------------------------------------------------ */

const SHOWCASE = [
  {
    src: '/site/showcase-art.png',
    alt: 'Colorful AI-generated digital artwork — an example from the NEXUS Photo Studio',
    tag: 'Photo Studio',
    caption: 'Portraits, product shots and edits — described in one sentence.',
    ratio: 'aspect-[4/5]',
  },
  {
    src: '/site/showcase-video.png',
    alt: 'Video editing timeline on a screen — NEXUS watches and analyzes video scenes',
    tag: 'Video Intelligence',
    caption: 'NEXUS watches your footage and reports scene by scene.',
    ratio: 'aspect-[4/5]',
  },
  {
    src: '/site/showcase-code.png',
    alt: 'Developer coding in a dark room — NEXUS runs code in a live sandbox',
    tag: 'Code Sandbox',
    caption: 'Real execution, real terminal — not a code suggestion box.',
    ratio: 'aspect-[4/5]',
  },
]

export function Showcase() {
  return (
    <section id="showcase" className="scroll-mt-24" aria-labelledby="showcase-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="showcase-title"
          kicker="Made with NEXUS"
          title={<>Real output. <span className="font-serif-accent nx-gradient-text font-normal">Real fast.</span></>}
          sub="A glimpse of what one conversation produces."
        />
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map((item, i) => (
            <Reveal key={item.tag} delay={i * 0.08} className={i === 1 ? 'lg:translate-y-12' : undefined}>
              <ParallaxFigure
                src={item.src}
                alt={item.alt}
                tag={item.tag}
                caption={item.caption}
                className={cn('h-[420px] w-full', item.ratio)}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Testimonials                                                        */
/* ------------------------------------------------------------------ */

const VOICES = [
  {
    quote: 'I asked for a product launch kit and got the logo, the deck and the email — in one thread. I genuinely checked twice that this was one tool.',
    name: 'Sara K.',
    role: 'Founder, early access',
    initials: 'SK',
  },
  {
    quote: 'The agent hand-off feels like magic but it is very legible — you always see who took over and why. That is the part my team trusts.',
    name: 'Diego M.',
    role: 'Creative director',
    initials: 'DM',
  },
  {
    quote: 'Knowledge Base changed our support docs game. Upload the PDFs, ask, and every answer carries a citation chip you can expand.',
    name: 'Aisha R.',
    role: 'Engineering lead',
    initials: 'AR',
  },
]

export function Testimonials() {
  return (
    <section className="relative border-y border-border/60 bg-muted/40" aria-labelledby="voices-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="voices-title"
          kicker="Community voices"
          title={<>Early guests, <span className="font-serif-accent nx-gradient-text font-normal">honest words.</span></>}
        />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {VOICES.map((v, i) => (
            <Reveal key={v.name} delay={i * 0.08}>
              <SpotlightCard className="flex h-full flex-col p-6">
                <Quote className="font-serif-accent text-3xl text-[#ff5a5f]/70" aria-hidden />
                <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">“{v.quote}”</p>
                <footer className="mt-6 flex items-center gap-3">
                  <span
                    aria-hidden
                    className="nx-gradient-surface font-display grid h-10 w-10 place-items-center rounded-full text-xs font-bold"
                  >
                    {v.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.role}</p>
                  </div>
                </footer>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Open-source stack                                                   */
/* ------------------------------------------------------------------ */

interface OssItem {
  name: string
  desc: string
  stars: string
  href: string
}

const OSS_STACK: OssItem[] = [
  { name: 'Next.js', desc: 'The React framework for the web', stars: '125k+', href: 'https://github.com/vercel/next.js' },
  { name: 'React', desc: 'The library for web UIs', stars: '230k+', href: 'https://github.com/facebook/react' },
  { name: 'Three.js', desc: 'WebGL scenes, this page’s orb', stars: '105k+', href: 'https://github.com/mrdoob/three.js' },
  { name: 'TypeScript', desc: 'JavaScript with types', stars: '100k+', href: 'https://github.com/microsoft/TypeScript' },
  { name: 'Tailwind CSS', desc: 'Utility-first styling', stars: '85k+', href: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'shadcn/ui', desc: 'Beautifully designed components', stars: '80k+', href: 'https://github.com/shadcn-ui/ui' },
  { name: 'socket.io', desc: 'Realtime bidirectional events', stars: '62k+', href: 'https://github.com/socketio/socket.io' },
  { name: 'Zustand', desc: 'Tiny state manager', stars: '48k+', href: 'https://github.com/pmndrs/zustand' },
  { name: 'Prisma', desc: 'Type-safe database ORM', stars: '40k+', href: 'https://github.com/prisma/prisma' },
  { name: 'Framer Motion', desc: 'Production-grade motion', stars: '28k+', href: 'https://github.com/motiondivision/motion' },
  { name: 'React Three Fiber', desc: 'Three.js as React elements', stars: '28k+', href: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'GSAP', desc: 'ScrollTrigger choreography', stars: '20k+', href: 'https://github.com/greensock/GSAP' },
  { name: 'Radix UI', desc: 'Accessible primitives', stars: '16k+', href: 'https://github.com/radix-ui/primitives' },
  { name: 'Lucide', desc: 'Feather-quality icon library', stars: '13k+', href: 'https://github.com/lucide-icons/lucide' },
  { name: 'Lenis', desc: 'Buttery smooth scrolling', stars: '10k+', href: 'https://github.com/darkroomengineering/lenis' },
  { name: 'drei', desc: 'R3F helpers & abstractions', stars: '8k+', href: 'https://github.com/pmndrs/drei' },
]

export function OpenSourceStack() {
  return (
    <section id="open-source" className="scroll-mt-24" aria-labelledby="oss-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="oss-title"
          kicker="Open source"
          title={<>Standing on <span className="font-serif-accent nx-gradient-text font-normal">giants.</span></>}
          sub="NEXUS is assembled from the most-starred open-source projects on Earth — including the very effects on this page. Every card links straight to the repository."
        />
        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {OSS_STACK.map((o, i) => (
            <Reveal key={o.name} delay={0.03 * (i % 4)} y={16}>
              <SpotlightCard className="flex h-full flex-col p-4">
                <a href={o.href} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold">{o.name}</h3>
                    <Github className="h-4 w-4 text-muted-foreground/50 transition group-hover:text-foreground" aria-hidden />
                  </div>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground/85">{o.desc}</p>
                  <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#f5a623]">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    {o.stars} on GitHub
                  </p>
                </a>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Is NEXUS free to use?',
    a: 'Yes — you can start free and even explore as a guest with no account. Sign-up is just an email and password, and there is no credit card required to try it.',
  },
  {
    q: 'What can it actually do?',
    a: 'One chat covers chat and reasoning, images, videos, documents (Word, Excel, PowerPoint, PDF), code execution in a sandbox, a live browser, real-time voice calls, email, WhatsApp automation, cited web search and a Knowledge Base that answers from your own documents.',
  },
  {
    q: 'How do the 255 agents work?',
    a: `Instead of you picking a tool, ${AGENCY_STATS.agents} specialists across ${AGENCY_STATS.divisions} divisions watch the conversation. When your request matches their domain, one takes over automatically — visibly — and hands control back when finished.`,
  },
  {
    q: 'Is the concierge on this website the same AI?',
    a: 'It runs on the same multi-AI engine, tuned as a friendly host. Inside the app you get the full toolbox: files, media, browser, voice and your own knowledge base.',
  },
  {
    q: 'Who builds NEXUS?',
    a: 'NEXUS is designed and built by Mounir Shaaban, on top of the open-source stack you can browse in the section above.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-border/60" aria-labelledby="faq-title">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading id="faq-title" kicker="FAQ" title={<>Quick <span className="font-serif-accent nx-gradient-text font-normal">answers.</span></>} />
        <Reveal className="mt-10">
          <Accordion type="single" collapsible className="w-full">
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
      {/* Dot grid + flares */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:26px_26px]"
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
              <span className="font-serif-accent nx-gradient-text font-normal">you are.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {AGENCY_STATS.agents} specialists, {tools}+ tools, one conversation — your first result is minutes away.
            </p>
            <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[52px] items-center gap-2 rounded-full px-9 text-sm font-semibold"
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
/* Footer (sticky bottom) — giant cropped wordmark                     */
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
            <WorkflowIcon className="h-3 w-3" aria-hidden /> Three.js · GSAP · Framer Motion · Lenis
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
