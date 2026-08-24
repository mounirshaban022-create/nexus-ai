import {
  MessagesSquare,
  Palette,
  Eye,
  MicVocal,
  Compass,
  BookOpen,
  Hexagon,
  Bot,
  Waypoints,
  AudioWaveform,
  FileStack,
  Layers,
  Code2,
  Clapperboard,
  FileSearch,
  Settings,
  UserCircle2,
  type LucideIcon,
} from 'lucide-react'

export type ModeId =
  | 'home'
  | 'agent'
  | 'chat'
  | 'voice-live'
  | 'connectors'
  | 'image'
  | 'vision'
  | 'voice'
  | 'search'
  | 'reader'
  | 'office'
  | 'models'
  | 'code'
  | 'video'
  | 'documents'
  | 'settings'
  | 'profile'

export interface ModeDefinition {
  id: ModeId
  label: string
  shortLabel: string
  tagline: string
  description: string
  icon: LucideIcon
  group: 'converse' | 'superpowers'
  /** Primary = shown in mobile bottom bar & top of sidebar */
  primary?: boolean
  /** Tailwind text color class for the mode accent */
  accentText: string
  /** Tailwind bg color class (translucent) for the mode accent */
  accentBg: string
  /** Tailwind border color class for the mode accent */
  accentBorder: string
  /** Solid gradient pair for hero chips */
  gradient: string
}

export const MODES: ModeDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    tagline: 'Command center',
    description: 'Your AI command center — jump into any superpower.',
    icon: Hexagon,
    group: 'converse',
    accentText: 'text-foreground',
    accentBg: 'bg-violet-100',
    accentBorder: 'border-violet-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'agent',
    primary: true,
    label: 'Agent',
    shortLabel: 'Agent',
    tagline: 'Thinks. Acts. Delivers.',
    description:
      'An autonomous agent that chains connectors — search, weather, GitHub, math and more — to complete real tasks.',
    icon: Bot,
    group: 'converse',
    accentText: 'text-foreground',
    accentBg: 'bg-sky-100',
    accentBorder: 'border-sky-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'voice-live',
    primary: true,
    label: 'Live Voice',
    shortLabel: 'Voice',
    tagline: 'Talk like a human',
    description:
      'Real-time voice conversation — NEXUS hears you, thinks, and speaks back with natural flow.',
    icon: AudioWaveform,
    group: 'converse',
    accentText: 'text-foreground',
    accentBg: 'bg-pink-100',
    accentBorder: 'border-pink-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'chat',
    primary: true,
    label: 'AI Chat',
    shortLabel: 'Chat',
    tagline: 'Converse with NEXUS',
    description: 'Ask anything — now with visible Thinking. Multi-turn Markdown conversations.',
    icon: MessagesSquare,
    group: 'converse',
    accentText: 'text-foreground',
    accentBg: 'bg-violet-100',
    accentBorder: 'border-violet-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'models',
    label: 'AI Models',
    shortLabel: 'Models',
    tagline: 'Bring your own free key',
    description:
      'Plug in free API keys from OpenRouter, Groq, Gemini, Mistral, Cerebras and Together — the best open-source models.',
    icon: Layers,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-violet-100',
    accentBorder: 'border-violet-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'profile',
    label: 'Profile',
    shortLabel: 'Profile',
    tagline: 'Your account',
    description: 'Your NEXUS AI account, membership and security.',
    icon: UserCircle2,
    group: 'superpowers',
    accentText: 'text-primary',
    accentBg: 'bg-secondary',
    accentBorder: 'border-border',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    tagline: 'Profile · Theme · Language · Legal',
    description: 'Your profile, appearance, language, account and legal documents.',
    icon: Settings,
    group: 'superpowers',
    accentText: 'text-muted-foreground',
    accentBg: 'bg-secondary',
    accentBorder: 'border-border',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'connectors',
    label: 'Connectors',
    shortLabel: 'Connect',
    tagline: 'Plug into the world',
    description:
      'Browse, enable and test the live connectors that power the Agent — the NEXUS app mesh.',
    icon: Waypoints,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-teal-100',
    accentBorder: 'border-teal-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'image',
    label: 'Image Studio',
    shortLabel: 'Image',
    tagline: 'Imagine it into existence',
    description: 'Turn text prompts into stunning AI-generated artwork.',
    icon: Palette,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-pink-100',
    accentBorder: 'border-pink-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'vision',
    label: 'Vision',
    shortLabel: 'Vision',
    tagline: 'See what you see',
    description: 'Upload any image and ask questions about its content.',
    icon: Eye,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-emerald-100',
    accentBorder: 'border-emerald-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'voice',
    label: 'Voice Studio',
    shortLabel: 'Studio',
    tagline: 'Speak & be heard',
    description: 'Turn text into lifelike speech and speech back into text.',
    icon: MicVocal,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-amber-100',
    accentBorder: 'border-amber-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'search',
    primary: true,
    label: 'Web Search',
    shortLabel: 'Search',
    tagline: 'Know the now',
    description: 'Search the live web and get an instant AI digest of results.',
    icon: Compass,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-rose-100',
    accentBorder: 'border-rose-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'code',
    label: 'Code Studio',
    shortLabel: 'Code',
    tagline: 'Write code. Run it. Real sandbox.',
    description:
      'Write JavaScript, TypeScript or Python with AI help — and execute it in a real isolated sandbox with live output.',
    icon: Code2,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-emerald-100',
    accentBorder: 'border-emerald-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'video',
    label: 'Video Studio',
    shortLabel: 'Video',
    tagline: 'AI videos, real MP4s',
    description:
      'Describe a video — NEXUS plans scenes, generates images, narrates with AI voices, and renders a real MP4.',
    icon: Clapperboard,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-rose-100',
    accentBorder: 'border-rose-200',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'documents',
    label: 'Documents',
    shortLabel: 'Docs',
    tagline: 'Read · Chat · Edit — any document',
    description:
      'Upload PDF, Word, Excel, PowerPoint — AI reads it, answers questions, and edits it like Claude.',
    icon: FileSearch,
    group: 'superpowers',
    accentText: 'text-primary',
    accentBg: 'bg-secondary',
    accentBorder: 'border-border',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'office',
    label: 'Office Studio',
    shortLabel: 'Office',
    tagline: 'Real documents, built for you',
    description:
      'Generate real Word, Excel, PowerPoint and Markdown files — or read any uploaded document.',
    icon: FileStack,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-secondary',
    accentBorder: 'border-sky-500/30',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'reader',
    label: 'Page Reader',
    shortLabel: 'Reader',
    tagline: 'Read anything',
    description: 'Paste any URL and extract its full content instantly.',
    icon: BookOpen,
    group: 'superpowers',
    accentText: 'text-foreground',
    accentBg: 'bg-orange-100',
    accentBorder: 'border-orange-200',
    gradient: 'from-orange-500 to-rose-500',
  },
]

