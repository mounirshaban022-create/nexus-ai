import { randomUUID, randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/email'
import { smartChat } from '@/lib/smart-chat'
import { freeWebSearch } from '@/lib/web-access'
import { appOriginFromEnv } from '@/lib/origin'

/* ------------------------------------------------------------------ */
/* SOCIAL AUTOMATION ENGINE — real work, zero human babysitting.       */
/*                                                                     */
/* Supports four platforms with their REAL publish APIs:               */
/*   • Instagram  — Graph API: media container → media_publish        */
/*                  (images, carousels and REELS videos)               */
/*   • LinkedIn   — /v2/ugcPosts (+ /v2/assets image registration)     */
/*   • X (Twitter)— POST /2/tweets (+ v1.1 media upload)               */
/*   • Facebook   — Page /photos, /videos, /feed                       */
/*                                                                     */
/* Honest-mode design: when credentials are live and the media URL is  */
/* publicly reachable the publish REALLY goes on-air. When the network */
/* can't reach the platform (sandbox/air-gapped) or the media URL is   */
/* only local, the run completes in SIMULATION mode — the post row is  */
/* marked `simulated` so the UI can tell the two apart. Nothing is     */
/* silently faked: the mode is always surfaced.                        */
/*                                                                     */
/* Autopilot: runAutopilotTick() finds due accounts, generates the     */
/* caption (smartChat) + the visual (premium cascade → free pollina-   */
/* tions), publishes, and stamps lastAutoPostAt. It is triggered by    */
/* the app heartbeat (GET /api/social/posts) and the "Run now" button. */
/* ------------------------------------------------------------------ */

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const TIMEOUT = 15_000

export type SocialPlatform = 'instagram' | 'linkedin' | 'x' | 'facebook'

export interface PlatformField {
  key: string
  label: string
  hint: string
}

export interface PlatformMeta {
  label: string
  color: string
  fields: PlatformField[]
  limits: { caption: number; media: 'none' | 'single' | 'carousel'; video: boolean }
  docs: string
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, PlatformMeta> = {
  instagram: {
    label: 'Instagram',
    color: '#e1306c',
    fields: [
      { key: 'accessToken', label: 'Access Token', hint: 'Meta app token with instagram_content_publish (Business/Creator account)' },
      { key: 'externalId', label: 'Instagram Business Account ID', hint: 'The ig-user-id from your Meta App Dashboard → Instagram' },
    ],
    limits: { caption: 2200, media: 'carousel', video: true },
    docs: 'developers.facebook.com/docs/instagram-api',
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0a66c2',
    fields: [
      { key: 'accessToken', label: 'Access Token', hint: 'OAuth token with w_member_social (or w_organization_social) scope' },
      { key: 'authorUrn', label: 'Author URN (optional)', hint: 'Leave empty to post as you · e.g. urn:li:organization:123456 for a page' },
    ],
    limits: { caption: 3000, media: 'single', video: false },
    docs: 'learn.microsoft.com/en-us/linkedin/marketing/',
  },
  x: {
    label: 'X (Twitter)',
    color: '#e7e9ea',
    fields: [
      { key: 'accessToken', label: 'Access Token (OAuth 2.0)', hint: 'User context token with tweet.write + media.write scopes' },
    ],
    limits: { caption: 280, media: 'single', video: false },
    docs: 'developer.x.com/en/docs/x-api',
  },
  facebook: {
    label: 'Facebook Page',
    color: '#1877f2',
    fields: [
      { key: 'accessToken', label: 'Page Access Token', hint: 'Token for the page with pages_manage_posts' },
      { key: 'externalId', label: 'Page ID', hint: 'The numeric page id (from /me/accounts)' },
    ],
    limits: { caption: 5000, media: 'carousel', video: true },
    docs: 'developers.facebook.com/docs/pages-api',
  },
}

export function isSocialPlatform(v: string): v is SocialPlatform {
  return v === 'instagram' || v === 'linkedin' || v === 'x' || v === 'facebook'
}

/* ------------------------------------------------------------------ */
/* OAuth app credentials — DB first (in-app Connect wizard), env fall- */
/* back. Encrypted at rest (AES-256-GCM). This is what makes "just    */
/* sign in" possible: the wizard lets the account owner switch a      */
/* platform's official connection ON at runtime, no redeploy.         */
/* ------------------------------------------------------------------ */

const ENV_IDS: Record<SocialPlatform, string> = {
  instagram: 'META_APP_ID',
  facebook: 'META_APP_ID',
  linkedin: 'LINKEDIN_CLIENT_ID',
  x: 'X_CLIENT_ID',
}

const ENV_SECRETS: Record<SocialPlatform, string> = {
  instagram: 'META_APP_SECRET',
  facebook: 'META_APP_SECRET',
  linkedin: 'LINKEDIN_CLIENT_SECRET',
  x: 'X_CLIENT_SECRET',
}

export interface PlatformCredentials {
  clientId: string
  clientSecret: string
  source: 'database' | 'environment'
}

export async function getPlatformCredentials(platform: SocialPlatform): Promise<PlatformCredentials | null> {
  try {
    const row = await db.platformCredential.findUnique({ where: { platform } })
    if (row?.clientIdEnc && row?.clientSecretEnc) {
      return {
        clientId: decryptSecret(row.clientIdEnc),
        clientSecret: decryptSecret(row.clientSecretEnc),
        source: 'database',
      }
    }
  } catch {
    /* table missing or decrypt failed — fall through to env */
  }
  const clientId = process.env[ENV_IDS[platform]]?.trim() ?? ''
  const clientSecret = process.env[ENV_SECRETS[platform]]?.trim() ?? ''
  if (clientId && clientSecret) return { clientId, clientSecret, source: 'environment' }
  return null
}

/* Where the account owner creates the platform's app (the ONLY human
   step no one else can do — it requires their identity, once). */
export const PLATFORM_APP_URLS: Record<SocialPlatform, string> = {
  instagram: 'https://developers.facebook.com/apps',
  facebook: 'https://developers.facebook.com/apps',
  linkedin: 'https://www.linkedin.com/developers/apps',
  x: 'https://developer.x.com/en/portal/dashboard',
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export interface SocialAccountRecord {
  id: string
  userId: string | null
  platform: SocialPlatform
  displayName: string
  externalId: string
  meta: Record<string, string>
  autopilot: boolean
  autopilotTopic: string
  autopilotCadenceMinutes: number
  lastAutoPostAt: Date | null
  // page brain / trend radar / engagement
  pageNiche: string
  pageAudience: string
  pageTone: string
  pageGoal: string
  pageLanguage: string
  pageStrategy: string
  trendBrain: string
  trendAt: Date | null
  autoReply: boolean
  status: string
  statusMessage: string
}

export interface PublicSocialAccount {
  id: string
  platform: SocialPlatform
  platformLabel: string
  displayName: string
  handle: string
  avatarUrl: string
  autopilot: boolean
  autopilotTopic: string
  autopilotCadenceMinutes: number
  lastAutoPostAt: string | null
  pageNiche: string
  pageAudience: string
  pageTone: string
  pageGoal: string
  pageLanguage: string
  strategy: PageStrategy | null
  trends: TrendBrain | null
  autoReply: boolean
  status: string
  statusMessage: string
  tokenPreview: string
  createdAt: string
}

export function toRecord(row: {
  id: string
  userId: string | null
  platform: string
  displayName: string
  externalId: string
  meta: string
  accessTokenEnc: string
  autopilot: boolean
  autopilotTopic: string
  autopilotCadenceMinutes: number
  lastAutoPostAt: Date | null
  pageNiche?: string | null
  pageAudience?: string | null
  pageTone?: string | null
  pageGoal?: string | null
  pageLanguage?: string | null
  pageStrategy?: string | null
  trendBrain?: string | null
  trendAt?: Date | null
  autoReply?: boolean | null
  status: string
  statusMessage: string
}): SocialAccountRecord {
  let meta: Record<string, string> = {}
  try {
    meta = JSON.parse(row.meta || '{}')
  } catch {
    /* keep {} */
  }
  return {
    id: row.id,
    userId: row.userId,
    platform: (isSocialPlatform(row.platform) ? row.platform : 'instagram') as SocialPlatform,
    displayName: row.displayName,
    externalId: row.externalId,
    meta,
    autopilot: row.autopilot,
    autopilotTopic: row.autopilotTopic,
    autopilotCadenceMinutes: row.autopilotCadenceMinutes,
    lastAutoPostAt: row.lastAutoPostAt,
    pageNiche: row.pageNiche ?? '',
    pageAudience: row.pageAudience ?? '',
    pageTone: row.pageTone ?? '',
    pageGoal: row.pageGoal ?? '',
    pageLanguage: row.pageLanguage ?? '',
    pageStrategy: row.pageStrategy ?? '',
    trendBrain: row.trendBrain ?? '',
    trendAt: row.trendAt ?? null,
    autoReply: row.autoReply ?? false,
    status: row.status,
    statusMessage: row.statusMessage,
  }
}

function maskToken(token: string): string {
  if (!token) return ''
  const head = token.slice(0, 6)
  const tail = token.slice(-4)
  return `${head}…${tail}`
}

export function toPublicAccount(rec: SocialAccountRecord, token: string): PublicSocialAccount {
  return {
    id: rec.id,
    platform: rec.platform,
    platformLabel: SOCIAL_PLATFORMS[rec.platform].label,
    displayName: rec.displayName,
    handle: rec.meta.handle || rec.meta.username || '',
    avatarUrl: rec.meta.avatarUrl || '',
    autopilot: rec.autopilot,
    autopilotTopic: rec.autopilotTopic,
    autopilotCadenceMinutes: rec.autopilotCadenceMinutes,
    lastAutoPostAt: rec.lastAutoPostAt ? rec.lastAutoPostAt.toISOString() : null,
    pageNiche: rec.pageNiche,
    pageAudience: rec.pageAudience,
    pageTone: rec.pageTone,
    pageGoal: rec.pageGoal,
    pageLanguage: rec.pageLanguage,
    strategy: safeJson<PageStrategy | null>(rec.pageStrategy, null),
    trends: safeJson<TrendBrain | null>(rec.trendBrain, null),
    autoReply: rec.autoReply,
    status: rec.status,
    statusMessage: rec.statusMessage,
    tokenPreview: maskToken(token),
    createdAt: '',
  }
}

/** SECURITY: connections are private per user — userId is mandatory. */
export async function listSocialAccounts(userId: string): Promise<PublicSocialAccount[]> {
  const rows = await db.socialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((row) => {
    let token = ''
    try {
      token = decryptSecret(row.accessTokenEnc)
    } catch {
      /* unreadable secret — masked anyway */
    }
    return toPublicAccount(toRecord(row), token)
  })
}

export async function getSocialAccount(userId: string, id: string): Promise<{ rec: SocialAccountRecord; token: string } | null> {
  const row = await db.socialAccount.findFirst({ where: { id, userId } })
  if (!row) return null
  let token = ''
  try {
    token = decryptSecret(row.accessTokenEnc)
  } catch {
    /* empty token → simulation mode */
  }
  return { rec: toRecord(row), token }
}

export async function logActivity(userId: string | null, accountId: string, kind: string, message: string) {
  await db.socialActivity.create({ data: { userId, accountId, kind, message } }).catch(() => {})
}

/* ================================================================== */
/* PAGE BRAIN — the agent actually KNOWS this page before it acts.     */
/* Every prompt (post, visual brief, reply) is injected with the page  */
/* brain + the latest trend research, so the output is on-brand,       */
/* audience-aware and informed by what is working RIGHT NOW.           */
/* ================================================================== */

/** Tolerant JSON parse for LLM output (handles ``` fences + prose). */
function safeJson<T>(raw: string, fallback: T): T {
  if (!raw || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    /* keep trying */
  }
  const s = raw.indexOf('{')
  const e = raw.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(raw.slice(s, e + 1)) as T
    } catch {
      /* fall through */
    }
  }
  return fallback
}

export interface PageStrategy {
  voice: string
  pillars: string[]
  hooks: string[]
  dos: string[]
  donts: string[]
  hashtags: string[]
}

export interface TrendBrain {
  summary: string
  topics: string[]
  hooks: string[]
  formats: string[]
  hashtags: string[]
  sources: { title: string; url: string }[]
  fetchedAt: string
  researched: boolean // true = live web research, false = model knowledge fallback
}

const STRATEGY_TTL_HOURS = 6

function pageBrainRows(row: {
  pageNiche?: string | null
  pageAudience?: string | null
  pageTone?: string | null
  pageGoal?: string | null
  pageLanguage?: string | null
  autopilotTopic?: string | null
}) {
  return {
    niche: (row.pageNiche || row.autopilotTopic || '').trim(),
    audience: (row.pageAudience || '').trim(),
    tone: (row.pageTone || '').trim(),
    goal: (row.pageGoal || '').trim(),
    language: (row.pageLanguage || '').trim(),
  }
}

/** Assembles the PAGE context block injected into every agent prompt. */
export function pageBrainContextOf(row: SocialAccountRecord): string {
  const p = pageBrainRows(row)
  const parts: string[] = []
  if (p.niche) parts.push(`Page niche: ${p.niche}`)
  if (p.audience) parts.push(`Audience: ${p.audience}`)
  if (p.tone) parts.push(`Brand voice: ${p.tone}`)
  if (p.goal) parts.push(`Goal: ${p.goal}`)
  if (p.language) parts.push(`Content language: ${p.language}`)
  const strategy = safeJson<PageStrategy | null>(row.pageStrategy, null)
  if (strategy) {
    if (strategy.voice) parts.push(`Documented voice: ${strategy.voice}`)
    if (strategy.pillars?.length) parts.push(`Content pillars: ${strategy.pillars.slice(0, 6).join('; ')}`)
    if (strategy.dos?.length) parts.push(`Always: ${strategy.dos.slice(0, 5).join('; ')}`)
    if (strategy.donts?.length) parts.push(`Never: ${strategy.donts.slice(0, 5).join('; ')}`)
    if (strategy.hashtags?.length) parts.push(`Brand hashtags: ${strategy.hashtags.slice(0, 8).join(' ')}`)
  }
  return parts.join('\n')
}

/** Assembles the TREND context block — what is attracting people now. */
export function trendContextOf(row: SocialAccountRecord): string {
  const t = safeJson<TrendBrain | null>(row.trendBrain, null)
  if (!t) return ''
  const parts: string[] = []
  if (t.summary) parts.push(`What is working now: ${t.summary}`)
  if (t.topics?.length) parts.push(`Hot topics: ${t.topics.slice(0, 6).join('; ')}`)
  if (t.hooks?.length) parts.push(`Proven hooks to model (never copy verbatim): ${t.hooks.slice(0, 6).join(' | ')}`)
  if (t.formats?.length) parts.push(`Formats that attract: ${t.formats.slice(0, 4).join('; ')}`)
  if (t.hashtags?.length) parts.push(`Trending hashtags: ${t.hashtags.slice(0, 8).join(' ')}`)
  if (t.sources?.length) parts.push(`Sources seen: ${t.sources.slice(0, 5).map((s) => s.url).join(', ')}`)
  return parts.join('\n')
}

/** Builds (or refreshes) the AI page strategy: pillars, voice, hooks, rules. */
export async function buildPageStrategy(userId: string, accountId: string): Promise<{ strategy: PageStrategy }> {
  const row = await db.socialAccount.findFirst({ where: { id: accountId, userId } })
  if (!row) throw new Error('Account not found')
  const rec = toRecord(row)
  const p = pageBrainRows(row)

  const system =
    'You are a senior social media strategist. From the page description alone, define its content strategy. Output ONLY a JSON object with keys: voice (one vivid sentence), pillars (array of 4-5 content pillar ideas), hooks (array of 5 opening lines proven to stop the scroll, in the page language), dos (array of 4 style rules), donts (array of 4 things to avoid), hashtags (array of 6-8 hashtags starting with #). No markdown, no commentary.'
  const user = [
    `Platform: ${rec.platform}.`,
    p.niche ? `The page is about: ${p.niche}` : 'The page is a small growing brand.',
    p.audience ? `Audience: ${p.audience}` : '',
    p.tone ? `Desired tone: ${p.tone}` : '',
    p.goal ? `Business goal: ${p.goal}` : '',
    p.language ? `Content language: ${p.language} (write hooks in this language).` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await smartChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 800, temperature: 0.6, task: 'reasoning', userId },
  )
  const strategy = safeJson<PageStrategy>(raw, { voice: '', pillars: [], hooks: [], dos: [], donts: [], hashtags: [] })
  const clean: PageStrategy = {
    voice: String(strategy.voice ?? ''),
    pillars: (Array.isArray(strategy.pillars) ? strategy.pillars : []).map(String).slice(0, 6),
    hooks: (Array.isArray(strategy.hooks) ? strategy.hooks : []).map(String).slice(0, 8),
    dos: (Array.isArray(strategy.dos) ? strategy.dos : []).map(String).slice(0, 6),
    donts: (Array.isArray(strategy.donts) ? strategy.donts : []).map(String).slice(0, 6),
    hashtags: (Array.isArray(strategy.hashtags) ? strategy.hashtags : []).map(String).slice(0, 10),
  }
  await db.socialAccount.update({ where: { id: accountId }, data: { pageStrategy: JSON.stringify(clean) } })
  await logActivity(userId, accountId, 'brain', `🧠 The agent studied the page and built a content strategy (${clean.pillars.length} pillars, ${clean.hooks.length} hooks)`)
  return { strategy: clean }
}

