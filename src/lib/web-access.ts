/**
 * FREE WEB ACCESS LAYER — replaces the rate-limited Z.ai web_search /
 * page_reader functions with a chain of keyless, open internet sources.
 *
 * Verified live providers (no API key, no signup — inspired by the
 * keyless-API philosophy of github.com/public-apis and the
 * zero-auth entries in github.com/mnfst/awesome-free-llm-apis):
 *
 *   1. Brave Search (HTML SERP)   — full web results, scrape + parse
 *   2. DuckDuckGo (HTML endpoint) — full web results, scrape + parse
 *   3. Wikipedia REST API         — encyclopedic knowledge, JSON
 *   4. Direct URL fetch           — page reader with HTML→text extraction
 *   5. Z.ai functions             — kept as LAST-resort fallback (works
 *                                    again whenever its quota resets)
 *
 * The chain mirrors the anonymous LLM fallback chain: every provider
 * has its own rate-limit budget, so the web search keeps working even
 * when Z.ai is in a 429 storm.
 */

import { assertPublicUrl } from './safe-url'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  host_name: string
  rank: number
  date?: string
  favicon?: string
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Descriptive bot UA — Wikipedia (and some wikimedia properties)
 *  BLOCK generic browser UAs coming from server IPs but allow properly
 *  identified bots per their API etiquette policy. */
const BOT_HEADERS = {
  'User-Agent': 'NEXUS-AI/1.0 (research assistant; +https://nexus-ai.app)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Hosts known to prefer (or require) the descriptive bot UA. */
const BOT_UA_HOSTS = [/wikipedia\.org$/i, /wikimedia\.org$/i, /wiktionary\.org$/i, /wikidata\.org$/i]

function faviconFor(url: string): string {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`
  } catch {
    return ''
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
}

/* ------------------------------------------------------------------ */
/* Provider 1: Brave Search (HTML SERP scrape)                        */
/* ------------------------------------------------------------------ */

/**
 * Parses Brave's SERP HTML. Verified structure (2026-08):
 *   <div class="snippet svelte-…" data-pos="1" data-type="web">
 *     <a href="https://…">…
 *     <div class="title search-snippet-title …">TITLE</div>
 *     <div class="generic-snippet …">DESCRIPTION</div>
 */
export function parseBraveHtml(html: string, num: number): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const blockRe =
    /<div class="snippet[^"]*" data-pos="\d+" data-type="web"[^>]*>[\s\S]*?(?=<div class="snippet[^"]*" data-pos="\d+"|<\/main>|<\/body>)/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null && results.length < num) {
    const block = m[0]
    const urlMatch = /<a href="(https?:\/\/[^"]+)"/.exec(block)
    if (!urlMatch) continue
    const url = urlMatch[1]
    // Skip Brave's own chrome URLs
    if (/search\.brave\.com|brave\.com\/search/.test(url)) continue
    const titleMatch = /class="title search-snippet-title[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block)
    const descMatch = /class="generic-snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block)
    const title = titleMatch ? stripTags(titleMatch[1]) : ''
    const snippet = descMatch ? stripTags(descMatch[1]) : ''
    if (!title && !snippet) continue
    let host = ''
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    // Brave sometimes prefixes descriptions with a relative date
    let date: string | undefined
    const dateMatch = /^(\d+ (?:second|minute|hour|day|week|month|year)s? ago) - /i.exec(snippet)
    if (dateMatch) date = dateMatch[1]
    results.push({
      title,
      url,
      snippet,
      host_name: host,
      rank: results.length + 1,
      date,
      favicon: faviconFor(url),
    })
  }
  return results
}

export async function braveSearch(query: string, num = 8): Promise<WebSearchResult[]> {
  const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Brave responded ${res.status}`)
  const html = await res.text()
  const results = parseBraveHtml(html, num)
  if (results.length === 0) throw new Error('Brave returned no parseable results')
  return results
}

/* ------------------------------------------------------------------ */
/* Provider 2: DuckDuckGo (HTML endpoint scrape)                      */
/* ------------------------------------------------------------------ */

/** Parses DuckDuckGo's html endpoint:
 *   <a rel="nofollow" class="result__a" href="URL">TITLE</a>
 *   <a class="result__snippet" …>SNIPPET</a> */
