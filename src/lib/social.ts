import { randomUUID, randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/email'
import { smartChat } from '@/lib/smart-chat'

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

function absoluteUrl(url: string, origin: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = origin?.replace(/\/$/, '') || 'http://localhost:3000'
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
  await mkdir(IMAGES_DIR, { recursive: true }).catch(() => {})
  await writeFile(path.join(IMAGES_DIR, `${filename}.png`), buffer).catch(() => {})
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
}): Promise<PostDraft> {
  const { userId, platform, topic, tone, withImage = true, extraContext } = opts
  const cap =
    platform === 'x' ? 'at most 260 characters' : platform === 'instagram' ? 'at most 800 characters' : 'at most 1200 characters'

  const system =
    'You are an elite social media manager. Write scroll-stopping, authentic posts. Output ONLY the caption text — no preamble, no quotes around it, no markdown headers.'
  const user = [
    `Write a ${platform} post about: ${topic}.`,
    tone ? `Voice/tone: ${tone}.` : '',
    `Length: ${cap}. ${platform === 'x' ? 'No hashtags needed unless essential.' : 'End with 3-5 relevant hashtags.'}`,
    extraContext ? `Extra context: ${extraContext}` : '',
  ]
    .filter(Boolean)
    .join(' ')

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
    await logActivity(userId, rec.id, 'schedule', `Scheduled a ${SOCIAL_PLATFORMS[rec.platform].label} post for ${scheduledFor.toISOString()}`)
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
  origin = 'http://localhost:3000',
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
      const draft = await generatePostDraft({
        userId: row.userId ?? '',
        platform: rec.platform,
        topic: rec.autopilotTopic || 'our latest updates, behind-the-scenes and tips',
        tone: 'on-brand, warm and confident',
        withImage: true,
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

export async function publishDueScheduledPosts(origin = 'http://localhost:3000', cap = 5): Promise<ScheduledRunReport> {
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

export async function automationTick(origin = 'http://localhost:3000'): Promise<{
  autopilot: AutopilotTickReport
  scheduled: ScheduledRunReport
}> {
  const [autopilot, scheduled] = await Promise.all([
    runAutopilotTick(null, origin, 3).catch(() => ({ ranAt: '', processed: 0, results: [] })),
    publishDueScheduledPosts(origin, 5).catch(() => ({ ranAt: '', published: 0, results: [] })),
  ])
  return { autopilot, scheduled }
}
