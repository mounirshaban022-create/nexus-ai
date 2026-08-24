# Task 2-a — full-stack-developer — /api/answer Perplexity-style engine

## What I built
A new App Router API route: `/home/z/my-project/src/app/api/answer/route.ts`
(580 lines, 18659 bytes). It implements the Perplexity "Pro Search"
methodology as a 6-stage pipeline streamed as NDJSON.

## Pipeline (all stages streamed)
1. **PLAN** — `zai.chat.completions.create` (thinking disabled) breaks the
   query into 2 (quick) or 3–4 (pro) sub-questions as a JSON array.
   `extractJsonArray` helper tolerates markdown fences + balanced brackets.
   Falls back to a single direct search of the original query on parse fail.
2. **SEARCH** — `Promise.all` over plan steps; each calls
   `zai.functions.invoke('web_search', { query, num: 5 })`. Per-step try/catch
   so one failed search doesn't kill the others.
3. **READ** (pro mode only) — dedupes results by hostname, picks top 3
   unique-domain URLs, `POST http://localhost:3000/api/reader` in parallel
   with 20s `AbortSignal.timeout`. Page text truncated to 3000 chars.
4. **SYNTHESIZE** — single LLM prompt: question + per-source `[N]` block
   (title, URL, snippet, optional page text) + optional `[E1]/[E2]` email
   block. Total capped at 12000 chars. System prompt enforces inline
   `[N]` citations and a "Takeaway:" line. On failure →
   `{type:'error',stage:'synthesize'}` + close.
5. **SOURCES** — `{type:'sources', sources:[{n,title,url,host,snippet,favicon,date}]}`
   from deduped results (1-based numbering matching the synthesis prompt).
6. **FOLLOW-UPS** — LLM returns 3 short related questions as JSON array.
7. **DONE**.

## Email integration (optional)
When `includeEmail === true`:
- Dynamic `import('@/lib/email')` (keeps cold start light when not used).
- Runs `searchEmails(account, query, { limit: 5 })` in parallel with web
  searches (the email Promise kicks off alongside the searches).
- If `getPrimaryAccount()` returns null → `{type:'email_skipped', reason:'No email account connected'}`.
- Otherwise → `{type:'email_search_done', matches:[{subject,from,date,snippet}]}`.
- Emails are cited in synthesis as `[E1]/[E2]` (separate numbering from web `[1]/[2]`).

## NDJSON event types streamed (13 total)
`plan`, `search_start`, `search_done` (+ optional `error` sub-field),
`email_search_done`, `email_skipped`, `read_start`, `read_done`
(+ optional `error` sub-field), `synthesize_start`, `answer`, `sources`,
`followups`, `done`, `error` (with `stage: 'synthesize' | 'pipeline'`).

## Implementation notes
- Streaming: `ReadableStream<Uint8Array>` + `TextEncoder` + `send()` helper
  guarded by a `closed` flag so enqueues from concurrent `Promise.all`
  callbacks can't throw after `controller.close()`. `finally` block always
  closes.
- Headers: `Content-Type: application/x-ndjson; charset=utf-8`,
  `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`
  (mirrors `/api/chat`).
- Rate limit: `rateLimit(`answer:${clientKey(req)}`, 10, 60_000)` →
  429 with `Retry-After`.
- `export const maxDuration = 120`.
- zod schema: `{ query: 1–2000 chars required, mode: 'quick'|'pro' default 'pro', includeEmail: boolean default false }`.
- All z-ai-web-dev-sdk calls go through `getZAI()`.
- Defensive `Array.isArray` checks on `web_search` results.
- Reader 4xx/non-2xx → `read_done` with `wordCount:0` + `error` sub-field.

## Verification
- `bun run lint` ✓ (no output = 0 errors, 0 warnings)
- File exists at `/home/z/my-project/src/app/api/answer/route.ts` ✓ (580 lines)
- Read worklog.md before starting (Tasks 0–12-audit) ✓
- Read peer agent 2-b's work record to coordinate email integration ✓

## Open items / hand-off
- I did NOT touch any other files. The route will be picked up by HMR on first
  request to `/api/answer` (the dev server is managed by the sandbox system).
- Runtime smoke-test (curl against `/api/answer`) wasn't possible from this
  shell — the dev server is only reachable through the sandbox Preview Panel.
  The patterns mirror the proven `/api/chat` and `/api/search` routes
  (TextEncoder/ReadableStream/send helper, rate-limit-first, zod-first-parse).
- Ready for the main agent to build a frontend AnswerMode renderer that
  consumes this NDJSON stream: plan step chips → source cards (with favicons) →
  cited Markdown answer → follow-up question chips.