/** TRUE trend research: live web search → AI distills what attracts people. */
export async function researchTrends(
  userId: string,
  accountId: string,
  opts: { force?: boolean } = {},
): Promise<{ trends: TrendBrain; cached: boolean }> {
  const row = await db.socialAccount.findFirst({ where: { id: accountId, userId } })
  if (!row) throw new Error('Account not found')
  const rec = toRecord(row)

  if (!opts.force && row.trendAt) {
    const ageH = (Date.now() - row.trendAt.getTime()) / 3_600_000
    const cached = safeJson<TrendBrain | null>(row.trendBrain, null)
    if (cached && ageH < STRATEGY_TTL_HOURS) return { trends: cached, cached: true }
  }

  const p = pageBrainRows(row)
  const niche = p.niche || rec.autopilotTopic || 'small business growth'
  const platform = SOCIAL_PLATFORMS[rec.platform].label
  const year = new Date().getFullYear()
  const queries = [
    `top performing ${niche} ${platform} posts ${year}`,
    `viral ${niche} content ideas what works`,
    `${niche} trending topics hashtags this month`,
  ]

  const searchBatches = await Promise.all(
    queries.map((q) => freeWebSearch(q, 6).catch(() => [] as Awaited<ReturnType<typeof freeWebSearch>>)),
  )
  const results = searchBatches.flat().slice(0, 18)
  const researched = results.length > 0
  const sourceList = results.map((r) => ({ title: (r.title || '').slice(0, 120), url: r.url }))
  const evidence = results
    .slice(0, 14)
    .map((r, i) => `${i + 1}. ${r.title} — ${r.snippet?.slice(0, 160) ?? ''}`)
    .join('\n')

  const system =
    'You are a viral-content analyst. Using ONLY the search evidence when provided (otherwise your own expertise), distill what is attracting attention in this niche right now. Output ONLY JSON: {"summary": "2-3 sentence brief", "topics": ["6 hot topics"], "hooks": ["5 scroll-stopping opening lines in the page content language"], "formats": ["3-4 content formats that work"], "hashtags": ["8 hashtags starting with #"]}. No markdown, no commentary.'
  const user = [
    `Niche: ${niche}. Platform: ${platform}.`,
    p.language ? `Content language: ${p.language} (hooks in this language).` : '',
    p.audience ? `Audience: ${p.audience}.` : '',
    researched ? `LIVE search evidence:\n${evidence}` : 'No live search results were reachable — use your knowledge of what performs well in this niche.',
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await smartChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 800, temperature: 0.5, task: 'reasoning', userId },
  )
  const parsed = safeJson<{ summary?: string; topics?: string[]; hooks?: string[]; formats?: string[]; hashtags?: string[] }>(raw, {})
  const trends: TrendBrain = {
    summary: String(parsed.summary ?? ''),
    topics: (Array.isArray(parsed.topics) ? parsed.topics : []).map(String).slice(0, 8),
    hooks: (Array.isArray(parsed.hooks) ? parsed.hooks : []).map(String).slice(0, 8),
    formats: (Array.isArray(parsed.formats) ? parsed.formats : []).map(String).slice(0, 6),
    hashtags: (Array.isArray(parsed.hashtags) ? parsed.hashtags : []).map(String).slice(0, 10),
    sources: sourceList.slice(0, 10),
    fetchedAt: new Date().toISOString(),
    researched,
  }
  await db.socialAccount.update({ where: { id: accountId }, data: { trendBrain: JSON.stringify(trends), trendAt: new Date() } })
  await logActivity(
    userId,
    accountId,
    'research',
    researched
      ? `🛰 Trend Radar scanned ${sourceList.length} live sources on ${platform} — ${trends.topics.length} hot topics, ${trends.hooks.length} proven hooks captured`
      : '🛰 Trend Radar mapped what works in this niche from the agent knowledge base (live search was unreachable)',
  )
  return { trends, cached: false }
}

