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

/** Max redirect hops readPageDirect will follow — each one re-validated
 *  through the SSRF guard so a public URL can't bounce to an internal one. */
const MAX_REDIRECT_HOPS = 3

/** Fetches any public URL directly and extracts readable content.
 *  UA negotiation: wikimedia hosts get the descriptive bot UA (they block
 *  browser UAs from server IPs); everything else gets a browser UA first,
 *  with a bot-UA retry if blocked (403/429). Redirects are followed
 *  MANUALLY — every hop goes back through assertPublicUrl, so a public
 *  page can't redirect the fetch into a private/internal address. */
export async function readPageDirect(url: string): Promise<PageContent> {
  const initial = assertPublicUrl(url) // SSRF guard
  const useBotUa = BOT_UA_HOSTS.some((re) => re.test(initial.hostname))
  const headerSets = useBotUa
    ? [BOT_HEADERS, BROWSER_HEADERS] // wikimedia: bot UA first
    : [BROWSER_HEADERS, BOT_HEADERS] // others: browser UA first, bot retry

  let res: Response | null = null
  let lastStatus = 0
  let finalUrl = initial

  for (const headers of headerSets) {
    let current = initial
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      let attempt: Response
      try {
        attempt = await fetch(current.toString(), {
          headers,
          signal: AbortSignal.timeout(20_000),
          redirect: 'manual',
        })
      } catch {
        // network error — try the next header set
        lastStatus = 0
        break
      }
      lastStatus = attempt.status

      // Redirect hop — resolve + RE-VALIDATE before following.
      if ([301, 302, 303, 307, 308].includes(attempt.status)) {
        if (hop === MAX_REDIRECT_HOPS) {
          throw new Error('Too many redirects')
        }
        const location = attempt.headers.get('location')
        let next: URL | null = null
        if (location) {
          try {
            next = new URL(location, current) // resolves relative redirects
          } catch {
            next = null
          }
        }
        if (!next) {
          res = attempt
          break
        }
        current = assertPublicUrl(next.toString()) // SSRF guard, every hop
        finalUrl = current
        void attempt.body?.cancel().catch(() => {})
        continue
      }

      if (attempt.ok) {
        res = attempt
        break
      }
      // Only retry on blocking statuses; 404/5xx won't improve with a new UA
      if (attempt.status !== 403 && attempt.status !== 429 && attempt.status !== 401) {
        res = attempt
        break
      }
      // 403/429/401 → break to the next header set
      break
    }
    if (res) break
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
    title: titleMatch ? decodeEntities(titleMatch[1]) : finalUrl.hostname,
    url: finalUrl.toString(),
    html: html.slice(0, 200_000),
    text: text.slice(0, 60_000),
    publishedTime: timeMatch?.[1],
  }
}

/* ------------------------------------------------------------------ */
/* Unified chains (search + read) with Z.ai as last resort            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Provider 0: Gemini + Google Search grounding (API — IP-proof)       */
/* ------------------------------------------------------------------ */

/**
 * THE QUALITY ENGINE: real Google Search results via Gemini's built-in
 * google_search grounding (GEMINI_API_KEY — already provisioned on Vercel).
 * Unlike the scrapers below, this is a first-class API: it works from any
 * datacenter IP (Vercel included), needs no cookies, and returns the same
 * index quality famous answer engines use. Grounding metadata carries the
 * result URL + title + domain for each source chunk.
 */