export function parseDdgHtml(html: string, num: number): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && results.length < num) {
    let url = m[1]
    // DDG wraps some URLs in a redirect: //duckduckgo.com/l/?uddg=<encoded>
    const uddg = /[?&]uddg=([^&]+)/.exec(url)
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1])
      } catch {
        continue
      }
    }
    if (!/^https?:\/\//.test(url)) continue
    const title = stripTags(m[2])
    if (!title) continue
    // Snippet follows the link — find the next result__snippet after this index
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(
      html.slice(m.index, m.index + 3000)
    )
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : ''
    let host = ''
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    results.push({
      title,
      url,
      snippet,
      host_name: host,
      rank: results.length + 1,
      favicon: faviconFor(url),
    })
  }
  return results
}

export async function duckDuckGoSearch(query: string, num = 8): Promise<WebSearchResult[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: query, b: '' }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`DuckDuckGo responded ${res.status}`)
  const html = await res.text()
  // DDG serves an anomaly-challenge page (HTTP 202 + no results) to some IPs
  if (html.includes('anomaly') || html.includes('challenge')) {
    throw new Error('DuckDuckGo served a challenge page')
  }
  const results = parseDdgHtml(html, num)
  if (results.length === 0) throw new Error('DuckDuckGo returned no parseable results')
  return results
}

/* ------------------------------------------------------------------ */
/* Provider 3: Wikipedia REST API (encyclopedic knowledge)            */
/* ------------------------------------------------------------------ */

export async function wikipediaSearch(query: string, num = 6): Promise<WebSearchResult[]> {
  // Full-text search — no key, CORS-enabled, generous limits.
  // Uses the descriptive bot UA (wikimedia blocks browser UAs from servers).
  const data = (await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=${num}&format=json&origin=*`,
    { headers: BOT_HEADERS, signal: AbortSignal.timeout(12_000) }
  ).then((r) => r.json())) as {
    query?: { search?: Array<{ title: string; snippet: string; timestamp: string }> }
  }
  const hits = data.query?.search ?? []
  if (hits.length === 0) throw new Error('No Wikipedia results')
  return hits.map((h, i) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s/g, '_'))}`,
    // API returns snippet with <span class="searchmatch"> highlights
    snippet: stripTags(h.snippet),
    host_name: 'en.wikipedia.org',
    rank: i + 1,
    date: h.timestamp?.slice(0, 10),
    favicon: faviconFor('https://en.wikipedia.org'),
  }))
}

/* ------------------------------------------------------------------ */
/* Provider 4: direct page reader (fetch + HTML→text)                 */
/* ------------------------------------------------------------------ */

export interface PageContent {
  title: string
  url: string
  html: string
  text: string
  publishedTime?: string
}

