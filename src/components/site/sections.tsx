'use client'

/**
 * NEXUS Official Site — content sections.
 *
 * OSS marquee → bento superpowers → workflow → photo showcase →
 * community voices → open-source stack → FAQ → CTA → footer.
 * Motion everywhere (Framer Motion), restraint in palette.
 */

import Image from 'next/image'
import { motion } from 'framer-motion'
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
  FileText,
  Github,
  Globe,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Mic,
  MousePointerClick,
  Quote,
  Search,
  Star,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { AGENCY_STATS, BrandLockup, TOOL_META } from '@/components/nexus/shared'
import { Counter, Reveal, SectionHeading, Waveform } from './fx'

/* ------------------------------------------------------------------ */
/* OSS marquee                                                         */
/* ------------------------------------------------------------------ */

const MARQUEE_ITEMS = [
  'Next.js', 'React 19', 'TypeScript', 'Tailwind CSS 4', 'shadcn/ui', 'Radix UI',
  'Framer Motion', 'Lenis', 'Prisma', 'socket.io', 'Lucide Icons', 'Zustand',
  'TanStack Query', 'Embla Carousel', 'Recharts', 'Zod',
]

export function OssMarquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <section aria-label="Open-source technologies powering NEXUS" className="border-y border-border/60 bg-muted/30 py-5">
      <div className="marquee-mask marquee-paused overflow-hidden">
        <div className="site-marquee flex w-max items-center gap-8 pr-8">
          {row.map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
              <span className="font-display text-sm font-semibold text-muted-foreground/85">{item}</span>
              <span className="nx-gradient-text text-xs" aria-hidden>✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Superpowers — bento grid                                            */
/* ------------------------------------------------------------------ */

const SMALL_FEATURES = [
  { icon: ImageIcon, title: 'Images by sentence', desc: 'Generate, restyle and retouch photos inline — logos to portraits.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Clapperboard, title: 'AI video', desc: 'Multi-scene clips with narration, captions and analysis.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
  { icon: FileText, title: 'Documents, done', desc: 'Word, Excel, PowerPoint and PDF — built and exported for you.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Braces, title: 'Code & terminal', desc: 'Runs real code and shell commands in a live sandbox.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: MousePointerClick, title: 'Real browser', desc: 'Opens, clicks, fills and reads live web pages like an intern.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
  { icon: Mail, title: 'Email & WhatsApp', desc: 'Drafts and actually sends messages through your accounts.', tint: 'rgba(255,90,95,0.12)', color: '#ff5a5f' },
  { icon: Search, title: 'Cited web search', desc: 'Fresh answers with sources you can open and verify.', tint: 'rgba(245,166,35,0.12)', color: '#f5a623' },
  { icon: Globe, title: 'Knowledge Base', desc: 'Upload docs, get grounded answers with numbered citations.', tint: 'rgba(255,42,104,0.12)', color: '#ff2a68' },
]

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-24" aria-labelledby="features-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="features-title"
          kicker="Superpowers"
          title={<>Everything, in <span className="nx-gradient-text">one chat.</span></>}
          sub="No add-ons, no plugins, no mode-switching. Every power is native to the conversation — and the right specialist picks itself."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Bento large 1 — agents */}
          <Reveal className="md:col-span-2">
            <div className="nx-glow-card group relative h-full overflow-hidden p-6 sm:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#ff5a5f]/10 blur-3xl transition group-hover:bg-[#ff5a5f]/20"
              />
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
            </div>
          </Reveal>

          {/* Bento large 2 — voice */}
          <Reveal delay={0.08} className="md:col-span-1">
            <div className="nx-glow-card group relative h-full overflow-hidden p-6 sm:p-8">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl" style={{ backgroundColor: 'rgba(255,42,104,0.12)', color: '#ff2a68' }}>
                <Mic className="h-5 w-5" />
              </span>
              <h3 className="font-display text-xl font-bold">Voice that talks back</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Real-time calls with instant speech and transcription — this very site greets you out loud.
              </p>
              <Waveform className="mt-6" bars={18} />
            </div>
          </Reveal>

          {/* Small cards */}
          {SMALL_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={0.04 * (i % 3)}>
              <div className="nx-glow-card h-full p-5">
                <span aria-hidden className="mb-4 grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: f.tint, color: f.color }}>
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/85">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Workflow                                                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  { n: '01', title: 'Say what you need', desc: 'One message box, no modes or menus. Plain language in — any language.' },
  { n: '02', title: 'The specialist takes over', desc: `${AGENCY_STATS.agents} agents route themselves into your chat automatically — and hand back when done.` },
  { n: '03', title: 'Get the real thing', desc: 'Downloadable files, generated media, sent emails, browsed pages — results, not links.' },
]

export function Workflow() {
  return (
    <section id="how" className="scroll-mt-24 border-y border-border/60 bg-muted/40" aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="how-title"
          kicker="How it works"
          title="Three steps. Zero friction."
        />
        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative">
                <div className="flex items-center gap-3">
                  <span className="nx-gradient-surface font-display grid h-10 w-10 place-items-center rounded-xl text-sm font-bold">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span aria-hidden className="hidden h-px flex-1 bg-gradient-to-r from-[#ff5a5f]/40 to-transparent sm:block" />
                  )}
                </div>
                <h3 className="font-display mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground/85">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Showcase — real photography, made-with captions                     */
/* ------------------------------------------------------------------ */

const SHOWCASE = [
  {
    src: '/site/showcase-art.png',
    alt: 'Colorful AI-generated digital artwork — an example from the NEXUS Photo Studio',
    tag: 'Photo Studio',
    caption: 'Portraits, product shots and edits — described in one sentence.',
  },
  {
    src: '/site/showcase-video.png',
    alt: 'Video editing timeline on a screen — NEXUS watches and analyzes video scenes',
    tag: 'Video Intelligence',
    caption: 'NEXUS watches your footage and reports scene by scene.',
  },
  {
    src: '/site/showcase-code.png',
    alt: 'Developer coding in a dark room — NEXUS runs code in a live sandbox',
    tag: 'Code Sandbox',
    caption: 'Real execution, real terminal — not a code suggestion box.',
  },
]

export function Showcase() {
  return (
    <section id="showcase" className="scroll-mt-24" aria-labelledby="showcase-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="showcase-title"
          kicker="Made with NEXUS"
          title={<>Real output. <span className="nx-gradient-text">Real fast.</span></>}
          sub="A glimpse of what one conversation produces."
        />
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map((item, i) => (
            <Reveal key={item.tag} delay={i * 0.08}>
              <figure className="nx-glow-card group overflow-hidden rounded-3xl">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-700 group-hover:scale-[1.06]"
                  />
                  <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                    {item.tag}
                  </span>
                </div>
                <figcaption className="px-5 py-4 text-[13px] leading-relaxed text-muted-foreground">
                  {item.caption}
                </figcaption>
              </figure>
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
        <SectionHeading id="voices-title" kicker="Community voices" title="Early guests, honest words." />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {VOICES.map((v, i) => (
            <Reveal key={v.name} delay={i * 0.08}>
              <blockquote className="nx-glow-card flex h-full flex-col p-6">
                <Quote className="h-5 w-5 text-[#ff5a5f]/70" aria-hidden />
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
              </blockquote>
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
  { name: 'TypeScript', desc: 'JavaScript with types', stars: '100k+', href: 'https://github.com/microsoft/TypeScript' },
  { name: 'Tailwind CSS', desc: 'Utility-first styling', stars: '85k+', href: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'shadcn/ui', desc: 'Beautifully designed components', stars: '80k+', href: 'https://github.com/shadcn-ui/ui' },
  { name: 'Radix UI', desc: 'Accessible primitives', stars: '16k+', href: 'https://github.com/radix-ui/primitives' },
  { name: 'Framer Motion', desc: 'Production-grade motion', stars: '27k+', href: 'https://github.com/motiondivision/motion' },
  { name: 'Lenis', desc: 'Buttery smooth scrolling', stars: '10k+', href: 'https://github.com/darkroomengineering/lenis' },
  { name: 'Prisma', desc: 'Type-safe database ORM', stars: '40k+', href: 'https://github.com/prisma/prisma' },
  { name: 'socket.io', desc: 'Realtime bidirectional events', stars: '62k+', href: 'https://github.com/socketio/socket.io' },
  { name: 'Zustand', desc: 'Tiny state manager', stars: '48k+', href: 'https://github.com/pmndrs/zustand' },
  { name: 'Lucide', desc: 'Feather-quality icon library', stars: '13k+', href: 'https://github.com/lucide-icons/lucide' },
]

export function OpenSourceStack() {
  return (
    <section id="open-source" className="scroll-mt-24" aria-labelledby="oss-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          id="oss-title"
          kicker="Open source"
          title={<>Standing on <span className="nx-gradient-text">giants.</span></>}
          sub="NEXUS is assembled from the most-starred open-source projects on Earth. Here is the core of the stack — every card links straight to the repository."
        />
        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {OSS_STACK.map((o, i) => (
            <Reveal key={o.name} delay={0.03 * (i % 4)} y={16}>
              <a
                href={o.href}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-glow-card group flex h-full flex-col p-4"
              >
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
    a: `One chat covers chat and reasoning, images, videos, documents (Word, Excel, PowerPoint, PDF), code execution in a sandbox, a live browser, real-time voice calls, email, WhatsApp automation, cited web search and a Knowledge Base that answers from your own documents.`,
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
        <SectionHeading id="faq-title" kicker="FAQ" title="Quick answers." />
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
    <section aria-labelledby="cta-title" className="relative">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6">
        <Reveal>
          <div className="nx-glow-card relative overflow-hidden rounded-[2rem] p-8 text-center sm:p-14">
            {/* Backdrop flare */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_55%_65%_at_50%_0%,rgba(255,90,95,0.16),transparent_70%)]"
            />
            <Bell className="nx-gradient-text mx-auto h-8 w-8" aria-hidden />
            <h2 id="cta-title" className="font-display relative mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready when <span className="nx-gradient-text">you are.</span>
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {AGENCY_STATS.agents} specialists, {tools}+ tools, one conversation — your first result is minutes away.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onJoin}
                className="nx-gradient-surface flex min-h-[48px] items-center gap-2 rounded-full px-8 text-sm font-semibold"
              >
                Launch NEXUS
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onGuest}
                className="flex min-h-[48px] items-center rounded-full border border-border px-7 text-sm font-semibold text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
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
/* Footer (sticky bottom)                                              */
/* ------------------------------------------------------------------ */

export function SiteFooter({ onTalk }: { onTalk: () => void }) {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)]">
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
            <WorkflowIcon className="h-3 w-3" aria-hidden /> Motion by Framer Motion · scroll by Lenis
          </p>
          <p className="mt-4 text-muted-foreground/70">© {year} NEXUS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