/** Fresh-enough trend brain for the autopilot pipeline (auto-refresh ≥6h). */
export async function ensureFreshTrendsFor(userId: string, accountId: string): Promise<string> {
  try {
    const { trends } = await researchTrends(userId, accountId, { force: false })
    return JSON.stringify(trends)
  } catch {
    return '' // research failing must never block posting
  }
}

/* ------------------------------------------------------------------ */
/* ENGAGEMENT — the agent answers people like a warm, savvy human.     */
/* ------------------------------------------------------------------ */

export interface CommentReplyResult {
  sentiment: string
  reply: string
}

/** Drafts one human-quality reply to one comment (page-brain aware, language-matched). */
export async function draftCommentReply(userId: string, commentId: string): Promise<CommentReplyResult> {
  const comment = await db.socialComment.findFirst({ where: { id: commentId, userId } })
  if (!comment) throw new Error('Comment not found')
  const accRow = await db.socialAccount.findUnique({ where: { id: comment.accountId } })
  if (!accRow) throw new Error('Account not found')
  const rec = toRecord(accRow)
  const p = pageBrainRows(accRow)

  const system = [
    'You are the community manager of the page described below. Reply to the commenter like a warm, smart human — never like a bot.',
    'Rules: match the commenter language EXACTLY (Arabic comment → Arabic reply); mirror their energy; be specific to what they said; ask a small follow-up question when it feels natural; keep it 1-3 sentences.',
    'CRITICAL — never invent facts: prices, delivery areas, availability, dates or promises are OFF LIMITS unless they appear in the page description below. If the commenter asks for something you do not know, say warmly that you will confirm the exact details in DM — that is what a real human community manager does.',
    'If it is spam or abuse, output a polite minimal reply.',
    'Output ONLY JSON: {"sentiment": "positive|question|complaint|lead|spam|neutral", "reply": "your reply"}. No markdown, no commentary.',
  ].join(' ')

  const user = [
    `PLATFORM: ${rec.platform}`,
    pageBrainContextOf(rec),
    `COMMENTER: ${comment.author || 'a follower'}`,
    `COMMENT: "${comment.text.slice(0, 600)}"`,
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await smartChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 400, temperature: 0.85, task: 'chat', userId },
  )
  const parsed = safeJson<{ sentiment?: string; reply?: string }>(raw, {})
  const reply = String(parsed.reply ?? '').trim()
  const sentiment = String(parsed.sentiment ?? 'neutral').toLowerCase()
  if (!reply) throw new Error('The agent could not draft a reply — try again.')
  await db.socialComment.update({
    where: { id: commentId },
    data: { aiReply: reply.slice(0, 2000), sentiment, status: 'replied', repliedAt: new Date() },
  })
  return { sentiment, reply }
}