export const MODE_MAP: Record<ModeId, ModeDefinition> = MODES.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode }),
  {} as Record<ModeId, ModeDefinition>
)

/* ------------------------------------------------------------------ */
/* Shared item types                                                   */
/* ------------------------------------------------------------------ */

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string | null
  toolName?: string | null
  toolData?: string | null
}

export interface ChatSessionItem {
  id: string
  title: string
  kind?: string
  updatedAt: string
  messageCount: number
  preview: string
}

export interface GeneratedImageItem {
  id: string
  url: string
  prompt: string
  size: string
  createdAt: string
}

export interface SearchResultItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date?: string
  favicon?: string
}

export interface ConnectorParamMeta {
  name: string
  type: 'string' | 'number'
  description: string
  required: boolean
}

export interface ConnectorMeta {
  id: string
  name: string
  category: 'web' | 'knowledge' | 'developer' | 'utility'
  description: string
  params: ConnectorParamMeta[]
  sampleArgs: Record<string, unknown>
}

/** Live agent stream events (NDJSON, one JSON object per line). */
export type AgentEvent =
  | { type: 'user'; id: string; content: string }
  | { type: 'plan'; plan: string }
  | { type: 'reflection'; note: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; index: number }
  | { type: 'tool_result'; id: string; tool: string; ok: boolean; result: unknown; index: number }
  | { type: 'assistant'; id: string; content: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }


/* ------------------------------------------------------------------ */
/* Unified chat stream events + inline attachments                     */
/* ------------------------------------------------------------------ */

export interface ChatAttachment {
  type: 'image' | 'document' | 'code' | 'search'
  url?: string
  title?: string
  format?: string
  size?: number
  language?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
  results?: Array<{ title: string; url: string; snippet?: string }>
}

export type ChatEvent =
  | { type: 'user'; id: string; content: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; index: number }
  | { type: 'tool_result'; tool: string; ok: boolean; result: unknown; index: number }
  | { type: 'assistant'; content: string; attachments?: ChatAttachment[] }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }
