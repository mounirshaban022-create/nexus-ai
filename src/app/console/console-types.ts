/* Shared types for the console UI (mirror of the API payloads). */
export interface ConsoleUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  bio: string | null
  location: string | null
  timezone: string | null
  language: string
  jobTitle: string | null
  emailVerified: boolean
  lastActiveAt: string | null
  createdAt: string
  stats?: { sessions: number; messages: number; images: number; videos: number; documents: number; projects: number }
  control?: { suspended: boolean; note: string | null }
}

export interface SessionCard {
  id: string
  title: string
  kind: string
  agentSlug: string | null
  agentPinned: boolean
  user: { id: string | null; email: string; name: string; avatarUrl?: string | null }
  project: { id: string; name: string; color: string } | null
  messageCount: number
  preview: string
  createdAt: string
  updatedAt: string
}

export interface TranscriptMessage {
  id: string
  role: string
  content: string
  thinking: string | null
  toolName: string | null
  toolData: string | null
  attachments: string | null
  toolDataParsed: { args?: unknown; result?: unknown; raw?: string } | null
  attachmentsParsed: Record<string, unknown>[]
  createdAt: string
}

export interface Overview {
  users: { total: number; new24h: number; activeWeek: number; guests: number }
  conversations: { sessions: number; messages: number; messages24h: number; agentSessions: number }
  generations: { images: number; videos: number; documents: number; images24h: number }
  messaging: { emailAccounts: number; whatsappAccounts: number; whatsappMessages: number; whatsappIn24h: number }
  workspace: { projects: number; memories: number }
  engines: Record<string, boolean>
  platform: { dbLatencyMs: number; supabaseConfigured: boolean; nodeEnv: string; isVercel: boolean; region: string }
  activity: { day: string; count: number }[]
  auditTrail: { id: string; action: string; target: string | null; detail: string | null; createdAt: string }[]
  generatedAt: string
}

export interface Integrations {
  presence: Record<string, boolean>
  integrations: {
    vercel: { configured: boolean; ok: boolean; error?: string; projects?: { id: string; name: string; framework: string; latestDeployment: string | null }[] }
    github: { configured: boolean; ok: boolean; error?: string; repo?: { fullName: string; branch: string; private: boolean; stars: number; openIssues: number; pushedAt: string; language: string }; commits?: { sha: string; message: string; author: string; date: string }[] }
    supabase: { configured: boolean; ok: boolean; url?: string; status?: number; error?: string }
  }
  deployments: { url: string; state: string; createdAt: number; commit: string }[]
  checkedAt: string
}

export interface EmailAccountRow {
  id: string
  label: string
  email: string
  fromName: string
  smtpHost: string
  smtpPort: number
  status: string
  statusMessage: string
  user?: { email: string; name: string }
}

export interface WhatsAppAccountRow {
  id: string
  label: string
  businessName: string
  displayPhone: string
  status: string
  autoReply: boolean
  webhookVerified: boolean
  user?: { email: string; name: string }
}

export interface WhatsAppMessageRow {
  id: string
  accountId: string
  fromNumber: string
  toNumber: string
  direction: 'in' | 'out'
  body: string
  status: string
  createdAt: string
  account?: { label: string; displayPhone: string }
}

export interface DocTemplate {
  id: string
  name: string
  description: string
  fields: { key: string; label: string; type: 'text' | 'textarea' | 'number'; placeholder?: string; required?: boolean }[]
}

export interface DocRow {
  id: string
  filename: string
  format: string
  title: string
  summary: string
  size: number
  createdAt: string
  fileUrl?: string
}

export interface StudioEngines {
  chat: { id: string; name: string; available: boolean }[]
  image: { id: string; name: string; available: boolean }[]
  video: { agnesKey: boolean; fallbackPipeline: boolean; note: string }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/console${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
    ...init,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`)
  return json as T
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