/** Autopilot for the inbox: draft replies for every pending comment. */
export async function processAutoReplies(
  userId?: string | null,
  cap = 8,
): Promise<{ processed: number; results: Array<{ account: string; replied: number; ok: boolean; message: string }> }> {
  const accounts = await db.socialAccount.findMany({
    where: { autoReply: true, status: { in: ['connected', 'pending'] }, ...(userId ? { userId } : {}) },
    take: 6,
  })
  const report = { processed: 0, results: [] as Array<{ account: string; replied: number; ok: boolean; message: string }> }

  for (const accRow of accounts) {
    const pending = await db.socialComment.findMany({
      where: { accountId: accRow.id, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: cap,
    })
    if (!pending.length) continue
    const rec = toRecord(accRow)
    let replied = 0
    for (const c of pending) {
      try {
        await draftCommentReply(accRow.userId ?? '', c.id)
        replied += 1
      } catch {
        /* one bad comment never blocks the rest */
      }
    }
    if (replied > 0) {
      report.processed += 1
      report.results.push({ account: rec.displayName || rec.platform, replied, ok: true, message: `${replied} reply(ies) drafted` })
      await logActivity(accRow.userId, rec.id, 'reply', `💬 The agent drafted ${replied} human-quality repl${replied === 1 ? 'y' : 'ies'} on ${SOCIAL_PLATFORMS[rec.platform].label}`)
    }
  }
  return report
}

/* ------------------------------------------------------------------ */
/* Verification — real identity checks per platform                    */
/* ------------------------------------------------------------------ */

export type VerifyMode = 'verified' | 'unreachable' | 'invalid'

export interface VerifyResult {
  mode: VerifyMode
  handle: string
  avatarUrl: string
  externalId: string
  message: string
}

async function graphFetch(url: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: {} }
  }
}

export async function verifyAccount(platform: SocialPlatform, token: string, externalId: string, authorUrn?: string): Promise<VerifyResult> {
  const fail: VerifyResult = { mode: 'unreachable', handle: '', avatarUrl: '', externalId: '', message: '' }

  try {
    if (platform === 'instagram') {
      if (!token || !externalId) return { ...fail, mode: 'invalid', message: 'Token and Business Account ID are both required.' }
      const r = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(externalId)}?fields=username,profile_picture_url&access_token=${encodeURIComponent(token)}`)
      if (r.status === 401 || r.status === 400 || r.body?.error) {
        const err = (r.body?.error as Record<string, unknown>)?.message
        return { ...fail, mode: r.status === 0 ? 'unreachable' : 'invalid', message: String(err ?? 'Instagram rejected these credentials.') }
      }
      if (!r.ok) return { ...fail, mode: 'unreachable', message: 'Could not reach the Instagram Graph API from this environment.' }
      const b = r.body as { username?: string; profile_picture_url?: string }
      return { mode: 'verified', handle: b.username ? `@${b.username}` : '', avatarUrl: b.profile_picture_url ?? '', externalId, message: `Connected as ${b.username ?? externalId}` }
    }

    if (platform === 'facebook') {
      if (!token || !externalId) return { ...fail, mode: 'invalid', message: 'Page token and Page ID are both required.' }
      const r = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(externalId)}?fields=id,name,picture&access_token=${encodeURIComponent(token)}`)
      if (!r.ok && r.status !== 0) {
        const err = (r.body?.error as Record<string, unknown>)?.message
        return { ...fail, mode: 'invalid', message: String(err ?? 'Facebook rejected these credentials.') }
      }
      if (!r.ok) return { ...fail, mode: 'unreachable', message: 'Could not reach the Facebook Graph API from this environment.' }
      const b = r.body as { name?: string; picture?: { data?: { url?: string } } }
      return { mode: 'verified', handle: b.name ?? '', avatarUrl: b.picture?.data?.url ?? '', externalId, message: `Page connected: ${b.name ?? externalId}` }
    }

    if (platform === 'linkedin') {
      if (!token) return { ...fail, mode: 'invalid', message: 'Access token is required.' }
      const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT),
      }).catch(() => null)
      if (!res) return { ...fail, mode: 'unreachable', message: 'Could not reach LinkedIn from this environment.' }
      if (!res.ok) return { ...fail, mode: 'invalid', message: 'LinkedIn rejected this token.' }
      const b = (await res.json().catch(() => ({}))) as { sub?: string; name?: string; picture?: string }
      const urn = authorUrn?.trim() || (b.sub ? `urn:li:person:${b.sub}` : '')
      return { mode: 'verified', handle: b.name ?? '', avatarUrl: b.picture ?? '', externalId: urn, message: `Connected as ${b.name ?? 'LinkedIn member'}` }
    }

    // x
    if (!token) return { ...fail, mode: 'invalid', message: 'Access token is required.' }
    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch(() => null)
    if (!res) return { ...fail, mode: 'unreachable', message: 'Could not reach the X API from this environment.' }
    if (!res.ok) return { ...fail, mode: 'invalid', message: 'X rejected this token.' }
    const b = (await res.json().catch(() => ({}))) as { data?: { id?: string; username?: string; name?: string } }
    return {
      mode: 'verified',
      handle: b.data?.username ? `@${b.data.username}` : '',
      avatarUrl: '',
      externalId: b.data?.id ?? '',
      message: `Connected as ${b.data?.name ?? b.data?.username ?? 'X user'}`,
    }
  } catch {
    return { ...fail, message: 'Verification request failed unexpectedly.' }
  }
}