export function htmlToReadableText(html: string): string {
  // Prefer the MAIN CONTENT region when present — avoids nav/header/footer
  // chrome ("Jump to content / Search / Log in…") polluting the extract.
  // Order: Wikipedia content → <article> → <main> → #content → whole doc.
  const regions = [
    /<div[^>]+id="mw-content-text"[^>]*>[\s\S]*?<div[^>]+id="catlinks"/i, // wikipedia body (stop at category links)
    /<article[^>]*>[\s\S]*?<\/article>/i,
    /<main[^>]*>[\s\S]*?<\/main>/i,
    /<div[^>]+id="content"[^>]*>[\s\S]*?(?:<\/body>|$)/i,
  ]
  let body = html
  for (const re of regions) {
    const m = re.exec(html)
    if (m && m[0].length > 500) {
      body = m[0]
      break
    }
  }
  return body
    // Parsoid (Wikipedia) embeds template JSON in data-mw='…' attributes.
    // Those attributes contain '>' chars that break naive tag-stripping —
    // remove them FIRST so the JSON never leaks into the text.
    .replace(/\s(?:data-mw|data-parsoid|about|typeof)=('[^']*'|"[^"]*")/gi, '')
    // Hidden / non-print chrome (shortdescription, coords, etc.)
    .replace(/<(div|span|table)[^>]*(?:display:\s*none|class="[^"]*(?:noprint|nomobile|noexcerpt|searchaux|shortdescription|mw-empty-elt))[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|nav|footer|aside|form|table)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Fetches any public URL directly and extracts readable content.
 *  UA negotiation: wikimedia hosts get the descriptive bot UA (they block
 *  browser UAs from server IPs); everything else gets a browser UA first,
 *  with a bot-UA retry if blocked (403/429). */
export async function readPageDirect(url: string): Promise<PageContent> {
  const parsed = assertPublicUrl(url) // SSRF guard
  const useBotUa = BOT_UA_HOSTS.some((re) => re.test(parsed.hostname))
  const headerSets = useBotUa
    ? [BOT_HEADERS, BROWSER_HEADERS] // wikimedia: bot UA first
    : [BROWSER_HEADERS, BOT_HEADERS] // others: browser UA first, bot retry

  let res: Response | null = null
  let lastStatus = 0
  for (const headers of headerSets) {
    try {
      const attempt = await fetch(parsed.toString(), {
        headers,
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      })
      if (attempt.ok) {
        res = attempt
        break
      }
      lastStatus = attempt.status
      // Only retry on blocking statuses; 404/5xx won't improve with a new UA
      if (attempt.status !== 403 && attempt.status !== 429 && attempt.status !== 401) {
        res = attempt
        break
      }
    } catch {
      // network error — try the next header set
      lastStatus = 0
    }
  }
  if (!res || !res.ok) {
    throw new Error(`Page responded ${lastStatus || 'unreachable'}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('html') && !contentType.includes('text')) {
    throw new Error('Not an HTML page')
  }
  const html = await res.text()
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const timeMatch =
    /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i.exec(html) ||
    /<meta[^>]+name="date"[^>]+content="([^"]+)"/i.exec(html)
  const text = htmlToReadableText(html)
  if (text.length < 40) throw new Error('Page had no readable text (likely JS-rendered)')
  return {
    title: titleMatch ? decodeEntities(titleMatch[1]) : parsed.hostname,
    url: parsed.toString(),
    html: html.slice(0, 200_000),
    text: text.slice(0, 60_000),
    publishedTime: timeMatch?.[1],
  }
}

/* ------------------------------------------------------------------ */
/* Unified chains (search + read) with Z.ai as last resort            */
/* ------------------------------------------------------------------ */

/**
 * FREE WEB SEARCH CHAIN: Brave → DuckDuckGo → Wikipedia → Z.ai.
 * Each provider has an independent rate-limit budget. Z.ai is kept as
 * the final fallback so quality is unchanged whenever its quota is
 * available.
 */
export async function freeWebSearch(
  query: string,
  num = 8
): Promise<WebSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const errors: string[] = []

  // 1. Brave (best general coverage — verified live)
  try {
    return await braveSearch(trimmed, num)
  } catch (err) {
    errors.push(`brave: ${err instanceof Error ? err.message : err}`)
  }

  // 2. DuckDuckGo HTML (blocked on some IPs — cheap to try)
  try {
    return await duckDuckGoSearch(trimmed, num)
  } catch (err) {
    errors.push(`ddg: ${err instanceof Error ? err.message : err}`)
  }

  // 3. Wikipedia (encyclopedic only, but always up)
  try {
    return await wikipediaSearch(trimmed, num)
  } catch (err) {
    errors.push(`wikipedia: ${err instanceof Error ? err.message : err}`)
  }

  // 4. Z.ai (works when quota is available)
  try {
    const { getZAI } = await import('./zai')
    const zai = await getZAI()
    const results = (await zai.functions.invoke('web_search', {
      query: trimmed,
      num,
    })) as Array<{ url: string; name: string; snippet: string; host_name?: string; date?: string }>
    if (Array.isArray(results) && results.length > 0) {
      return results.map((r, i) => ({
        title: r.name,
        url: r.url,
        snippet: r.snippet,
        host_name: r.host_name ?? '',
        rank: i + 1,
        date: r.date,
        favicon: faviconFor(r.url),
      }))
    }
    throw new Error('empty')
  } catch (err) {
    errors.push(`zai: ${err instanceof Error ? err.message : err}`)
  }

  console.error('[web-access] all search providers failed:', errors.join(' | '))
  throw new Error('Web search is temporarily unavailable — all providers failed.')
}

/**
 * SMART PAGE READER: direct fetch first (no quota), Z.ai page_reader as
 * fallback (handles JS-heavy pages its own service can render).
 */
export async function readPageSmart(url: string): Promise<PageContent> {
  try {
    return await readPageDirect(url)
  } catch (err) {
    console.error('[web-access] direct read failed, trying Z.ai reader:', err instanceof Error ? err.message : err)
  }
  // Z.ai fallback
  const { getZAI } = await import('./zai')
  const zai = await getZAI()
  const parsed = assertPublicUrl(url)
  const result = (await zai.functions.invoke('page_reader', { url: parsed.toString() })) as {
    data?: { title?: string; url?: string; html?: string; publishedTime?: string }
  }
  const data = result?.data ?? {}
  const text = htmlToReadableText(data.html ?? '')
  if (!text) throw new Error('Could not extract content from that page.')
  return {
    title: data.title ?? parsed.hostname,
    url: data.url ?? parsed.toString(),
    html: data.html ?? '',
    text: text.slice(0, 60_000),
    publishedTime: data.publishedTime,
  }
}
