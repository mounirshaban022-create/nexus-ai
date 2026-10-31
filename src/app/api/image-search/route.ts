import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { getZAI, zaiConfigured } from '@/lib/zai'
import https from 'node:https'

export const dynamic = 'force-dynamic'

/**
 * Short-lived in-memory result cache. Free keyless image engines
 * (Openverse ~5 req/hr anonymous, Wikimedia per-IP) throttle aggressively,
 * so repeat queries are served from cache instead of burning quota.
 */
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const searchCache = new Map<string, { at: number; payload: unknown }>()

function cacheGet(key: string): unknown | undefined {
  const hit = searchCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key)
    return undefined
  }
  return hit.payload
}

function cacheSet(key: string, payload: unknown): void {
  if (searchCache.size > 200) {
    const oldest = searchCache.keys().next().value
    if (oldest) searchCache.delete(oldest)
  }
  searchCache.set(key, { at: Date.now(), payload })
}

/**
 * STOCK IMAGE SEARCH — web-wide photo search with source attribution.
 *
 * Engine 1 (preferred): Z.ai images.search — free, ranked, fast (sandbox).
 * Engine 2 (fallback):  Openverse (openverse.org) — the open web's CC-licensed
 *   photo index, keyless and dependable when the Z.ai gateway is unavailable
 *   or erroring. Both engines return identical sanitized shapes.
 *
 * GET /api/image-search?q=<2..120 chars>&count=<1..24>
 * Returns URL-deduped results with source attribution so the UI can always
 * credit (and link back to) the site each photo came from.
 */

interface StockImageResult {
  original_url: string
  caption: string | null
  source: string | null
  width: number | null
  height: number | null
}

/** SDK dims arrive as strings ("1200") — coerce safely, drop junk. */
function parseDimension(v: string | number | undefined | null): number | null {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function sanitizeResults(
  raw: Array<{
    original_url?: string
    caption?: string
    source?: string | null
    original_width?: string
    original_height?: string
  }>
): StockImageResult[] {
  const seen = new Set<string>()
  const results: StockImageResult[] = []
  for (const r of raw) {
    const url = (r?.original_url ?? '').trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    results.push({
      original_url: url,
      caption: typeof r.caption === 'string' && r.caption.trim() ? r.caption.trim() : null,
      source: typeof r.source === 'string' && r.source.trim() ? r.source.trim() : null,
      width: parseDimension(r.original_width),
      height: parseDimension(r.original_height),
    })
  }
  return results
}

/**
 * IPv4-forced HTTPS GET via node:https.
 *
 * WHY not plain fetch: api.openverse.org is dual-stack but the sandbox's
 * IPv6 egress is blackholed, and Next.js's patched undici disables Happy
 * Eyeballs (autoSelectFamily) — so fetch() picks the AAAA record and hangs
 * until timeout. node:https lets us pass `family: 4` deterministically.
 */
function httpsGetJsonIPv4(target: URL, timeoutMs = 12_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      target,
      {
        family: 4,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NEXUS-AI-PhotoStudio/1.0 (image search)',
        },
        timeout: timeoutMs,
      } as https.RequestOptions,
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8')
            resolve(JSON.parse(body) as unknown)
          } catch (e) {
            reject(new Error(`Openverse returned invalid JSON (status ${res.statusCode})`))
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error(`Openverse request timed out after ${timeoutMs}ms`))
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Wikimedia Commons fallback — keyless open image index (IPv4-reliable).
 * Search bitmap files, take scaled thumbs, attribute via description URL.
 */