/* ------------------------------------------------------------------ */
/* Media helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * AUDIT FIX: origin resolution now lives in one shared helper — the old local
 * default (`http://localhost:3000`) broke platform media fetches and cron
 * self-invocation on serverless (Meta/LinkedIn/X must download media from a
 * PUBLIC url; localhost is unreachable from their servers).
 */
function absoluteUrl(url: string, origin: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = origin?.replace(/\/$/, '') || appOriginFromEnv()
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}

async function fetchMediaBytes(url: string, origin: string): Promise<{ bytes: ArrayBuffer; type: string; public: boolean } | null> {
  const abs = absoluteUrl(url, origin)
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(abs)
  try {
    const res = await fetch(abs, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!res.ok) return null
    return { bytes: await res.arrayBuffer(), type: res.headers.get('content-type') || 'application/octet-stream', public: !isLocal }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Publish — the real thing (with honest simulation fallback)          */
/* ------------------------------------------------------------------ */

export interface PublishInput {
  platform: SocialPlatform
  token: string
  externalId: string
  caption: string
  mediaUrls: string[]
  mediaKind: string // image | video | carousel | text
  origin: string
}

export interface PublishResult {
  ok: boolean
  mode: 'live' | 'simulated'
  externalId: string
  permalink: string
  message: string
}

function simResult(reason: string): PublishResult {
  return {
    ok: true,
    mode: 'simulated',
    externalId: `sim_${randomBytes(5).toString('hex')}`,
    permalink: '',
    message: reason,
  }
}

function networkDown(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return /fetch failed|network|timeout|abort|econn|enotfound|etimedout|dns|socket|unreachable|eai_again/.test(msg)
}

async function igPublish(input: PublishInput): Promise<PublishResult> {
  const { token, externalId: ig, caption, mediaUrls, mediaKind, origin } = input
  if (!mediaUrls.length && mediaKind !== 'text') {
    return simResult('Simulated — Instagram requires at least one photo or video; no media was attached.')
  }
  const media = mediaUrls.slice(0, 10)
  const bytes = await Promise.all(media.map((u) => fetchMediaBytes(u, origin)))
  if (bytes.some((b) => !b)) return simResult('Simulated — a media file could not be loaded to upload.')
  const publicOk = bytes.every((b) => b?.public)
  if (!publicOk) {
    return simResult('Simulated — Instagram needs a PUBLIC media URL (served over the internet). Local/sandbox URLs only support rehearsal runs.')
  }

  try {
    const createContainer = async (params: Record<string, string>) => {
      const res = await fetch(`${GRAPH_BASE}/${ig}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, access_token: token }),
        signal: AbortSignal.timeout(30_000),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
      if (!res.ok || !body.id) throw new Error(body.error?.message || `Container creation failed (${res.status})`)
      return body.id
    }

    let creationId: string
    if (mediaKind === 'video') {
      creationId = await createContainer({ media_type: 'REELS', video_url: absoluteUrl(media[0], origin), caption })
      // Wait for the REELS container to finish processing (up to ~60s).
      for (let i = 0; i < 12; i++) {
        const st = await graphFetch(`${GRAPH_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`)
        const code = (st.body as { status_code?: string })?.status_code
        if (code === 'FINISHED') break
        if (code === 'ERROR') throw new Error('Instagram could not process the video.')
        await new Promise((r) => setTimeout(r, 5000))
      }
    } else if (mediaKind === 'carousel' && media.length > 1) {
      const children: string[] = []
      for (const u of media) {
        children.push(await createContainer({ image_url: absoluteUrl(u, origin), is_carousel_item: 'true' }))
      }
      creationId = await createContainer({ media_type: 'CAROUSEL', children: children.join(','), caption })
    } else {
      creationId = await createContainer({ image_url: absoluteUrl(media[0], origin), caption })
    }

    const pub = await fetch(`${GRAPH_BASE}/${ig}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
      signal: AbortSignal.timeout(30_000),
    })
    const pubBody = (await pub.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
    if (!pub.ok || !pubBody.id) throw new Error(pubBody.error?.message || `Publish failed (${pub.status})`)

    const meta = await graphFetch(`${GRAPH_BASE}/${pubBody.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)
    return {
      ok: true,
      mode: 'live',
      externalId: pubBody.id,
      permalink: ((meta.body as { permalink?: string })?.permalink as string) ?? '',
      message: 'Published to Instagram for real ✓',
    }
  } catch (err) {
    if (networkDown(err)) return simResult('Simulated — the Instagram Graph API was unreachable from this environment.')
    return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'Instagram publish failed.' }
  }
}

async function linkedinPublish(input: PublishInput): Promise<PublishResult> {
  const { token, externalId: author, caption, mediaUrls, mediaKind, origin } = input
  let mediaUrn: string | null = null

  if (mediaUrls.length && mediaKind !== 'text') {
    const b = await fetchMediaBytes(mediaUrls[0], origin)
    if (!b) return simResult('Simulated — the image could not be loaded for upload.')
    if (!b.public) {
      // LinkedIn upload is a direct binary PUT, so local bytes still work —
      // only the media URL matters for IG. Continue for real.
    }
    try {
      const reg = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: author,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      })
      const regBody = (await reg.json().catch(() => ({}))) as {
        value?: { asset?: string; uploadMechanism?: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: { uploadUrl?: string } } }
        error?: unknown
      }
      const uploadUrl = regBody.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl
      mediaUrn = regBody.value?.asset ?? null
      if (!reg.ok || !uploadUrl || !mediaUrn) throw new Error('LinkedIn image upload registration failed.')
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: b.bytes, signal: AbortSignal.timeout(60_000) })
      if (!put.ok) throw new Error(`LinkedIn image upload failed (${put.status})`)
    } catch (err) {
      if (networkDown(err)) return simResult('Simulated — LinkedIn was unreachable from this environment.')
      return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'LinkedIn publish failed.' }
    }
  }

  try {
    const post = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: caption },
            shareMediaCategory: mediaUrn ? 'IMAGE' : 'NONE',
            ...(mediaUrn
              ? { media: [{ status: 'READY', originalUrl: 'urn:li:digitalmediaAsset:x', media: mediaUrn, title: { text: '' } }] }
              : {}),
          },
        },
        visibility: author.includes('urn:li:organization')
          ? { 'com.linkedin.ugc.OrganizationNetworkVisibility': 'PUBLIC' }
          : { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await post.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!post.ok || !body.id) throw new Error(body.message || `LinkedIn post failed (${post.status})`)
    return { ok: true, mode: 'live', externalId: body.id, permalink: `https://www.linkedin.com/feed/update/${body.id}`, message: 'Posted to LinkedIn for real ✓' }
  } catch (err) {
    if (networkDown(err)) return simResult('Simulated — LinkedIn was unreachable from this environment.')
    return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'LinkedIn publish failed.' }
  }
}

async function xPublish(input: PublishInput): Promise<PublishResult> {
  const { token, caption, mediaUrls, mediaKind, origin } = input
  const media_ids: string[] = []
  let simulatedNote = ''

  if (mediaUrls.length && mediaKind !== 'text') {
    const b = await fetchMediaBytes(mediaUrls[0], origin)
    if (!b) return simResult('Simulated — the media could not be loaded for upload.')
    try {
      const form = new FormData()
      form.append('media_data', Buffer.from(b.bytes).toString('base64'))
      const up = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      })
      const upBody = (await up.json().catch(() => ({}))) as { media_id_string?: string; errors?: { message?: string }[] }
      if (!up.ok || !upBody.media_id_string) throw new Error(upBody.errors?.[0]?.message || `X media upload failed (${up.status})`)
      media_ids.push(upBody.media_id_string)
    } catch (err) {
      if (networkDown(err)) return simResult('Simulated — the X API was unreachable from this environment.')
      if (/forbidden|unauthorized|401|403/i.test(err instanceof Error ? err.message : '')) {
        simulatedNote = ` (media skipped: ${err instanceof Error ? err.message : 'media scope missing'})`
      } else {
        return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'X publish failed.' }
      }
    }
  }

  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: caption.slice(0, 280), ...(media_ids.length ? { media: { media_ids } } : {}) }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; errors?: { message?: string }[]; title?: string }
    if (!res.ok || !body.data?.id) throw new Error(body.errors?.[0]?.message || body.title || `X tweet failed (${res.status})`)
    return { ok: true, mode: 'live', externalId: body.data.id, permalink: `https://x.com/i/web/status/${body.data.id}`, message: `Tweeted for real ✓${simulatedNote}` }
  } catch (err) {
    if (networkDown(err)) return simResult('Simulated — the X API was unreachable from this environment.')
    return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'X publish failed.' }
  }
}