export async function geminiGroundSearch(query: string, num = 8): Promise<WebSearchResult[]> {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) throw new Error('Gemini grounding not configured')

  const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest']
  let lastError = 'no model answered'

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      `Search the web for: ${query}\n\n` +
                      `Return the top ${num} most relevant, high-quality results. Do not answer the question — just search and ground yourself in the results.`,
                  },
                ],
              },
            ],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 140)}`
        continue
      }
      const data = (await res.json()) as {
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }>
          }
        }>
      }
      const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
      const results: WebSearchResult[] = []
      const seen = new Set<string>()
      for (const c of chunks) {
        const web = c.web
        if (!web?.uri || !/^https?:\/\//.test(web.uri)) continue
        const uri = web.uri
        // Grounding can return the same domain many times — diversify hosts
        let host = ''
        try {
          host = new URL(uri).hostname.replace(/^www\./, '')
        } catch {
          continue
        }
        const dedupeKey = `${host}${new URL(uri).pathname}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        results.push({
          title: web.title || host,
          url: uri,
          snippet: '',
          host_name: web.domain || host,
          rank: results.length + 1,
          favicon: faviconFor(uri),
        })
        if (results.length >= num) break
      }
      if (results.length === 0) {
        lastError = `${model}: no grounding chunks returned`
        continue
      }
      return results
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  throw new Error(lastError)
}

/* ------------------------------------------------------------------ */
/* Provider 0b: Bing News RSS (keyless, datacenter-friendly)           */
/* ------------------------------------------------------------------ */

/** XML text cleanup: CDATA + entity decoding + tag strip. */
function xmlClean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** Bing News RSS item links are apiclick redirects with the real article
 *  URL inside the `url` param — decode it when present. */
