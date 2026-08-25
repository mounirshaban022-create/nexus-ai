'use client'

/**
 * NEXUS One — shared client foundation for the unified premium chat UI.
 *
 * Every view (shell, chat, composer, voice overlay, agents directory,
 * settings, whatsapp) imports from THIS file only — single source of truth
 * for types, the brand mark, catalog helpers, and the chat protocol.
 */

import Image from 'next/image'
import {
  GraduationCap, PenTool, Code, DollarSign, Gamepad2, Map, Stethoscope,
  Megaphone, Target, Box, ClipboardList, TrendingUp, ShieldCheck, Boxes,
  Sparkles, LifeBuoy, FlaskConical, Hexagon, type LucideIcon,
} from 'lucide-react'
import catalogJson from '@/data/agency-catalog.json'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DivisionMeta {
  id: string
  label: string
  icon: string
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

/** Single source of truth for app navigation. */
export type View =
  | { type: 'chat'; sessionId?: string; prefill?: string }
  | { type: 'agents' }
  | { type: 'whatsapp' }
  | { type: 'skills' }
  | { type: 'settings' }

/* ------------------------------------------------------------------ */
/* Catalog (static import — instant client-side search over 255)       */
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

/** The virtual "plain NEXUS" agent for general conversations. */
export const NEXUS_AGENT: AgentMeta = {
  slug: '__nexus',
  name: 'NEXUS',
  division: '__core',
  description: 'One AI. Every superpower — chat, images, videos, documents, code, voice, email, WhatsApp, browser.',
  emoji: '◆',
  vibe: 'One AI. Every superpower.',
}

export function agentOrNexus(slug: string | null | undefined): AgentMeta {
  if (!slug) return NEXUS_AGENT
  return AGENT_MAP[slug] ?? NEXUS_AGENT
}

/* ------------------------------------------------------------------ */
/* Brand — the Nexus gradient mark (from the uploaded logo)            */
/* ------------------------------------------------------------------ */

export const BRAND = {
  c1: '#f5a623',
  c2: '#ff5a5f',
  c3: '#ff2a68',
  gradient: 'linear-gradient(135deg, #f5a623 0%, #ff5a5f 52%, #ff2a68 100%)',
}

/** The swirl icon mark (transparent PNG extracted from the uploaded logo). */
export function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/nexus-icon.png"
      alt="NEXUS"
      width={size}
      height={size}
      className={className}
      priority
      style={{ width: size, height: size }}
    />
  )
}

/** Full "icon + wordmark" lockup (white text version for dark UIs). */
export function BrandLockup({ height = 26, className = '' }: { height?: number; className?: string }) {
  return (
    <Image
      src="/brand/nexus-lockup-white.png"
      alt="NEXUS"
      width={1205}
      height={267}
      className={className}
      priority
      style={{ height, width: 'auto' }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Division icons — catalog ships icon NAMES; resolved to Lucide here. */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, LucideIcon> = {
  GraduationCap, PenTool, Code, DollarSign, Gamepad2, Map, Stethoscope,
  Megaphone, Target, Box, ClipboardList, TrendingUp, ShieldCheck, Boxes,
  Sparkles, LifeBuoy, FlaskConical,
}

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

/** Hex color → translucent rgba tint. */
export function tint(color: string, alpha = 0.12): string {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ------------------------------------------------------------------ */
/* Chat stream protocol (NDJSON from POST /api/chat)                   */
/* ------------------------------------------------------------------ */

export interface AgentAssignEvent {
  agentSlug: string | null
  name: string
  division: string | null
  divisionLabel?: string | null
  emoji: string
  color: string
  reason: string
  elapsedMs?: number
  pinned?: boolean
}

export type ChatStreamEvent =
  | ({ type: 'user'; id: string; content: string })
  | ({ type: 'agent_assign' } & AgentAssignEvent)
  | { type: 'status'; message: string }
  | { type: 'assistant_start'; id: string }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'assistant_end'; attachments?: unknown[] }
  | { type: 'assistant'; content: string; attachments?: unknown[] }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; index: number }
  | { type: 'tool_result'; tool: string; ok: boolean; result: unknown; index: number }
  | { type: 'tool_progress'; tool: string; index: number; elapsedMs: number; message: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }

/** A rendered conversation message. */
export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string | null
  toolName?: string | null
  toolData?: string | null
  attachments?: unknown[]
  streaming?: boolean
  /** which specialist produced this assistant message */
  agentSlug?: string | null
}

/** One conversation in the sessions list (GET /api/chat/sessions). */
export interface SessionItem {
  id: string
  title: string
  kind?: string
  agentSlug?: string | null
  agentPinned?: boolean
  updatedAt: string
  messageCount: number
  preview: string
}

/* ------------------------------------------------------------------ */
/* Tool presentation metadata                                          */
/* ------------------------------------------------------------------ */

export const TOOL_META: Record<string, { label: string }> = {
  generate_image: { label: 'Creating image' },
  generate_video: { label: 'Producing video' },
  create_document: { label: 'Building document' },
  create_spreadsheet: { label: 'Building spreadsheet' },
  edit_document: { label: 'Editing document' },
  pdf_operation: { label: 'Processing PDF' },
  run_code: { label: 'Running code' },
  run_command: { label: 'Running command' },
  web_search: { label: 'Searching the web' },
  read_page: { label: 'Reading page' },
  browser_action: { label: 'Driving browser' },
  send_email: { label: 'Sending email' },
  send_whatsapp: { label: 'Sending WhatsApp' },
  use_skill: { label: 'Loading skill' },
  email_organize: { label: 'Organizing inbox' },
  email_folders: { label: 'Listing folders' },
  email_list: { label: 'Checking inbox' },
  email_search: { label: 'Searching inbox' },
  email_read: { label: 'Reading email' },
}

export function toolLabel(name: string): string {
  return (
    TOOL_META[name]?.label ??
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

/* ------------------------------------------------------------------ */
/* Auth (shared shape used by page.tsx)                                */
/* ------------------------------------------------------------------ */

export interface AppUser {
  id: string
  email: string
  name?: string | null
}