async function facebookPublish(input: PublishInput): Promise<PublishResult> {
  const { token, externalId: pageId, caption, mediaUrls, mediaKind, origin } = input
  try {
    if (mediaKind === 'video' && mediaUrls.length) {
      const b = await fetchMediaBytes(mediaUrls[0], origin)
      if (!b) return simResult('Simulated — the video could not be loaded for upload.')
      if (!b.public) return simResult('Simulated — Facebook needs a PUBLIC video URL for live posting.')
      const res = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: absoluteUrl(mediaUrls[0], origin), description: caption, access_token: token }),
        signal: AbortSignal.timeout(60_000),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
      if (!res.ok || !body.id) throw new Error(body.error?.message || `Facebook video post failed (${res.status})`)
      return { ok: true, mode: 'live', externalId: body.id, permalink: `https://facebook.com/${body.id}`, message: 'Video posted to the Page for real ✓' }
    }
    if (mediaUrls.length && mediaKind !== 'text') {
      const b = await fetchMediaBytes(mediaUrls[0], origin)
      if (!b) return simResult('Simulated — the photo could not be loaded for upload.')
      if (!b.public) return simResult('Simulated — Facebook needs a PUBLIC photo URL for live posting.')
      const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: absoluteUrl(mediaUrls[0], origin), caption, access_token: token }),
        signal: AbortSignal.timeout(30_000),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: { message?: string } }
      if (!res.ok || !body.id) throw new Error(body.error?.message || `Facebook photo post failed (${res.status})`)
      return { ok: true, mode: 'live', externalId: body.post_id ?? body.id ?? '', permalink: body.post_id ? `https://facebook.com/${body.post_id}` : '', message: 'Photo posted to the Page for real ✓' }
    }
    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: caption, access_token: token }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
    if (!res.ok || !body.id) throw new Error(body.error?.message || `Facebook post failed (${res.status})`)
    return { ok: true, mode: 'live', externalId: body.id, permalink: `https://facebook.com/${body.id}`, message: 'Posted to the Page feed for real ✓' }
  } catch (err) {
    if (networkDown(err)) return simResult('Simulated — the Facebook Graph API was unreachable from this environment.')
    return { ok: false, mode: 'live', externalId: '', permalink: '', message: err instanceof Error ? err.message : 'Facebook publish failed.' }
  }
}

export async function publishToPlatform(input: PublishInput): Promise<PublishResult> {
  if (!input.token) {
    return simResult('Simulated — this account was saved without a live token, so the run rehearsed end-to-end without going on-air.')
  }
  switch (input.platform) {
    case 'instagram':
      return igPublish(input)
    case 'linkedin':
      return linkedinPublish(input)
    case 'x':
      return xPublish(input)
    case 'facebook':
      return facebookPublish(input)
  }
}

/* ------------------------------------------------------------------ */
/* Content generation — the agent writes copy + shoots the visual      */
/* ------------------------------------------------------------------ */

const IMAGES_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join('/tmp', 'generated-images')
    : path.join(process.cwd(), 'generated-images')

/** Persist generated bytes exactly like the /api/image pipeline. */
async function persistImage(buffer: Buffer, prompt: string, userId: string | null): Promise<string> {
  const filename = randomUUID()
  try {
    await mkdir(IMAGES_DIR, { recursive: true })
    await writeFile(path.join(IMAGES_DIR, `${filename}.png`), buffer)
  } catch (err) {
    // Audit fix: a silently-failed write produced a URL that 404'd later —
    // the platform would reject the post with a confusing media error.
    console.error('[social] persistImage write failed (media will 404):', err instanceof Error ? err.message : err)
  }
  try {
    await db.generatedImage.create({
      data: { prompt, size: '1344x768', provider: 'social-agent', url: `/api/image/file/${filename}`, data: buffer.toString('base64'), userId },
    })
  } catch {
    /* metadata-only fallback */
  }
  return `/api/image/file/${filename}`
}

export interface PostDraft {
  caption: string
  imageUrl: string
  hashtags: string[]
}

