# Task 2-b — full-stack-developer — email action API routes

## What I built
Four new App Router API routes that expose the IMAP/SMTP functions already
implemented in `src/lib/email.ts` (left untouched).

| File | Method | Backing function | Rate limit |
|------|--------|------------------|------------|
| `src/app/api/email/inbox/route.ts` | GET | `listEmails` | `inbox:${ip}` 20/60s |
| `src/app/api/email/search/route.ts` | POST | `searchEmails` | `email-search:${ip}` 20/60s |
| `src/app/api/email/send/route.ts` | POST | `sendEmail` | `email-send:${ip}` 10/60s (stricter) |
| `src/app/api/email/message/[uid]/route.ts` | GET | `readEmail` | `email-read:${ip}` 30/60s |

## Shared contract (all 4 routes)
1. Check rate limit FIRST → 429 with `{ error, retryAfter }` if exceeded.
2. For POST routes: validate body with `zod` after rate-limit check.
3. `getPrimaryAccount()` → if null, 400 `{ error: 'No email account connected.', needsConnect: true }`.
4. Call the corresponding `email.ts` function.
5. Wrap everything in try/catch; on IMAP/SMTP failure, surface `error.message` with status 500 (404 if "not found" in message route), prefix every console.error with `[api/email/...]`.

## Implementation notes for the next agent
- The `[uid]` route uses Next.js 16 async params:
  ```ts
  type RouteContext = { params: Promise<{ uid: string }> }
  const { uid } = await context.params
  ```
- `listEmails` already clamps `limit` to 25 internally — I additionally clamp on the route layer too so the query param can't bypass it.
- The send route logs `[api/email/send] sent <messageId>` on success, as required.
- All routes use the existing `rateLimit(key, max, windowMs)` + `clientKey(req)` helpers from `@/lib/rate-limit` (same pattern as `/api/email/accounts`).
- I did NOT touch `src/lib/email.ts`, `src/lib/db.ts`, `src/lib/rate-limit.ts`, `prisma/schema.prisma`, or the existing `/api/email/accounts` routes.
- `bun run lint` passes clean (0 errors, 0 warnings) on all 4 new files.

## Verified
- `bun run lint` ✓ (no output = no errors)
- All 4 files exist at correct paths ✓
- Routes follow the same patterns as the proven `/api/email/accounts` route ✓

## Open items / hand-off
- The dev server is managed by the sandbox system (`bun run dev` runs automatically). It picks up the new routes on first request via HMR — no restart needed.
- A full runtime smoke test (curl against /api/email/inbox etc.) couldn't be performed from this shell because the dev server isn't directly reachable from the worker process (only via the sandbox preview). The patterns are identical to the already-working `/api/email/accounts` route, so runtime behavior should match. The next agent (main) can smoke-test through the Preview Panel once an EmailAccount is connected in DB.