async function commonsSearch(q: string, count: number): Promise<StockImageResult[]> {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.searchParams.set('action', 'query')
  api.searchParams.set('format', 'json')
  api.searchParams.set('generator', 'search')
  api.searchParams.set('gsrsearch', `filetype:bitmap ${q}`)
  api.searchParams.set('gsrnamespace', '6')
  api.searchParams.set('gsrlimit', String(Math.min(24, count)))
  api.searchParams.set('prop', 'imageinfo')
  api.searchParams.set('iiprop', 'url|size')
  api.searchParams.set('iiurlwidth', '900')

  const res = await fetch(api, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NEXUS-AI-PhotoStudio/1.0 (stock image search; contact: app user)',
    },
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Commons ${res.status}`)
  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string
          imageinfo?: Array<{
            url?: string
            thumburl?: string
            descriptionurl?: string
            thumbwidth?: number
            thumbheight?: number
            width?: number
            height?: number
          }>
        }
      >
    }
  }
  const pages = Object.values(json.query?.pages ?? {})
  return sanitizeResults(
    pages.map((p) => {
      const info = p.imageinfo?.[0]
      return {
        original_url: info?.thumburl ?? info?.url,
        caption: p.title?.replace(/^File:/, '').replace(/\.(jpe?g|png|gif|webp|tiff?)$/i, ''),
        source: info?.descriptionurl ?? 'https://commons.wikimedia.org',
        original_width: String(info?.thumbwidth ?? info?.width ?? ''),
        original_height: String(info?.thumbheight ?? info?.height ?? ''),
      }
    })
  )
}

/** Openverse fallback — keyless CC-licensed image index (api.openverse.org). */
async function openverseSearch(q: string, count: number): Promise<StockImageResult[]> {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', q)
  url.searchParams.set('page_size', String(Math.min(20, count)))
  // NOTE: no license_type filter — that param triggers a slow server-side
  // query on Openverse (30s+ timeouts). Openverse results are openly
  // licensed by default anyway.
  const json = (await httpsGetJsonIPv4(url)) as {
    results?: Array<{
      url?: string
      title?: string
      source?: string
      width?: number
      height?: number
      foreign_landing_url?: string
    }>
  }
  return sanitizeResults(
    (json.results ?? []).map((r) => ({
      original_url: r.url,
      caption: r.title,
      source: r.foreign_landing_url ?? (r.source ? `https://openverse.org` : null),
      original_width: r.width != null ? String(r.width) : undefined,
      original_height: r.height != null ? String(r.height) : undefined,
    }))
  )
}

export async function GET(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): same account gate as photo-edit.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  try {
    // Searches are cheap relative to AI edits — lighter throttle.
    const limit = rateLimit(`image-search:${clientKey(req)}`, 30, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many searches. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2 || q.length > 120) {
      return NextResponse.json(
        { error: 'Query must be 2–120 characters.' },
        { status: 400 }
      )
    }
    const countRaw = parseInt(req.nextUrl.searchParams.get('count') ?? '12', 10)
    const count = Number.isFinite(countRaw) ? Math.min(24, Math.max(1, countRaw)) : 12

    // Serve repeat queries from cache (engine throttles are per-IP).
    const cacheKey = `${q.toLowerCase()}::${count}`
    const cached = cacheGet(cacheKey)
    if (cached !== undefined) {
      return NextResponse.json(cached as Record<string, unknown>)
    }

    // ── Engine 1: Z.ai gateway (when present — sandbox) ──
    if (await zaiConfigured()) {
      try {
        const zai = await getZAI()
        const raw = await zai.images.search.create({ query: q, count, rank: true })
        const results = sanitizeResults(raw?.results ?? [])
        if (results.length > 0) {
          const payload = { query: q, results }
          cacheSet(cacheKey, payload)
          return NextResponse.json(payload)
        }
        // Empty-but-OK response → fall through to Openverse rather than
        // showing the user a dead end.
        console.warn('[api/image-search] Z.ai returned 0 results — falling back to Openverse')
      } catch (sdkErr) {
        console.warn(
          '[api/image-search] Z.ai engine failed, falling back to Openverse:',
          sdkErr instanceof Error ? sdkErr.message : sdkErr
        )
      }
    }

    // ── Engine 2: Wikimedia Commons fallback (works everywhere, no key) ──
    try {
      const results = await commonsSearch(q, count)
      if (results.length > 0) {
        const payload = { query: q, results }
        cacheSet(cacheKey, payload)
        return NextResponse.json(payload)
      }
    } catch (wcErr) {
      console.warn(
        '[api/image-search] Commons fallback failed:',
        wcErr instanceof Error ? wcErr.message : wcErr
      )
    }

    // ── Engine 3: Openverse (last resort — IPv4-forced) ──
    try {
      const results = await openverseSearch(q, count)
      if (results.length > 0) {
        const payload = { query: q, results }
        cacheSet(cacheKey, payload)
        return NextResponse.json(payload)
      }
      const empty = { query: q, results: [] }
      cacheSet(cacheKey, empty)
      return NextResponse.json(empty)
    } catch (ovErr) {
      console.error('[api/image-search] Openverse fallback failed:', ovErr instanceof Error ? ovErr.message : ovErr)
      return NextResponse.json(
        { error: 'Image search engines are rate-limited right now — please try again in a few minutes.' },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error('[api/image-search] GET error:', error)
    return NextResponse.json({ error: 'Image search failed. Please try again.' }, { status: 500 })
  }
}