export async function generatePostDraft(opts: {
  userId: string
  platform: SocialPlatform
  topic: string
  tone?: string
  withImage?: boolean
  extraContext?: string
  // PAGE BRAIN + TREND RADAR — deep page knowledge + what works now
  pageContext?: string
  trendContext?: string
}): Promise<PostDraft> {
  const { userId, platform, topic, tone, withImage = true, extraContext, pageContext, trendContext } = opts
  const cap =
    platform === 'x' ? 'at most 260 characters' : platform === 'instagram' ? 'at most 800 characters' : 'at most 1200 characters'

  const system = [
    'You are an elite social media manager who deeply knows the page you write for.',
    'Write scroll-stopping, authentic posts that attract real engagement — model your opening on hooks proven to work in this niche, adapted to this page voice.',
    'Output ONLY the caption text — no preamble, no quotes around it, no markdown headers.',
  ].join(' ')
  const user = [
    `Write a ${platform} post about: ${topic}.`,
    tone ? `Voice/tone: ${tone}.` : '',
    pageContext ? `PAGE KNOWLEDGE (respect it exactly):\n${pageContext}` : '',
    trendContext ? `WHAT IS WORKING NOW (live research — model your hook on these, never copy verbatim):\n${trendContext}` : '',
    `Length: ${cap}. ${platform === 'x' ? 'No hashtags needed unless essential.' : 'End with 3-5 relevant hashtags.'}`,
    extraContext ? `Extra context: ${extraContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const reply = await smartChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 700, temperature: 0.8, task: 'chat', userId },
  )
  const caption = reply.trim().replace(/^["']|["']$/g, '').slice(0, SOCIAL_PLATFORMS[platform].limits.caption)

  let imageUrl = ''
  if (withImage) {
    const visualPrompt = await smartChat(
      [
        { role: 'system', content: 'Convert a social post brief into ONE vivid image-generation prompt (a single line, ≤ 60 words, describing subject, style, lighting, composition). Output only the prompt.' },
        { role: 'user', content: `Platform: ${platform}. Post topic: ${topic}. Caption: ${caption.slice(0, 400)}` },
      ],
      { maxTokens: 150, temperature: 0.7, task: 'chat', userId },
    )
    const prompt = visualPrompt.trim().replace(/^["']|["']$/g, '').slice(0, 900)
    let buffer: Buffer | null = null
    try {
      const { premiumImageCascade } = await import('@/lib/premium-image')
      const res = await premiumImageCascade(prompt, '1344x768')
      buffer = res.buffer
    } catch {
      buffer = null
    }
    if (!buffer) {
      try {
        const { pollinationsImage } = await import('@/lib/pollinations')
        buffer = await pollinationsImage(prompt, '1344x768')
      } catch {
        buffer = null
      }
    }
    if (buffer) imageUrl = await persistImage(buffer, prompt, userId)
  }

  const hashtags = Array.from(caption.matchAll(/#[\p{L}\p{N}_]+/gu)).map((m) => m[0]).slice(0, 8)
  return { caption, imageUrl, hashtags }
}

/* ------------------------------------------------------------------ */
/* Publishing orchestration — wraps platform call + DB bookkeeping     */
/* ------------------------------------------------------------------ */

export async function publishSocialPost(opts: {
  userId: string
  accountId: string
  caption: string
  mediaUrls?: string[]
  mediaKind?: string
  origin: string
  originKind?: 'manual' | 'autopilot' | 'agent'
  scheduledFor?: Date | null
}): Promise<{ post: Record<string, unknown>; result: PublishResult }> {
  const { userId, accountId, caption, mediaUrls = [], mediaKind = 'image', origin, originKind = 'manual', scheduledFor } = opts
  const got = await getSocialAccount(userId, accountId)
  if (!got) throw new Error('Account not found')
  const { rec, token } = got

  const post = await db.socialPost.create({
    data: {
      userId,
      accountId: rec.id,
      platform: rec.platform,
      caption: caption.slice(0, 6000),
      mediaUrls: JSON.stringify(mediaUrls),
      mediaKind,
      status: scheduledFor ? 'scheduled' : 'publishing',
      scheduledFor: scheduledFor ?? null,
      origin: originKind,
    },
  })

  if (scheduledFor) {
    await logActivity(userId, rec.id, 'schedule', `Scheduled an ${SOCIAL_PLATFORMS[rec.platform].label} post for ${scheduledFor.toISOString()}`)
    return { post: JSON.parse(JSON.stringify(post)), result: { ok: true, mode: 'simulated', externalId: '', permalink: '', message: 'Scheduled' } }
  }

  const result = await publishToPlatform({
    platform: rec.platform,
    token,
    externalId: rec.externalId,
    caption,
    mediaUrls,
    mediaKind,
    origin,
  })

  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: result.ok ? (result.mode === 'live' ? 'published' : 'simulated') : 'failed',
      publishedAt: result.ok ? new Date() : null,
      // The result string carries the message AND the permalink when live.
      result: result.permalink ? `${result.message} ${result.permalink}` : result.message,
      externalId: result.externalId,
      error: result.ok ? '' : result.message,
    },
  })

  await logActivity(
    userId,
    rec.id,
    result.ok ? (result.mode === 'live' ? 'publish' : 'publish_simulated') : 'fail',
    result.ok
      ? `${SOCIAL_PLATFORMS[rec.platform].label}: ${result.message}`
      : `${SOCIAL_PLATFORMS[rec.platform].label} publish failed: ${result.message}`,
  )

  const fresh = await db.socialPost.findUnique({ where: { id: post.id } })
  return { post: JSON.parse(JSON.stringify(fresh ?? post)), result }
}

/* ------------------------------------------------------------------ */
/* Autopilot — due accounts get agent-made posts, hands-free           */
/* ------------------------------------------------------------------ */

export interface AutopilotTickReport {
  ranAt: string
  processed: number
  results: Array<{ account: string; platform: string; ok: boolean; mode: string; message: string }>
}

export async function runAutopilotTick(
  userId?: string | null,
  origin = appOriginFromEnv(),
  cap = 3,
  force = false,
): Promise<AutopilotTickReport> {
  const now = new Date()
  const accounts = await db.socialAccount.findMany({
    where: {
      autopilot: true,
      // 'connected' = live-verified · 'pending' = rehearsal mode (publishes
      // run simulated, which is exactly what a rehearsal account is for).
      status: { in: ['connected', 'pending'] },
      ...(userId ? { userId } : {}),
      // force=true (the explicit "Run autopilot now" button) ignores the
      // 5-minute anti-spam guard so the user always sees the agent act NOW.
      // The atomic claim below still prevents concurrent duplicate posts.
      ...(force
        ? {}
        : { OR: [{ lastAutoPostAt: null }, { lastAutoPostAt: { lte: new Date(now.getTime() - 5 * 60_000) } }] }),
    },
    take: 12,
  })

  const report: AutopilotTickReport = { ranAt: now.toISOString(), processed: 0, results: [] }

  for (const row of accounts) {
    const rec = toRecord(row)
    if (!force && row.lastAutoPostAt) {
      // Normal heartbeat: respect the cadence. "Run now" (force) bypasses it.
      if (now.getTime() - row.lastAutoPostAt.getTime() < Math.max(5, rec.autopilotCadenceMinutes) * 60_000) {
        continue
      }
    }
    if (report.processed >= cap) break

    // ATOMIC CLAIM — the browser heartbeat, the "Run now" button and the
    // server-side clock can all fire ticks concurrently. Only the tick
    // whose update matches the lastAutoPostAt it READ wins the right to
    // post; every other concurrent tick gets count=0 and skips. Without
    // this the same account gets three duplicate posts in a minute.
    const claimed = await db.socialAccount.updateMany({
      where: {
        id: rec.id,
        OR: [{ lastAutoPostAt: null }, { lastAutoPostAt: row.lastAutoPostAt ?? undefined }],
      },
      data: { lastAutoPostAt: new Date() },
    })
    if (claimed.count === 0) continue

    report.processed += 1
    try {
      let token = ''
      try {
        token = decryptSecret(row.accessTokenEnc)
      } catch {
        /* simulation mode */
      }
      // RESEARCH FIRST — the agent scans what is working in this niche
      // before writing a single word (auto-refreshes at most every 6h,
      // and a failed scan never blocks posting).
      const recFresh = toRecord(row)
      const trendRaw = await ensureFreshTrendsFor(row.userId ?? '', rec.id)
      const pageCtx = pageBrainContextOf(recFresh)
      const trendCtx = trendContextOf({ ...recFresh, trendBrain: trendRaw || recFresh.trendBrain })
      const brain = pageBrainRows(row)
      const draft = await generatePostDraft({
        userId: row.userId ?? '',
        platform: rec.platform,
        topic: rec.autopilotTopic || brain.niche || 'our latest updates, behind-the-scenes and tips',
        tone: brain.tone || 'on-brand, warm and confident',
        withImage: true,
        pageContext: pageCtx,
        trendContext: trendCtx,
      })
      const result = await publishToPlatform({
        platform: rec.platform,
        token,
        externalId: rec.externalId,
        caption: draft.caption,
        mediaUrls: draft.imageUrl ? [draft.imageUrl] : [],
        mediaKind: draft.imageUrl ? 'image' : 'text',
        origin,
      })
      await db.socialPost.create({
        data: {
          userId: row.userId,
          accountId: rec.id,
          platform: rec.platform,
          caption: draft.caption,
          mediaUrls: JSON.stringify(draft.imageUrl ? [draft.imageUrl] : []),
          mediaKind: draft.imageUrl ? 'image' : 'text',
          status: result.ok ? (result.mode === 'live' ? 'published' : 'simulated') : 'failed',
          publishedAt: result.ok ? new Date() : null,
          result: result.message,
          externalId: result.externalId,
          error: result.ok ? '' : result.message,
          origin: 'autopilot',
        },
      })
      await logActivity(
        row.userId,
        rec.id,
        result.ok ? 'autopilot' : 'fail',
        result.ok
          ? `🤖 Autopilot posted to ${SOCIAL_PLATFORMS[rec.platform].label} — ${result.message}`
          : `Autopilot publish failed: ${result.message}`,
      )
      if (!result.ok) {
        // Transient failure — retry in ~15 minutes instead of waiting a
        // whole cadence, but never hammer the platform every minute.
        await db.socialAccount
          .update({
            where: { id: rec.id },
            data: { lastAutoPostAt: new Date(Date.now() - rec.autopilotCadenceMinutes * 60_000 + 15 * 60_000) },
          })
          .catch(() => {})
      }
      report.results.push({ account: rec.displayName || rec.platform, platform: rec.platform, ok: result.ok, mode: result.mode, message: result.message })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'autopilot error'
      await logActivity(row.userId, rec.id, 'fail', `Autopilot error: ${msg}`)
      await db.socialAccount
        .update({
          where: { id: rec.id },
          data: { lastAutoPostAt: new Date(Date.now() - rec.autopilotCadenceMinutes * 60_000 + 15 * 60_000) },
        })
        .catch(() => {})
      report.results.push({ account: rec.displayName || rec.platform, platform: rec.platform, ok: false, mode: 'error', message: msg })
    }
  }

  return report
}

/* ------------------------------------------------------------------ */
/* Scheduled posts — a post the user (or an agent) queued for a later  */
/* time. Before this tick existed the rows were saved and forgotten;   */
/* now the automation clock publishes them the moment they are due —   */
/* no human and no open browser tab required.                          */
/* ------------------------------------------------------------------ */

export interface ScheduledRunReport {
  ranAt: string
  published: number
  results: Array<{ post: string; platform: string; ok: boolean; mode: string; message: string }>
}

export async function publishDueScheduledPosts(origin = appOriginFromEnv(), cap = 5): Promise<ScheduledRunReport> {
  const now = new Date()
  const report: ScheduledRunReport = { ranAt: now.toISOString(), published: 0, results: [] }

  const due = await db.socialPost.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: cap,
  })

  for (const row of due) {
    try {
      const accRow = await db.socialAccount.findUnique({ where: { id: row.accountId } })
      if (!accRow) {
        await db.socialPost.update({
          where: { id: row.id },
          data: { status: 'failed', error: 'The connected account was deleted before this post could go out.' },
        })
        report.results.push({ post: row.id, platform: row.platform, ok: false, mode: 'error', message: 'Account deleted' })
        continue
      }
      const rec = toRecord(accRow)
      let token = ''
      try {
        token = decryptSecret(accRow.accessTokenEnc)
      } catch {
        /* simulation mode */
      }

      // ATOMIC CLAIM — flip the status first with a guarded update so two
      // concurrent ticks can never publish the same scheduled post twice.
      const claimed = await db.socialPost.updateMany({
        where: { id: row.id, status: 'scheduled' },
        data: { status: 'publishing' },
      })
      if (claimed.count === 0) continue

      const mediaUrls = (() => {
        try {
          return JSON.parse(row.mediaUrls || '[]') as string[]
        } catch {
          return []
        }
      })()

      const result = await publishToPlatform({
        platform: rec.platform,
        token,
        externalId: rec.externalId,
        caption: row.caption,
        mediaUrls,
        mediaKind: row.mediaKind,
        origin,
      })

      await db.socialPost.update({
        where: { id: row.id },
        data: {
          status: result.ok ? (result.mode === 'live' ? 'published' : 'simulated') : 'failed',
          publishedAt: result.ok ? new Date() : null,
          result: result.permalink ? `${result.message} ${result.permalink}` : result.message,
          externalId: result.externalId,
          error: result.ok ? '' : result.message,
        },
      })
      await logActivity(
        row.userId,
        rec.id,
        result.ok ? 'publish' : 'fail',
        result.ok
          ? `⏰ Scheduled post went out on ${SOCIAL_PLATFORMS[rec.platform].label} — ${result.message}`
          : `Scheduled publish failed: ${result.message}`,
      )
      report.published += 1
      report.results.push({ post: row.id, platform: rec.platform, ok: result.ok, mode: result.mode, message: result.message })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'scheduled publish error'
      await db.socialPost.update({ where: { id: row.id }, data: { status: 'failed', error: msg } }).catch(() => {})
      report.results.push({ post: row.id, platform: row.platform, ok: false, mode: 'error', message: msg })
    }
  }

  return report
}

/* ------------------------------------------------------------------ */
/* The automation clock — one entry point the scheduler calls every    */
/* minute: 1) agent-made autopilot posts for due accounts, 2) user/    */
/* agent scheduled posts whose moment has arrived. Hands-free.         */
/* ------------------------------------------------------------------ */

export async function automationTick(origin = appOriginFromEnv()): Promise<{
  autopilot: AutopilotTickReport
  scheduled: ScheduledRunReport
  engagement: { processed: number; results: Array<{ account: string; replied: number; ok: boolean; message: string }> }
}> {
  const [autopilot, scheduled, engagement] = await Promise.all([
    runAutopilotTick(null, origin, 3).catch(() => ({ ranAt: '', processed: 0, results: [] })),
    publishDueScheduledPosts(origin, 5).catch(() => ({ ranAt: '', published: 0, results: [] })),
    // The inbox gets the same hands-free treatment: every account with
    // auto-reply on gets human-quality answers drafted automatically.
    processAutoReplies(null, 6).catch(() => ({ processed: 0, results: [] })),
  ])
  return { autopilot, scheduled, engagement }
}