function decodeBingNewsLink(link: string): string {
  try {
    const flat = xmlClean(link)
    if (!/bing\.com\/news\/apiclick/.test(flat)) return flat
    const urlParam = /[?&]url=([^&]+)/.exec(flat)
    if (urlParam) {
      const decoded = decodeURIComponent(urlParam[1])
      if (/^https?:\/\//.test(decoded)) return decoded
    }
  } catch {
    /* fall through to raw link */
  }
  return xmlClean(link)
}

export async function bingNewsSearch(query: string, num = 8): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&mkt=en-US`,
    { headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(12_000) }
  )
  if (!res.ok) throw new Error(`Bing News RSS responded ${res.status}`)
  const xml = await res.text()
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  if (items.length === 0) throw new Error('Bing News RSS returned no items')
  const results: WebSearchResult[] = []
  for (const item of items) {
    if (results.length >= num) break
    const block = item[1]
    const title = xmlClean(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '')
    const rawLink = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? ''
    const url = decodeBingNewsLink(rawLink)
    if (!title || !/^https?:\/\//.test(url)) continue
    const snippet = xmlClean(/<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? '')
    const date = /<pubDate>([^<]+)<\/pubDate>/.exec(block)?.[1]
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
      date: date ? new Date(date).toISOString().slice(0, 10) : undefined,
      favicon: faviconFor(url),
    })
  }
  if (results.length === 0) throw new Error('Bing News RSS: no parseable results')
  return results
}

/* ------------------------------------------------------------------ */
/* Provider 0c: Google News RSS (keyless, datacenter-friendly)         */
/* ------------------------------------------------------------------ */

export async function googleNewsSearch(query: string, num = 8): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    { headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(12_000) }
  )
  if (!res.ok) throw new Error(`Google News RSS responded ${res.status}`)
  const xml = await res.text()
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  if (items.length === 0) throw new Error('Google News RSS returned no items')
  const results: WebSearchResult[] = []
  for (const item of items) {
    if (results.length >= num) break
    const block = item[1]
    const rawTitle = xmlClean(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '')
    const url = xmlClean(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '')
    if (!rawTitle || !/^https?:\/\//.test(url)) continue
    // Google News titles are "Headline - Publisher"
    const dash = rawTitle.lastIndexOf(' - ')
    const title = dash > 10 ? rawTitle.slice(0, dash) : rawTitle
    const publisher = dash > 10 ? rawTitle.slice(dash + 3) : ''
    const sourceUrl = /<source[^>]*url="([^"]+)"/.exec(block)?.[1] ?? ''
    let host = ''
    try {
      host = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : 'news.google.com'
    } catch {
      host = 'news.google.com'
    }
    const date = /<pubDate>([^<]+)<\/pubDate>/.exec(block)?.[1]
    results.push({
      title,
      url,
      snippet: publisher ? `${publisher}${date ? ' · ' + new Date(date).toISOString().slice(0, 10) : ''}` : '',
      host_name: host,
      rank: results.length + 1,
      date: date ? new Date(date).toISOString().slice(0, 10) : undefined,
      favicon: sourceUrl ? faviconFor(sourceUrl) : faviconFor(url),
    })
  }
  if (results.length === 0) throw new Error('Google News RSS: no parseable results')
  return results
}

/**
 * FREE WEB SEARCH CHAIN (parallel racing):
 * {Gemini(Google) | Brave | DDG | BingNews RSS | GoogleNews RSS} → Wikipedia.
 *
 * Five engines fire IN PARALLEL (allSettled) and the best available answer
 * is picked by priority — Gemini grounding (Google index, API-grade) →
 * Brave → DuckDuckGo → Bing News RSS → Google News RSS. The RSS engines
 * are keyless AND work from datacenter IPs, so on days when the Gemini key
 * is quota-limited and the scrapers are blocked (the exact production
 * failure mode), NEXUS still returns real, fresh results instead of only
 * Wikipedia. Wikipedia remains the encyclopedic safety net.
 */
let lastSearchEngine = 'none'
let lastSearchErrors: string[] = []
export function lastSearchEngineUsed(): string {
  return lastSearchEngine
}
/** Truncated per-engine failure reasons (safe: engine names + HTTP codes). */
export function lastSearchEngineErrors(): string[] {
  return lastSearchErrors
}

export async function freeWebSearch(
  query: string,
  num = 8
): Promise<WebSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  lastSearchErrors = []

  // 0. Parallel race across all general engines
  const settled = await Promise.allSettled([
    geminiGroundSearch(trimmed, num),
    braveSearch(trimmed, num),
    duckDuckGoSearch(trimmed, num),
    bingNewsSearch(trimmed, num),
    googleNewsSearch(trimmed, num),
  ])

  const names = ['gemini', 'brave', 'ddg', 'bing-news', 'google-news']
  const priorities: Array<{ engine: string; value: WebSearchResult[] }> = []
  lastSearchErrors = settled.map((r, i) =>
    `${names[i]}: ${r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 140) : r.value.length > 0 ? `ok (${r.value.length})` : 'no results'}`
  )
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      priorities.push({ engine: names[i], value: r.value })
    }
  })
  priorities.sort((a, b) => names.indexOf(a.engine) - names.indexOf(b.engine))

  // Snippet enrichment: Gemini grounding returns titles + URLs but no
  // excerpts — join snippets from the other engines where URLs overlap.
  const snippetByURL = new Map<string, string>()
  for (const p of priorities) {
    for (const r of p.value) {
      if (r.snippet && !snippetByURL.has(r.url)) snippetByURL.set(r.url, r.snippet)
    }
  }

  if (priorities.length > 0) {
    const best = priorities[0]
    lastSearchEngine = best.engine
    return best.value.map((r) => ({ ...r, snippet: r.snippet || snippetByURL.get(r.url) || '' }))
  }

  const errors = lastSearchErrors

  // 1. Wikipedia (encyclopedic only, but always up)
  try {
    const wiki = await wikipediaSearch(trimmed, num)
    if (wiki.length > 0) {
      lastSearchEngine = 'wikipedia'
      return wiki
    }
    errors.push('wikipedia: no results')
  } catch (err) {
    errors.push(`wikipedia: ${err instanceof Error ? err.message : err}`)
  }

  // 2. (retired) Z.ai web_search — permanently disabled by owner directive.
  console.error('[web-access] all search providers failed:', errors.join(' | '))
  throw new Error('Web search is temporarily unavailable — all providers failed.')
}

/**
 * SMART PAGE READER: direct fetch with alternate fetch strategies.
 * (The retired Z.ai page_reader fallback is gone — owner directive.)
 */
export async function readPageSmart(url: string): Promise<PageContent> {
  return readPageDirect(url)
}
