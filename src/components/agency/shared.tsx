'use client'

/**
 * The Agency — shared client foundation.
 *
 * Both halves of the redesigned frontend (shell/landing/auth/home by task 5-a,
 * roster/agent-profile/chat by task 6-a) import from THIS file only, so the
 * two halves can never drift apart. Catalog metadata is imported statically
 * (117KB → ~25KB gzipped) for instant client-side search across all 255
 * specialist agents — no API round-trip needed for browsing.
 */

import {
  GraduationCap,
  PenTool,
  Code,
  DollarSign,
  Gamepad2,
  Map,
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
  Hexagon,
  type LucideIcon,
} from 'lucide-react'
import catalogJson from '@/data/agency-catalog.json'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DivisionMeta {
  id: string
  label: string
  /** Lucide icon name (PascalCase) — resolved by DivisionIcon below. */
  icon: string
  /** Brand color (hex) from the upstream divisions.json. */
  color: string
  count: number
}

export interface AgentMeta {
  slug: string
  name: string
  division: string
  description: string
  emoji: string
  vibe: string
}

/** The single source of truth for app navigation in the redesigned shell. */
export type View =
  | { type: 'home' }
  | { type: 'roster'; query?: string; division?: string }
  | { type: 'division'; divisionId: string }
  | { type: 'agent'; agentSlug: string }
  | { type: 'chat'; agentSlug: string | null; sessionId?: string }
  | { type: 'whatsapp' }
  | { type: 'settings' }

/* ------------------------------------------------------------------ */
/* Catalog (static import — instant client-side search)                */
/* ------------------------------------------------------------------ */

const catalog = catalogJson as unknown as {
  stats: { agents: number; divisions: number }
  divisions: DivisionMeta[]
  agents: AgentMeta[]
}

export const AGENCY_STATS = catalog.stats
export const AGENCY_DIVISIONS = catalog.divisions
export const AGENCY_AGENTS = catalog.agents

export const DIVISION_MAP: Record<string, DivisionMeta> = Object.fromEntries(
  AGENCY_DIVISIONS.map((d) => [d.id, d])
)

export const AGENT_MAP: Record<string, AgentMeta> = Object.fromEntries(
  AGENCY_AGENTS.map((a) => [a.slug, a])
)

export function divisionOf(agent: AgentMeta): DivisionMeta | undefined {
  return DIVISION_MAP[agent.division]
}

/** The virtual "plain NEXUS" agent used for conversations without a persona. */
export const NEXUS_AGENT: AgentMeta = {
  slug: '__nexus',
  name: 'NEXUS',
  division: '__core',
  description:
    'Your generalist AI — every NEXUS superpower (images, documents, code, live data, search) in one conversation.',
  emoji: '◆',
  vibe: 'One AI. Every superpower.',
}

export function agentOrNexus(slug: string | null | undefined): AgentMeta {
  if (!slug) return NEXUS_AGENT
  return AGENT_MAP[slug] ?? NEXUS_AGENT
}

/* ------------------------------------------------------------------ */
/* Division icons — upstream ships icon NAMES; we resolve to Lucide.   */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  PenTool,
  Code,
  DollarSign,
  Gamepad2,
  Map,
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

/** Renders a division's Lucide icon in its brand color. */
export function DivisionIcon({
  division,
  className = 'h-4 w-4',
}: {
  division: DivisionMeta | undefined
  className?: string
}) {
  if (!division) return <Hexagon className={className} />
  const Icon = ICONS[division.icon] ?? Hexagon
  return <Icon className={className} style={{ color: division.color }} />
}

/** Hex color → translucent background tint (for chips / avatars). */
export function tint(color: string, alpha = 0.12): string {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ------------------------------------------------------------------ */
/* Chat stream protocol (NDJSON from POST /api/chat)                   */
/* Same protocol the legacy omni/chat-mode.tsx consumes — see that file */
/* for the battle-tested reference implementation.                      */
/* ------------------------------------------------------------------ */

export type ChatStreamEvent =
  | { type: 'user'; id: string; content: string }
  | { type: 'assistant_start'; id: string }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'assistant_end'; attachments?: unknown[] }
  | { type: 'assistant'; content: string; attachments?: unknown[] }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; index: number }
  | { type: 'tool_result'; tool: string; ok: boolean; result: unknown; index: number }
  | { type: 'tool_progress'; tool: string; index: number; elapsedMs: number; message: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }

/** A rendered conversation message (mirror of the DB row shape). */
export interface AgencyMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string | null
  toolName?: string | null
  toolData?: string | null
  attachments?: unknown[]
  streaming?: boolean
}

/** One conversation in the sessions list (GET /api/chat/sessions). */
export interface AgencySessionItem {
  id: string
  title: string
  kind?: string
  agentSlug?: string | null
  updatedAt: string
  messageCount: number
  preview: string
}

/* ------------------------------------------------------------------ */
/* Featured agents — hand-picked for the home dashboard.               */
/* ------------------------------------------------------------------ */

export const FEATURED_AGENT_SLUGS = [
  'design-ui-designer',
  'engineering-ai-engineer',
  'engineering-frontend-developer',
  'marketing-growth-hacker',
  'product-manager',
  'chief-financial-officer',
  'finance-financial-analyst',
  'marketing-content-creator',
]

export const FEATURED_AGENTS: AgentMeta[] = FEATURED_AGENT_SLUGS.map(
  (s) => AGENT_MAP[s]
).filter(Boolean)
