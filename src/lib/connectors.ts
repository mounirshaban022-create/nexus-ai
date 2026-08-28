import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getZAI } from './zai'
import { freeWebSearch, readPageSmart, wikipediaSearch } from './web-access'
import { getPrimaryAccount, listEmails, searchEmails, readEmail, sendEmail } from './email'

/* ------------------------------------------------------------------ */
/* Safe math expression evaluator (recursive descent — never eval())   */
/* ------------------------------------------------------------------ */

class MathParser {
  private pos = 0

  constructor(private readonly input: string) {}

  parse(): number {
    this.skipWs()
    const value = this.parseExpr()
    this.skipWs()
    if (this.pos < this.input.length) throw new Error(`Unexpected character at position ${this.pos}`)
    if (!Number.isFinite(value)) throw new Error('Result is not a finite number')
    return value
  }

  private skipWs() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++
  }

  private peek(): string {
    return this.input[this.pos] ?? ''
  }

  private parseExpr(): number {
    let left = this.parseTerm()
    for (;;) {
      this.skipWs()
      const op = this.peek()
      if (op === '+' || op === '-') {
        this.pos++
        const right = this.parseTerm()
        left = op === '+' ? left + right : left - right
      } else {
        return left
      }
    }
  }

  private parseTerm(): number {
    let left = this.parseFactor()
    for (;;) {
      this.skipWs()
      const op = this.peek()
      if (op === '*' || op === '/' || op === '%') {
        this.pos++
        const right = this.parseFactor()
        if ((op === '/' || op === '%') && right === 0) throw new Error('Division by zero')
        left = op === '*' ? left * right : op === '/' ? left / right : left % right
      } else {
        return left
      }
    }
  }

  private parseFactor(): number {
    const base = this.parseUnary()
    this.skipWs()
    if (this.peek() === '^') {
      this.pos++
      const exponent = this.parseFactor()
      return Math.pow(base, exponent)
    }
    return base
  }

  private parseUnary(): number {
    this.skipWs()
    if (this.peek() === '-') {
      this.pos++
      return -this.parseUnary()
    }
    if (this.peek() === '+') {
      this.pos++
      return this.parseUnary()
    }
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    this.skipWs()
    const ch = this.peek()
    if (ch === '(') {
      this.pos++
      const value = this.parseExpr()
      this.skipWs()
      if (this.peek() !== ')') throw new Error('Missing closing parenthesis')
      this.pos++
      return value
    }
    // number (int, decimal, scientific)
    const numMatch = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.input.slice(this.pos))
    if (!numMatch) throw new Error(`Expected a number at position ${this.pos}`)
    this.pos += numMatch[0].length
    return parseFloat(numMatch[0])
  }
}

export function evaluateMathExpression(expression: string): number {
  if (!/^[\d\s+\-*/%^().eE]+$/.test(expression)) {
    throw new Error('Expression contains invalid characters')
  }
  if (expression.length > 200) throw new Error('Expression too long')
  return new MathParser(expression).parse()
}

/* ------------------------------------------------------------------ */
/* Connector registry                                                  */
/* ------------------------------------------------------------------ */

export interface ConnectorParam {
  name: string
  type: 'string' | 'number'
  description: string
  required: boolean
}

export interface ConnectorDefinition {
  id: string
  name: string
  category: 'web' | 'knowledge' | 'developer' | 'utility' | 'email' | 'finance'
  description: string // human-facing
  /** LLM-facing: what it does + when to use it */
  llmDescription: string
  params: ConnectorParam[]
  sampleArgs: Record<string, unknown>
  /** Requires a connected email account */
  requiresAccount?: boolean
  execute: (args: Record<string, unknown>, ctx?: ConnectorContext) => Promise<unknown>
}

/** SECURITY: per-call context so connectors that touch private data
 *  (email accounts) only ever read the CALLER's own records. The
 *  userId is derived from a verified session by every caller. */
export interface ConnectorContext {
  userId?: string | null
}

const IMAGES_DIR = path.join(process.cwd(), 'generated-images')

/** Blocks requests to private/internal networks (SSRF guard).
 *  Shared implementation lives in ./safe-url (re-exported for backwards
 *  compatibility with existing imports). */
export { assertPublicUrl } from './safe-url'

async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NEXUS-AI/1.0 (super-app connector)' },
    })
    if (!res.ok) throw new Error(`Upstream responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function truncateForLlm(value: unknown, maxChars = 4000): unknown {
  const text = JSON.stringify(value)
  if (text.length <= maxChars) return value
  return { truncated: true, preview: text.slice(0, maxChars) }
}

interface HnHit {
  title: string | null
  url: string | null
  points: number | null
  num_comments: number | null
  objectID: string
}

interface GhRepo {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  language: string | null
  updated_at: string
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'web_search',
    name: 'Web Search',
    category: 'web',
    description: 'Search the live web for current information, news, and facts.',
    llmDescription:
      'Search the live web. Use for current events, facts, prices, news, or anything you are unsure about. Returns ranked results with titles, URLs and snippets.',
    params: [
      { name: 'query', type: 'string', description: 'The search query', required: true },
    ],
    sampleArgs: { query: 'latest AI news' },
    execute: async (args) => {
      // FREE WEB ACCESS CHAIN (replaces Z.ai web_search — bypasses 429s):
      // Brave Search → DuckDuckGo → Wikipedia → Z.ai (last resort).
      // Every provider is keyless with its own rate-limit budget.
      const results = await freeWebSearch(String(args.query), 6)
      return {
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.host_name,
          date: r.date,
        })),
      }
    },
  },
  {
    id: 'read_page',
    name: 'Read Page',
    category: 'web',
    description: 'Open any URL and extract its full content, clean and readable.',
    llmDescription:
      'Reads a web page at a URL and returns its extracted text content. Use after web_search to read a promising result, or whenever a specific URL needs to be read.',
    params: [
      { name: 'url', type: 'string', description: 'The full URL to read (include https://)', required: true },
    ],
    sampleArgs: { url: 'https://example.com' },
    execute: async (args) => {
      let url = String(args.url).trim()
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`
      const parsed = assertPublicUrl(url) // SSRF guard: blocks private/internal hosts
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parsed.hostname)) {
        throw new Error('Invalid hostname')
      }
      // SMART PAGE READER (replaces Z.ai page_reader): direct fetch first
      // (no quota), Z.ai reader as fallback for JS-rendered pages.
      const page = await readPageSmart(parsed.toString())
      return truncateForLlm(
        { title: page.title, url: page.url, text: page.text.slice(0, 6000) },
        6500
      )
    },
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    category: 'knowledge',
    description: 'Look up encyclopedia articles on any topic.',
    llmDescription:
      'Searches Wikipedia and returns the top matching articles with summaries. Use for encyclopedic knowledge: people, places, history, science, concepts.',
    params: [
      { name: 'topic', type: 'string', description: 'The topic to look up', required: true },
    ],
    sampleArgs: { topic: 'Burj Khalifa' },
    execute: async (args) => {
      const topic = String(args.topic).trim()
      // Resolve the topic to a canonical Wikipedia article slug
      const slug = topic
        .split(/\s+/)
        .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
        .join('_')
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`

      // Direct fetch (keyless, no Z.ai dependency — verified live).
      // Wikipedia serves full HTML to plain HTTP clients with a browser UA.
      try {
        const page = await readPageSmart(wikiUrl)
        if (page.text.length > 200) {
          return { title: page.title, url: wikiUrl, extract: page.text.slice(0, 4500) }
        }
      } catch {
        /* fall through to search */
      }

      // Fallback: find the right article via the Wikipedia search API
      // (also keyless — part of the free web-access chain)
      const results = await wikipediaSearch(topic, 3)
      return {
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      }
    },
  },
  {
    id: 'weather',
    name: 'Weather',
    category: 'web',
    description: 'Live weather conditions and forecast for any city worldwide.',
    llmDescription:
      'Gets current weather and today\'s forecast for a city. Use whenever the user asks about weather, temperature, rain, or conditions anywhere in the world.',
    params: [
      { name: 'location', type: 'string', description: 'City name, e.g. "Dubai" or "Paris, France"', required: true },
    ],
    sampleArgs: { location: 'Dubai' },
    execute: async (args) => {
      const location = String(args.location).trim()
      const data = (await fetchJson(
        `https://wttr.in/${encodeURIComponent(location)}?format=j1`
      )) as {
        current_condition?: Array<{
          temp_C?: string
          FeelsLikeC?: string
          humidity?: string
          weatherDesc?: Array<{ value?: string }>
          winddirDegree?: string
          windspeedKmph?: string
        }>
        weather?: Array<{
          date?: string
          maxtempC?: string
          mintempC?: string
          hourly?: Array<{ chanceofrain?: string; weatherDesc?: Array<{ value?: string }> }>
        }>
      }
      const current = data.current_condition?.[0]
      if (!current) throw new Error('No weather data returned')
      const today = data.weather?.[0]
      return {
        location,
        current: {
          temperatureC: current.temp_C,
          feelsLikeC: current.FeelsLikeC,
          humidity: current.humidity,
          condition: current.weatherDesc?.[0]?.value,
          windKmph: current.windspeedKmph,
        },
        today: today
          ? {
              date: today.date,
              maxC: today.maxtempC,
              minC: today.mintempC,
              rainChance: today.hourly?.map((h) => h.chanceofrain).filter(Boolean),
            }
          : null,
      }
    },
  },
  {
    id: 'hacker_news',
    name: 'Hacker News',
    category: 'developer',
    description: 'Top stories and discussions from Hacker News (Y Combinator).',
    llmDescription:
      'Fetches trending stories from Hacker News. With a topic, searches related discussions. Use for tech news, startup/programming community pulse.',
    params: [
      { name: 'topic', type: 'string', description: 'Optional topic to search for. Omit for front-page top stories.', required: false },
    ],
    sampleArgs: { topic: 'AI agents' },
    execute: async (args) => {
      const topic = args.topic ? String(args.topic).trim() : ''
      const url = topic
        ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=5`
        : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=6`
      const data = (await fetchJson(url)) as { hits?: HnHit[] }
      return {
        stories: (data.hits ?? []).map((h) => ({
          title: h.title,
          url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points,
          comments: h.num_comments,
        })),
      }
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'developer',
    description: 'Search repositories by stars, language, and topics.',
    llmDescription:
      'Searches GitHub repositories by keyword, sorted by stars. Use for questions about open-source projects, libraries, frameworks, repos to use or compare.',
    params: [
      { name: 'query', type: 'string', description: 'Repository search query, e.g. "next.js ai chatbot"', required: true },
    ],
    sampleArgs: { query: 'open source ai assistant' },
    execute: async (args) => {
      const data = (await fetchJson(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(String(args.query))}&sort=stars&order=desc&per_page=5`
      )) as { items?: GhRepo[]; total_count?: number }
      return {
        totalFound: data.total_count,
        repositories: (data.items ?? []).map((r) => ({
          name: r.full_name,
          stars: r.stargazers_count,
          language: r.language,
          description: r.description,
          url: r.html_url,
          updatedAt: r.updated_at,
        })),
      }
    },
  },
  {
    id: 'time',
    name: 'World Clock',
    category: 'utility',
    description: 'Current date and time in any timezone.',
    llmDescription:
      'Returns the current date and time. Use for scheduling, time math, "what time is it in X" questions, or before any time-sensitive reasoning.',
    params: [
      { name: 'timezone', type: 'string', description: 'IANA timezone, e.g. "Asia/Dubai". Optional, defaults to UTC.', required: false },
    ],
    sampleArgs: { timezone: 'Asia/Dubai' },
    execute: async (args) => {
      const requested = args.timezone ? String(args.timezone).trim() : 'UTC'
      let tz = requested
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
      } catch {
        tz = 'UTC'
      }
      const now = new Date()
      return {
        timezone: tz,
        iso: now.toISOString(),
        local: new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(now),
        unixSeconds: Math.floor(now.getTime() / 1000),
      }
    },
  },
  {
    id: 'calculator',
    name: 'Calculator',
    category: 'utility',
    description: 'Precise math evaluation: +, -, *, /, %, ^, parentheses.',
    llmDescription:
      'Evaluates a mathematical expression with exact arithmetic. Use for ANY numeric calculation instead of computing in your head. Supports + - * / % ^ and parentheses.',
    params: [
      { name: 'expression', type: 'string', description: 'Math expression, e.g. "(1920*1080)/1000000"', required: true },
    ],
    sampleArgs: { expression: '(1920*1080)/1000000' },
    execute: async (args) => {
      const expression = String(args.expression)
      const result = evaluateMathExpression(expression)
      return { expression, result }
    },
  },
  {
    id: 'generate_image',
    name: 'Image Generator',
    category: 'utility',
    description: 'Generate an AI image from a text prompt.',
    llmDescription:
      'Generates an image from a text prompt and returns a URL to it. Use when the user asks to create, draw, or illustrate something visual.',
    params: [
      { name: 'prompt', type: 'string', description: 'Detailed description of the image to generate', required: true },
      { name: 'size', type: 'string', description: 'Optional size: 1024x1024, 1344x768, or 768x1344', required: false },
    ],
    sampleArgs: { prompt: 'A serene desert oasis at sunset' },
    execute: async (args) => {
      const prompt = String(args.prompt).slice(0, 2000)
      const requested = args.size ? String(args.size) : '1024x1024'
      const size = ['1024x1024', '1344x768', '768x1344'].includes(requested) ? requested : '1024x1024'
      const zai = await getZAI()
      const response = await zai.images.generations.create({ prompt, size })
      const base64 = response.data?.[0]?.base64
      if (!base64) throw new Error('Image generation returned no data')
      const buffer = Buffer.from(base64, 'base64')
      const filename = `${randomUUID()}.png`
      await mkdir(IMAGES_DIR, { recursive: true })
      await writeFile(path.join(IMAGES_DIR, filename), buffer)
      return { imageUrl: `/api/image/file/${filename.replace('.png', '')}`, prompt, size, note: 'The image URL has been shown to the user in your message.' }
    },
  },

  {
    id: 'crypto',
    name: 'Crypto Prices',
    category: 'finance',
    description: 'Live cryptocurrency prices via Coinbase (BTC, ETH, and more).',
    llmDescription:
      'Gets the current spot price of a cryptocurrency pair. Use for crypto price questions. Pair format: "BTC-USD", "ETH-USD", "SOL-USD", etc.',
    params: [
      { name: 'pair', type: 'string', description: 'Trading pair like BTC-USD or ETH-EUR', required: true },
    ],
    sampleArgs: { pair: 'BTC-USD' },
    execute: async (args) => {
      const pair = String(args.pair).toUpperCase().replace(/\s+/g, '')
      if (!/^[A-Z]{2,10}-[A-Z]{3,5}$/.test(pair)) throw new Error('Pair must look like BTC-USD')
      const data = (await fetchJson(`https://api.coinbase.com/v2/prices/${pair}/spot`)) as {
        data?: { amount?: string; base?: string; currency?: string }
      }
      return { pair, price: data.data?.amount, base: data.data?.base, currency: data.data?.currency }
    },
  },
  {
    id: 'dictionary',
    name: 'Dictionary',
    category: 'knowledge',
    description: 'Word definitions, phonetics, synonyms and examples.',
    llmDescription:
      'Looks up an English word: definition, pronunciation, synonyms, example usage. Use for word meanings, spelling checks and vocabulary.',
    params: [
      { name: 'word', type: 'string', description: 'The English word to look up', required: true },
    ],
    sampleArgs: { word: 'serendipity' },
    execute: async (args) => {
      const word = String(args.word).trim().toLowerCase().replace(/[^a-z'-]/g, '')
      if (!word) throw new Error('A word is required')
      const data = (await fetchJson(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      )) as Array<{
        word?: string
        phonetic?: string
        phonetics?: Array<{ text?: string; audio?: string }>
        meanings?: Array<{
          partOfSpeech?: string
          definitions?: Array<{ definition?: string; example?: string; synonyms?: string[] }>
        }>
      }>
      const entry = Array.isArray(data) ? data[0] : undefined
      if (!entry) throw new Error(`No definition found for "${word}"`)
      return {
        word: entry.word,
        phonetic: entry.phonetic,
        audio: entry.phonetics?.find((p) => p.audio)?.audio ?? null,
        meanings: (entry.meanings ?? []).slice(0, 4).map((m) => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions ?? []).slice(0, 3).map((d) => ({
            definition: d.definition,
            example: d.example,
          })),
          synonyms: (m.definitions ?? []).flatMap((d) => d.synonyms ?? []).slice(0, 6),
        })),
      }
    },
  },
  {
    id: 'translate',
    name: 'Translator',
    category: 'knowledge',
    description: 'Translate text between 30+ languages.',
    llmDescription:
      'Translates text between languages. Use language codes like "en" (English), "es" (Spanish), "fr" (French), "ar" (Arabic), "de", "hi", "ja", "zh".',
    params: [
      { name: 'text', type: 'string', description: 'The text to translate (max 500 chars)', required: true },
      { name: 'from', type: 'string', description: 'Source language code, e.g. "en"', required: true },
      { name: 'to', type: 'string', description: 'Target language code, e.g. "ar"', required: true },
    ],
    sampleArgs: { text: 'Good morning, how are you?', from: 'en', to: 'ar' },
    execute: async (args) => {
      const text = String(args.text).slice(0, 500)
      const from = String(args.from).toLowerCase().replace(/[^a-z-]/g, '')
      const to = String(args.to).toLowerCase().replace(/[^a-z-]/g, '')
      if (!text || !from || !to) throw new Error('text, from and to are required')
      const data = (await fetchJson(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
      )) as { responseData?: { translatedText?: string; match?: number }; responseStatus?: number }
      const translated = data.responseData?.translatedText
      if (!translated) throw new Error('Translation service returned no result')
      return { from, to, original: text, translation: translated }
    },
  },
  {
    id: 'geocode',
    name: 'Geocoder',
    category: 'utility',
    description: 'Find any place on Earth: coordinates, country, and details.',
    llmDescription:
      'Geocodes a place name to latitude/longitude and address details. Use before the forecast connector for weather at a place, or for any "where is X" question.',
    params: [
      { name: 'place', type: 'string', description: 'Place name, e.g. "Burj Khalifa" or "Paris, France"', required: true },
    ],
    sampleArgs: { place: 'Burj Khalifa' },
    execute: async (args) => {
      const place = String(args.place).trim()
      if (!place) throw new Error('A place name is required')
      const data = (await fetchJson(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=3`,
        15000
      )) as Array<{ lat?: string; lon?: string; display_name?: string; type?: string }>
      if (!Array.isArray(data) || data.length === 0) throw new Error(`No place found for "${place}"`)
      return {
        results: data.map((r) => ({
          name: r.display_name,
          latitude: r.lat,
          longitude: r.lon,
          type: r.type,
        })),
      }
    },
  },
  {
    id: 'forecast',
    name: 'Forecast',
    category: 'web',
    description: 'Detailed weather forecast by coordinates (Open-Meteo).',
    llmDescription:
      'Gets current weather plus 3-day forecast for latitude/longitude coordinates. Chain after the geocode connector. Returns temperature, wind, precipitation, and daily highs/lows.',
    params: [
      { name: 'latitude', type: 'string', description: 'Latitude, e.g. 25.1972', required: true },
      { name: 'longitude', type: 'string', description: 'Longitude, e.g. 55.2744', required: true },
    ],
    sampleArgs: { latitude: '25.1972', longitude: '55.2744' },
    execute: async (args) => {
      const lat = String(args.latitude).replace(/[^0-9.\-]/g, '')
      const lon = String(args.longitude).replace(/[^0-9.\-]/g, '')
      if (!lat || !lon) throw new Error('latitude and longitude are required')
      const data = (await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3`
      )) as {
        current?: Record<string, number>
        daily?: Record<string, Array<number | string>>
      }
      return {
        coordinates: { lat, lon },
        current: data.current,
        daily: data.daily
          ? {
              dates: data.daily.time,
              maxC: data.daily.temperature_2m_max,
              minC: data.daily.temperature_2m_min,
              rainChance: data.daily.precipitation_probability_max,
              weatherCodes: data.daily.weather_code,
            }
          : null,
      }
    },
  },
  {
    id: 'currency',
    name: 'Currency Rates',
    category: 'finance',
    description: 'Live exchange rates for 160+ currencies.',
    llmDescription:
      'Gets current exchange rates. Either latest rates for a base currency (e.g. USD), or converts an amount from one currency to another. Use ISO codes like USD, EUR, AED, GBP, JPY.',
    params: [
      { name: 'base', type: 'string', description: 'Base currency code, e.g. "USD"', required: true },
      { name: 'target', type: 'string', description: 'Optional target currency to convert to, e.g. "AED"', required: false },
      { name: 'amount', type: 'string', description: 'Optional amount to convert, e.g. "100"', required: false },
    ],
    sampleArgs: { base: 'USD', target: 'AED', amount: '100' },
    execute: async (args) => {
      const base = String(args.base).toUpperCase().replace(/[^A-Z]/g, '')
      if (base.length !== 3) throw new Error('base must be a 3-letter currency code')
      const data = (await fetchJson(`https://open.er-api.com/v6/latest/${base}`)) as {
        rates?: Record<string, number>
        time_last_update_utc?: string
      }
      const rates = data.rates ?? {}
      const target = args.target ? String(args.target).toUpperCase().replace(/[^A-Z]/g, '') : null
      const amount = args.amount ? parseFloat(String(args.amount).replace(/[^0-9.]/g, '')) : null
      if (target) {
        const rate = rates[target]
        if (!rate) throw new Error(`Unknown currency "${target}"`)
        return {
          base,
          target,
          rate,
          amount,
          converted: amount ? amount * rate : undefined,
          updated: data.time_last_update_utc,
        }
      }
      return {
        base,
        updated: data.time_last_update_utc,
        popular: {
          USD: rates.USD, EUR: rates.EUR, GBP: rates.GBP, AED: rates.AED, JPY: rates.JPY,
          INR: rates.INR, CNY: rates.CNY, SAR: rates.SAR,
        },
      }
    },
  },
  {
    id: 'research',
    name: 'arXiv Papers',
    category: 'knowledge',
    description: 'Search cutting-edge research papers on arXiv.',
    llmDescription:
      'Searches arXiv for scientific/research papers. Use for academic questions, latest AI research, papers by topic. Returns titles, authors, abstracts and links.',
    params: [
      { name: 'query', type: 'string', description: 'Research topic search query', required: true },
    ],
    sampleArgs: { query: 'large language model agents' },
    execute: async (args) => {
      const query = String(args.query).trim().slice(0, 200)
      if (!query) throw new Error('A research query is required')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      let xml: string
      try {
        const res = await fetch(
          `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=4&sortBy=relevance`,
          { signal: controller.signal, headers: { 'User-Agent': 'NEXUS-AI/1.0' } }
        )
        xml = await res.text()
      } finally {
        clearTimeout(timer)
      }

      const papers: Array<{ title: string; authors: string; summary: string; link: string; published: string }> = []
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
      let match
      while ((match = entryRegex.exec(xml)) !== null && papers.length < 4) {
        const block = match[1]
        papers.push({
          title: (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim().replace(/\s+/g, ' '),
          authors: [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).slice(0, 4).join(', '),
          summary: (block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 500),
          link: (block.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '').trim(),
          published: (block.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '').slice(0, 10),
        })
      }
      if (papers.length === 0) throw new Error('No papers found for that query')
      return { query, papers }
    },
  },
  {
    id: 'space',
    name: 'Rocket Launches',
    category: 'web',
    description: 'Upcoming space launches and missions worldwide.',
    llmDescription:
      'Gets upcoming rocket launches with mission, provider, rocket, and launch time. Use for space news and "when is the next launch" questions.',
    params: [
      { name: 'limit', type: 'string', description: 'Optional number of launches (1-5)', required: false },
    ],
    sampleArgs: {},
    execute: async (args) => {
      const limit = Math.min(Math.max(parseInt(String(args.limit ?? '3')) || 3, 1), 5)
      const data = (await fetchJson(`https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=${limit}`)) as {
        results?: Array<{
          name?: string
          mission?: { name?: string; description?: string } | null
          launch_service_provider?: { name?: string }
          rocket?: { configuration?: { name?: string } }
          net?: string
          status?: { abbrev?: string; description?: string }
        }>
      }
      const results = data.results ?? []
      if (results.length === 0) throw new Error('No upcoming launches found')
      return {
        launches: results.map((l) => ({
          name: l.name,
          mission: l.mission?.name ?? null,
          provider: l.launch_service_provider?.name,
          rocket: l.rocket?.configuration?.name,
          launchTime: l.net,
          status: l.status?.abbrev,
        })),
      }
    },
  },

  {
    id: 'recipes',
    name: 'Recipes',
    category: 'knowledge',
    description: 'Search any recipe with ingredients and instructions.',
    llmDescription:
      'Searches real recipes by dish name or main ingredient. Returns meal name, cuisine, category, ingredients list, and full cooking instructions. Use for any cooking, meal, or recipe question.',
    params: [
      { name: 'dish', type: 'string', description: 'Dish name or main ingredient, e.g. "chicken" or "pasta"', required: true },
    ],
    sampleArgs: { dish: 'chicken' },
    execute: async (args) => {
      const dish = String(args.dish).trim().slice(0, 100)
      if (!dish) throw new Error('A dish or ingredient is required')
      const res = await fetch(
        `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(dish)}`,
        { signal: AbortSignal.timeout(15_000) }
      )
      if (!res.ok) throw new Error(`Recipe service responded ${res.status}`)
      const data = (await res.json()) as {
        meals?: Array<{
          strMeal?: string
          strCategory?: string
          strArea?: string
          strInstructions?: string
          strMealThumb?: string
          strYoutube?: string
          [key: string]: string | null | undefined
        }>
      }
      let meals = data.meals ?? []
      if (meals.length === 0) {
        // Fallback: search by main ingredient
        const res2 = await fetch(
          `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(dish)}`,
          { signal: AbortSignal.timeout(15_000) }
        )
        const data2 = (await res2.json()) as { meals?: Array<{ strMeal?: string }> }
        meals = (data2.meals ?? []).slice(0, 5) as typeof meals
        if (meals.length > 0) {
          return {
            note: `No exact match for "${dish}" — here are dishes with that ingredient:`,
            suggestions: meals.map((m) => m.strMeal).filter(Boolean),
          }
        }
        throw new Error(`No recipes found for "${dish}".`)
      }
      return {
        recipes: meals.slice(0, 3).map((m) => {
          const ingredients: string[] = []
          for (let i = 1; i <= 20; i++) {
            const ing = m[`strIngredient${i}`]
            const measure = m[`strMeasure${i}`]
            if (ing && String(ing).trim()) {
              ingredients.push(`${measure ? String(measure).trim() + ' ' : ''}${ing}`)
            }
          }
          return {
            name: m.strMeal,
            category: m.strCategory,
            cuisine: m.strArea,
            ingredients,
            instructions: (m.strInstructions ?? '').slice(0, 2000),
            image: m.strMealThumb,
            video: m.strYoutube,
          }
        }),
      }
    },
  },
  {
    id: 'nasa',
    name: 'NASA Daily',
    category: 'knowledge',
    description: 'NASA Astronomy Picture of the Day — the cosmos, daily.',
    llmDescription:
      'Gets NASA Astronomy Picture of the Day (today or a random recent day): the image URL, title, and explanation. Use for anything about space, astronomy, or a beautiful daily space fact.',
    params: [],
    sampleArgs: {},
    execute: async () => {
      const res = await fetch(
        'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true',
        { signal: AbortSignal.timeout(15_000) }
      )
      if (!res.ok) throw new Error(`NASA API responded ${res.status}`)
      const data = (await res.json()) as {
        title?: string
        explanation?: string
        url?: string
        date?: string
        media_type?: string
        copyright?: string
      }
      return {
        title: data.title,
        date: data.date,
        imageUrl: data.url,
        mediaType: data.media_type,
        copyright: data.copyright,
        explanation: (data.explanation ?? '').slice(0, 1200),
      }
    },
  },
  {
    id: 'pokemon',
    name: 'Pokédex',
    category: 'knowledge',
    description: 'Look up any Pokémon: stats, types, abilities, and sprite.',
    llmDescription:
      'Looks up a Pokémon by name or number. Returns type, stats (HP, attack, speed…), height, weight, abilities, and sprite image. Use for any Pokémon question.',
    params: [
      { name: 'name', type: 'string', description: 'Pokémon name or number, e.g. "pikachu" or "25"', required: true },
    ],
    sampleArgs: { name: 'pikachu' },
    execute: async (args) => {
      const name = String(args.name).trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      if (!name) throw new Error('A Pokémon name is required')
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 404) throw new Error(`Pokémon "${name}" not found.`)
      if (!res.ok) throw new Error(`Pokédex responded ${res.status}`)
      const data = (await res.json()) as {
        name?: string
        id?: number
        height?: number
        weight?: number
        types?: Array<{ type?: { name?: string } }>
        abilities?: Array<{ ability?: { name?: string } }>
        stats?: Array<{ base_stat?: number; stat?: { name?: string } }>
        sprites?: { front_default?: string }
      }
      return {
        name: data.name,
        id: data.id,
        types: (data.types ?? []).map((t) => t.type?.name).filter(Boolean),
        abilities: (data.abilities ?? []).map((a) => a.ability?.name).filter(Boolean),
        stats: Object.fromEntries(
          (data.stats ?? []).map((s) => [s.stat?.name ?? '?', s.base_stat])
        ),
        heightM: data.height ? data.height / 10 : null,
        weightKg: data.weight ? data.weight / 10 : null,
        sprite: data.sprites?.front_default,
      }
    },
  },
  {
    id: 'trivia',
    name: 'Trivia',
    category: 'utility',
    description: 'Fun trivia questions on any topic with answers.',
    llmDescription:
      'Gets trivia quiz questions with multiple-choice answers. Use for games, icebreakers, or fun facts. Returns question, options, and the correct answer.',
    params: [
      { name: 'topic', type: 'string', description: 'Optional topic filter — omit for mixed trivia', required: false },
    ],
    sampleArgs: { topic: 'science' },
    execute: async (args) => {
      const topic = args.topic ? String(args.topic).trim().toLowerCase() : ''
      const categoryMap: Record<string, number> = {
        science: 17, film: 11, music: 12, history: 23, geography: 22,
        sports: 21, art: 25, computers: 18, math: 19, general: 9,
      }
      const params = new URLSearchParams({ amount: '4', type: 'multiple' })
      if (topic && categoryMap[topic]) params.set('category', String(categoryMap[topic]))
      const res = await fetch(`https://opentdb.com/api.php?${params}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`Trivia API responded ${res.status}`)
      const data = (await res.json()) as {
        results?: Array<{
          question?: string
          correct_answer?: string
          incorrect_answers?: string[]
          difficulty?: string
          category?: string
        }>
      }
      const questions = (data.results ?? []).map((q) => {
        const options = [...(q.incorrect_answers ?? []), q.correct_answer ?? '']
        // Fisher-Yates shuffle
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[options[i], options[j]] = [options[j], options[i]]
        }
        return {
          question: q.question,
          options,
          answer: q.correct_answer,
          difficulty: q.difficulty,
          category: q.category,
        }
      })
      if (questions.length === 0) throw new Error('No trivia found.')
      return { questions }
    },
  },
  {
    id: 'games',
    name: 'Steam Games',
    category: 'web',
    description: 'Game info and current featured deals from the Steam store.',
    llmDescription:
      'Two modes: (1) pass "appid" (Steam app number like 730) to get full game details — name, description, price, genres; (2) pass nothing to get current featured deals and specials on Steam. Use for video game questions and deals.',
    params: [
      { name: 'appid', type: 'string', description: 'Optional Steam appid (e.g. 730). Omit for featured deals.', required: false },
    ],
    sampleArgs: { appid: '730' },
    execute: async (args) => {
      if (args.appid) {
        const appid = String(args.appid).replace(/[^0-9]/g, '')
        if (!appid) throw new Error('appid must be numeric')
        const res = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
          { signal: AbortSignal.timeout(15_000) }
        )
        if (!res.ok) throw new Error(`Steam responded ${res.status}`)
        const data = (await res.json()) as Record<string, { success?: boolean; data?: Record<string, unknown> }>
        const entry = data[appid]
        if (!entry?.success || !entry.data) throw new Error(`Steam app ${appid} not found.`)
        const d = entry.data
        const price = d.price_overview as { final_formatted?: string } | undefined
        return {
          name: d.name,
          type: d.type,
          description: String(d.short_description ?? '').slice(0, 800),
          genres: (d.genres as Array<{ description?: string }> | undefined)?.map((g) => g.description),
          price: price?.final_formatted ?? (d.is_free ? 'Free' : 'Unknown'),
          releaseDate: (d.release_date as { date?: string } | undefined)?.date,
          website: d.website,
          appId: appid,
        }
      }
      // Featured deals
      const res = await fetch('https://store.steampowered.com/api/featuredcategories/?cc=us&l=en', {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`Steam responded ${res.status}`)
      const data = (await res.json()) as Record<string, { items?: Array<Record<string, unknown>> }>
      const specials = data.specials?.items?.slice(0, 5) ?? []
      return {
        featuredDeals: specials.map((it) => {
          const price = it.final_price as number | undefined
          const original = it.original_price as number | undefined
          return {
            name: it.name,
            discountedPrice: price !== undefined ? `$${(price / 100).toFixed(2)}` : null,
            originalPrice: original !== undefined ? `$${(original / 100).toFixed(2)}` : null,
            discountPercent: it.discount_percent,
          }
        }),
      }
    },
  },
  {
    id: 'news',
    name: 'World News',
    category: 'web',
    description: 'Top world headlines from BBC News RSS.',
    llmDescription:
      'Gets the latest world news headlines from BBC News. Returns title, link, and publication date for each story. Use for current events and news questions.',
    params: [],
    sampleArgs: {},
    execute: async () => {
      const res = await fetch('https://feeds.bbci.co.uk/news/world/rss.xml', {
        headers: { 'User-Agent': 'NEXUS-AI/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`News feed responded ${res.status}`)
      const xml = await res.text()
      const items: Array<{ title: string; link: string; date: string; description: string }> = []
      const itemRegex = /<item>([\s\S]*?)<\/item>/g
      let match
      while ((match = itemRegex.exec(xml)) !== null && items.length < 6) {
        const block = match[1]
        items.push({
          title: (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '').trim(),
          link: (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim(),
          date: (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '').trim(),
          description: (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? '')
            .replace(/<[^>]+>/g, '')
            .trim()
            .slice(0, 200),
        })
      }
      if (items.length === 0) throw new Error('News feed returned no stories.')
      return { source: 'BBC World News', stories: items }
    },
  },

  {
    id: 'worldbank',
    name: 'World Data',
    category: 'knowledge',
    description: 'World Bank economic indicators: GDP, population, inflation for any country.',
    llmDescription:
      'Gets World Bank economic data by country and indicator. Use ISO-3 country codes (ARE, USA, GBR, DEU) and indicator codes: NY.GDP.MKTP.CD (GDP), SP.POP.TOTL (population), FP.CPI.TOTL.ZG (inflation), SL.UEM.TOTL.ZS (unemployment). Returns recent yearly values.',
    params: [
      { name: 'country', type: 'string', description: 'ISO-3 code, e.g. "ARE" or "USA"', required: true },
      { name: 'indicator', type: 'string', description: 'Indicator code (default GDP): NY.GDP.MKTP.CD', required: false },
    ],
    sampleArgs: { country: 'ARE', indicator: 'NY.GDP.MKTP.CD' },
    execute: async (args) => {
      const country = String(args.country).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
      if (country.length !== 3) throw new Error('Use a 3-letter country code like "ARE"')
      const indicator = String(args.indicator ?? 'NY.GDP.MKTP.CD').replace(/[^A-Z0-9.]/g, '')
      const res = await fetch(
        `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=8`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!res.ok) throw new Error(`World Bank API responded ${res.status}`)
      const data = (await res.json()) as Array<
        | { message?: string }
        | Array<{ date?: string; value?: number | null; country?: { value?: string } }>
      >
      const rows = Array.isArray(data[1]) ? data[1] : []
      if (rows.length === 0) throw new Error(`No data for ${country}/${indicator}`)
      const withValues = rows.filter((r) => r.value !== null && r.value !== undefined)
      return {
        country: rows[0]?.country?.value ?? country,
        indicator,
        data: withValues.slice(0, 6).map((r) => ({ year: r.date, value: r.value })),
      }
    },
  },
  {
    id: 'poetry',
    name: 'Poetry',
    category: 'knowledge',
    description: 'Classic poetry by theme, author, or title — full texts.',
    llmDescription:
      'Searches classic poetry (PoetryDB). Search by theme/title or author. Returns full poem lines. Use for poems, quotes, literary requests, or humanities questions.',
    params: [
      { name: 'query', type: 'string', description: 'Theme, title, or emotion (e.g. "love", "moon")', required: true },
      { name: 'author', type: 'string', description: 'Optional author name (e.g. "Shakespeare")', required: false },
    ],
    sampleArgs: { query: 'love' },
    execute: async (args) => {
      const query = String(args.query).trim().replace(/\s+/g, '+').slice(0, 60)
      const author = args.author ? String(args.author).trim().replace(/\s+/g, '+') : ''
      if (!query && !author) throw new Error('A search query is required')
      const url = author
        ? `https://poetrydb.org/author/${author}/title,lines`
        : `https://poetrydb.org/title/${query}/title,author,lines`
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`Poetry database responded ${res.status}`)
      const data = (await res.json()) as
        | Array<{ title?: string; author?: string; lines?: string[] }>
        | { status?: number }
      if (!Array.isArray(data) || data.length === 0) {
        // Try author search as fallback
        if (!author) {
          const alt = await fetch(`https://poetrydb.org/lines/${query}/title,author,lines`, {
            signal: AbortSignal.timeout(15000),
          })
          const altData = (await alt.json()) as Array<{ title?: string; author?: string; lines?: string[] }>
          if (Array.isArray(altData) && altData.length > 0) {
            return {
              poems: altData.slice(0, 2).map((p) => ({
                title: p.title,
                author: p.author,
                excerpt: (p.lines ?? []).slice(0, 12).join('\n'),
              })),
            }
          }
        }
        throw new Error(`No poems found for "${query}"`)
      }
      return {
        poems: data.slice(0, 3).map((p) => ({
          title: p.title,
          author: p.author,
          excerpt: (p.lines ?? []).slice(0, 14).join('\n'),
        })),
      }
    },
  },
  {
    id: 'bible',
    name: 'Bible Verses',
    category: 'knowledge',
    description: 'Look up any Bible passage by reference.',
    llmDescription:
      'Looks up Bible passages by reference (e.g. "John 3:16", "Psalm 23", "Genesis 1:1-3"). Returns the verse text. Use for scripture, religious, or humanities questions.',
    params: [
      { name: 'reference', type: 'string', description: 'Bible reference, e.g. "John 3:16" or "Psalm 23:1"', required: true },
    ],
    sampleArgs: { reference: 'John 3:16' },
    execute: async (args) => {
      const ref = String(args.reference).trim().slice(0, 60)
      if (!ref) throw new Error('A Bible reference is required')
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Bible API responded ${res.status}`)
      const data = (await res.json()) as {
        reference?: string
        text?: string
        verses?: Array<{ book_name?: string; chapter?: number; verse?: number; text?: string }>
        error?: string
      }
      if (data.error) throw new Error(data.error)
      if (!data.text) throw new Error(`No passage found for "${ref}"`)
      return {
        reference: data.reference ?? ref,
        text: data.text.trim().slice(0, 3000),
        verseCount: data.verses?.length ?? 1,
      }
    },
  },

  /* ---------------- Email connectors (real account actions) ---------------- */

  {
    id: 'email_list',
    name: 'My Inbox',
    category: 'email',
    description: 'Read your latest emails — real messages from your connected account.',
    llmDescription:
      'Lists the most recent emails from the user\u2019s connected email inbox. Returns subject, sender, and date. Use when the user asks to check their inbox or see new emails.',
    params: [
      { name: 'limit', type: 'string', description: 'Optional: how many emails (1-15, default 8)', required: false },
    ],
    sampleArgs: { limit: '5' },
    requiresAccount: true,
    execute: async (args, ctx) => {
      const account = await getPrimaryAccount(ctx?.userId)
      if (!account) {
        return {
          error: 'No email account connected. Ask the user to connect one in the Connectors hub (Accounts section).',
        }
      }
      const limit = Math.min(Math.max(parseInt(String(args.limit ?? '8')) || 8, 1), 15)
      const { emails, total } = await listEmails(account, { limit })
      return {
        account: account.email,
        totalInInbox: total,
        emails: emails.map((e) => ({
          uid: e.uid,
          subject: e.subject,
          from: e.fromName ? `${e.fromName} <${e.from}>` : e.from,
          date: e.date,
        })),
        tip: 'Use email_read with a uid to read the full message.',
      }
    },
  },
  {
    id: 'email_search',
    name: 'Search Mail',
    category: 'email',
    description: 'Search your real mailbox by subject or sender.',
    llmDescription:
      'Searches the user\u2019s connected mailbox by subject or sender keyword. Use when the user looks for a specific email ("find the invoice from Acme").',
    params: [
      { name: 'query', type: 'string', description: 'Subject or sender keyword to search for', required: true },
    ],
    sampleArgs: { query: 'invoice' },
    requiresAccount: true,
    execute: async (args, ctx) => {
      const account = await getPrimaryAccount(ctx?.userId)
      if (!account) {
        return { error: 'No email account connected. Ask the user to connect one in the Connectors hub.' }
      }
      const query = String(args.query).trim().slice(0, 100)
      if (!query) throw new Error('A search query is required')
      const { matches } = await searchEmails(account, query)
      return {
        account: account.email,
        query,
        matches: matches.map((m) => ({
          uid: m.uid,
          subject: m.subject,
          from: m.fromName ? `${m.fromName} <${m.from}>` : m.from,
          date: m.date,
        })),
      }
    },
  },
  {
    id: 'email_read',
    name: 'Read Email',
    category: 'email',
    description: 'Read the full content of an email by its number.',
    llmDescription:
      'Reads the full text of an email by its uid (the number shown in email_list or email_search results). Use after listing to get details or summarize a specific message.',
    params: [
      { name: 'uid', type: 'string', description: 'The email uid from email_list/email_search', required: true },
    ],
    sampleArgs: { uid: '1' },
    requiresAccount: true,
    execute: async (args, ctx) => {
      const account = await getPrimaryAccount(ctx?.userId)
      if (!account) {
        return { error: 'No email account connected. Ask the user to connect one in the Connectors hub.' }
      }
      const uid = parseInt(String(args.uid).replace(/[^0-9]/g, ''))
      if (!uid) throw new Error('A numeric email uid is required')
      const email = await readEmail(account, uid)
      return { account: account.email, ...email }
    },
  },
  {
    id: 'email_send',
    name: 'Send Email',
    category: 'email',
    description: 'Send a real email from your connected account.',
    llmDescription:
      'Sends an actual email from the user\u2019s connected account. Requires "to" (email address), "subject", and "body". ALWAYS confirm with the user before sending unless they explicitly asked to send. After sending, report the recipient and subject.',
    params: [
      { name: 'to', type: 'string', description: 'Recipient email address', required: true },
      { name: 'subject', type: 'string', description: 'Email subject line', required: true },
      { name: 'body', type: 'string', description: 'Email body text', required: true },
    ],
    sampleArgs: { to: 'friend@example.com', subject: 'Hello', body: 'Just checking in!' },
    requiresAccount: true,
    execute: async (args, ctx) => {
      const account = await getPrimaryAccount(ctx?.userId)
      if (!account) {
        return { error: 'No email account connected. Ask the user to connect one in the Connectors hub.' }
      }
      const to = String(args.to).trim()
      const subject = String(args.subject).trim().slice(0, 200)
      const body = String(args.body).trim().slice(0, 8000)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('A valid recipient email is required')
      if (!subject) throw new Error('A subject is required')
      if (!body) throw new Error('An email body is required')
      const result = await sendEmail(account, { to, subject, body })
      return {
        sent: true,
        from: account.email,
        to,
        subject,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      }
    },
  },

  /* ----- Public-API additions (free, no key, HTTPS+ CORS) ----- */

  // Source: https://api.spaceflightnewsapi.net/v4/articles/ (public-apis: News → Spaceflight News)
  // Free, no API key, no rate limit for non-commercial use. Returns JSON {count, results[]}.
  // Distinct from the existing `news` connector (BBC World headlines) and the `space`
  // connector (rocket launch schedule) — this is dedicated spaceflight *news articles*
  // with full text, source site, image, and publish time. Useful for "what's new in space"
  // questions, current mission coverage, and aerospace industry news.
  {
    id: 'space_news',
    name: 'Spaceflight News',
    category: 'web',
    description: 'Latest spaceflight news articles from major outlets (SpaceNews, NASA, ESA, etc.).',
    llmDescription:
      'Gets the latest spaceflight and aerospace news articles. Each result has a title, source site, summary, image, URL, and publish time. Use for current space news, mission coverage, SpaceX/NASA updates, satellite industry, and "what\'s new in space" questions.',
    params: [
      { name: 'query', type: 'string', description: 'Optional search term (e.g. "Starship", "Mars", "Artemis"). Omit for top headlines.', required: false },
      { name: 'limit', type: 'string', description: 'Optional count (1-6, default 4)', required: false },
    ],
    sampleArgs: { query: 'Starship' },
    execute: async (args) => {
      const limit = Math.min(Math.max(parseInt(String(args.limit ?? '4')) || 4, 1), 6)
      const query = args.query ? String(args.query).trim().slice(0, 100) : ''
      const url = query
        ? `https://api.spaceflightnewsapi.net/v4/articles/?limit=${limit}&search=${encodeURIComponent(query)}`
        : `https://api.spaceflightnewsapi.net/v4/articles/?limit=${limit}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NEXUS-AI/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`Spaceflight News API responded ${res.status}`)
      const data = (await res.json()) as {
        count?: number
        results?: Array<{
          title?: string
          summary?: string
          url?: string
          image_url?: string
          news_site?: string
          published_at?: string
        }>
      }
      const items = (data.results ?? []).slice(0, limit)
      if (items.length === 0) throw new Error(query ? `No spaceflight news found for "${query}"` : 'No spaceflight news available right now')
      return {
        query: query || null,
        totalAvailable: data.count,
        articles: items.map((a) => ({
          title: a.title ?? '',
          source: a.news_site ?? null,
          summary: (a.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 280),
          url: a.url ?? null,
          imageUrl: a.image_url ?? null,
          publishedAt: a.published_at ?? null,
        })),
      }
    },
  },

  // Source: https://air-quality-api.open-meteo.com/v1/air-quality (public-apis: Environment → Open-Meteo)
  // Free, no API key, no auth. Same vendor as the existing `forecast` connector.
  // Returns PM2.5, PM10, carbon monoxide, ozone, NO2, SO2 — common air-quality metrics.
  // Pairs naturally with geocode → air_quality (place → coords → pollution) and complements
  // the weather/forecast connectors for health-conscious "is the air safe today" questions.
  {
    id: 'air_quality',
    name: 'Air Quality',
    category: 'web',
    description: 'Current air pollution levels (PM2.5, PM10, CO, O3, NO2, SO2) by coordinates.',
    llmDescription:
      'Gets current air quality readings for latitude/longitude coordinates. Returns PM2.5, PM10 (particulates), carbon monoxide (CO), ozone (O3), nitrogen dioxide (NO2), sulphur dioxide (SO2) in μg/m³. Chain after the geocode connector for "air quality in [city]" questions, or use directly when the user gives coordinates. Use for health, asthma, pollution, outdoor activity, and "is the air safe" questions.',
    params: [
      { name: 'latitude', type: 'string', description: 'Latitude, e.g. 25.1972', required: true },
      { name: 'longitude', type: 'string', description: 'Longitude, e.g. 55.2744', required: true },
    ],
    sampleArgs: { latitude: '25.1972', longitude: '55.2744' },
    execute: async (args) => {
      const lat = String(args.latitude).replace(/[^0-9.\-]/g, '')
      const lon = String(args.longitude).replace(/[^0-9.\-]/g, '')
      if (!lat || !lon) throw new Error('latitude and longitude are required')
      // NOTE: use fetchJson() helper (not raw fetch) — Open-Meteo rejects requests
      // without a User-Agent header (returns ETIMEDOUT). The helper sets one.
      const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index` +
        `&timezone=auto`
      const data = (await fetchJson(url)) as {
        current?: Record<string, number | string>
        current_units?: Record<string, string>
      }
      const c = data.current ?? {}
      const units = data.current_units ?? {}
      // Translate raw field names into friendly labels for the LLM
      return {
        coordinates: { lat, lon },
        measuredAt: c.time ?? null,
        readings: {
          pm25: { value: c.pm2_5 ?? null, unit: units.pm2_5 ?? 'μg/m³' },
          pm10: { value: c.pm10 ?? null, unit: units.pm10 ?? 'μg/m³' },
          carbonMonoxide: { value: c.carbon_monoxide ?? null, unit: units.carbon_monoxide ?? 'μg/m³' },
          nitrogenDioxide: { value: c.nitrogen_dioxide ?? null, unit: units.nitrogen_dioxide ?? 'μg/m³' },
          sulphurDioxide: { value: c.sulphur_dioxide ?? null, unit: units.sulphur_dioxide ?? 'μg/m³' },
          ozone: { value: c.ozone ?? null, unit: units.ozone ?? 'μg/m³' },
          uvIndex: { value: c.uv_index ?? null, unit: units.uv_index ?? 'index' },
        },
        // WHO 24-hour guideline benchmarks — let the LLM contextualise for the user
        benchmarks: {
          pm25_who_24h_ugm3: 15,
          pm10_who_24h_ugm3: 45,
          note: 'WHO 2021 24-hour air-quality guidelines. Higher = worse. PM2.5 above 15 μg/m³ exceeds the daily limit.',
        },
      }
    },
  },

  // Source: https://itunes.apple.com/search (public-apis: Music → iTunes Search API)
  // Free, no API key, no auth. Returns rich JSON: track name, artist, album, artwork, preview clip URL,
  // release date, genre. Supports entity filter for song/podcast/audiobook/movie/tv-episode.
  // Distinct from the existing `poetry` connector (classic poems only) — this is popular
  // music, podcasts, audiobooks, and media. Useful for "find me a song by X", "podcasts about Y",
  // audiobook discovery, and song identification.
  {
    id: 'music',
    name: 'Music & Podcasts',
    category: 'knowledge',
    description: 'Search songs, podcasts, audiobooks, and albums on the iTunes catalog.',
    llmDescription:
      'Searches the iTunes / Apple Music catalog for songs, podcasts, audiobooks, and albums. Returns the track name, artist, album/collection, artwork URL, preview clip URL (30-second audio), release date, and genre. Use entity=song for music, entity=podcast for shows, entity=audiobook for audiobooks. Use for "find me a song by [artist]", "podcasts about [topic]", "audiobooks by [author]", music discovery, or "what album is X from" questions.',
    params: [
      { name: 'query', type: 'string', description: 'Search term: song name, artist, album, or podcast topic', required: true },
      { name: 'entity', type: 'string', description: 'Optional: song, podcast, audiobook, musicArtist, or album (default song)', required: false },
      { name: 'limit', type: 'string', description: 'Optional count (1-6, default 4)', required: false },
    ],
    sampleArgs: { query: 'Daft Punk', entity: 'song' },
    execute: async (args) => {
      const term = String(args.query).trim().slice(0, 100)
      if (!term) throw new Error('A search term is required')
      const entityRaw = args.entity ? String(args.entity).trim().toLowerCase() : 'song'
      const entity = ['song', 'podcast', 'audiobook', 'musicalbum', 'musicartist', 'album'].includes(entityRaw)
        ? entityRaw
        : 'song'
      const limit = Math.min(Math.max(parseInt(String(args.limit ?? '4')) || 4, 1), 6)
      const params = new URLSearchParams({
        term,
        entity,
        limit: String(limit),
        media: entity === 'audiobook' ? 'audiobook' : entity === 'podcast' ? 'podcast' : 'music',
      })
      const res = await fetch(`https://itunes.apple.com/search?${params}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`iTunes Search API responded ${res.status}`)
      const data = (await res.json()) as {
        resultCount?: number
        results?: Array<{
          trackName?: string
          artistName?: string
          collectionName?: string
          artworkUrl100?: string
          previewUrl?: string
          trackViewUrl?: string
          collectionViewUrl?: string
          releaseDate?: string
          primaryGenreName?: string
          trackTimeMillis?: number
          kind?: string
        }>
      }
      const items = (data.results ?? []).slice(0, limit)
      if (items.length === 0) throw new Error(`No results for "${term}"`)
      return {
        query: term,
        entity,
        resultCount: data.resultCount ?? items.length,
        results: items.map((r) => ({
          title: r.trackName ?? r.collectionName ?? null,
          artist: r.artistName ?? null,
          album: r.collectionName ?? null,
          genre: r.primaryGenreName ?? null,
          artwork: r.artworkUrl100 ?? null,
          previewUrl: r.previewUrl ?? null,
          itunesUrl: r.trackViewUrl ?? r.collectionViewUrl ?? null,
          releaseDate: r.releaseDate ?? null,
          durationMs: r.trackTimeMillis ?? null,
        })),
      }
    },
  },
]

export const CONNECTOR_MAP = new Map(CONNECTORS.map((c) => [c.id, c]))

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const VALID_SIZES = ['1024x1024', '1344x768', '768x1344']

export function validateConnectorArgs(
  connector: ConnectorDefinition,
  args: Record<string, unknown>
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  for (const param of connector.params) {
    const value = args[param.name]
    if (param.required && (value === undefined || value === null || String(value).trim() === '')) {
      return { ok: false, error: `Missing required parameter "${param.name}"` }
    }
  }
  // Reject unexpected parameters (strict schema — OWASP: validate expected input formats)
  const allowed = new Set(connector.params.map((p) => p.name))
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) return { ok: false, error: `Unknown parameter "${key}"` }
  }
  // Length guards
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 3000) {
      return { ok: false, error: `Parameter "${key}" is too long` }
    }
  }
  if (connector.id === 'generate_image' && args.size && !VALID_SIZES.includes(String(args.size))) {
    return { ok: false, error: 'Invalid size' }
  }
  return { ok: true, args }
}

export const zodConnectorTestSchema = z.object({
  id: z.string().min(1).max(40),
  args: z.record(z.string(), z.unknown()).default({}),
})
