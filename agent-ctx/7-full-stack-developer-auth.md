# Task 7 — full-stack-developer-auth

## Task
Build real email/password auth for NEXUS AI, replacing the unconfigured Supabase flow. Server-side helpers (bcrypt + JWT), four API routes (signup/signin/signout/me), a Zustand-backed client hook (`useAuth`), and a rewritten email/password AuthModal.

## Work Log

### Files created
- `src/lib/auth.ts` — server-side helpers: `hashPassword` (bcryptjs 10 rounds), `verifyPassword`, `signToken` (Jose HS256, 30-day expiry, `AUTH_SECRET || 'nexus-dev-secret-change-me'`), `verifyToken`, `getSession(req)` (reads `nexus-session` cookie), `getCurrentUser(req)` (db.user.findUnique, selects WITHOUT passwordHash), `setSessionCookie(res, token)` (httpOnly, lax, secure-in-prod, 30-day maxAge), `clearSessionCookie(res)`. Also exports `SESSION_COOKIE_NAME = 'nexus-session'`.
- `src/app/api/auth/signup/route.ts` — POST. Validates `{ email, password (min 8), name? }` with zod. Returns 400 on bad input, 409 if email already exists (`{ error: 'An account with this email already exists.' }`). Hashes password, creates user, signs token, sets cookie, returns `{ user: { id, email, name } }` with 201.
- `src/app/api/auth/signin/route.ts` — POST. Validates `{ email, password }`. Looks up user by email (case-insensitive normalized). Returns 401 `{ error: 'Invalid email or password.' }` for unknown email OR wrong password (same generic message to avoid user enumeration). Signs token, sets cookie, returns `{ user: { id, email, name } }`.
- `src/app/api/auth/signout/route.ts` — POST. Clears session cookie, returns `{ ok: true }`.
- `src/app/api/auth/me/route.ts` — GET. Reads cookie, verifies token, looks up user. Always returns 200 — `{ user: { id, email, name, interests, commStyle } }` if authenticated, `{ user: null }` otherwise. Parses `interests` JSON string into an array.
- `src/hooks/use-auth.ts` — 'use client'. Zustand store (`useAuthStore`) with state `{ user, loading, error }` and actions `fetchMe`, `signIn`, `signUp`, `signOut`, `clearError`. Exports convenience hook `useAuth()` that lazy-calls `fetchMe()` on first consumer mount (module-level `fetchedOnce` guard, never runs on the server). Uses `credentials: 'include'` so the httpOnly cookie rides along automatically.
- `src/components/omni/auth-modal.tsx` — full rewrite. Self-contained email/password modal. Props: `{ open, onClose, initialMode? }`. Tabbed UI ("Sign in" / "Create account"), form fields (name on signup only, email, password), inline validation (email regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, password min 8 chars), inline error below form, loading state on submit button, framer-motion fade+scale entrance, `bg-black/40` overlay, max-w-sm card, rounded-xl, auto-focus first field on open, Esc-to-close, click-outside-to-close.

### File modified
- `src/lib/db.ts` — added a dev-only safety net: if `globalForPrisma.prisma` exists but its `.user` accessor is undefined (i.e. it was cached before the User model existed), discard the singleton so a fresh PrismaClient is built. (Did NOT touch any API route or page.tsx per task constraints.)

### Critical fix encountered
The dev server was started at 05:25, BEFORE Task 6 ran `prisma generate` to add the `User` model. As a result, `db.user` was `undefined` at runtime (the @prisma/client module cache in the running Node process predated the User model). I tried require.cache busting from inside db.ts but `bustedCount = 0` — Next.js 16's Turbopack uses the ESM module cache which is not mutable from runtime code. The fix was to touch `next.config.ts` to trigger Next's built-in "config changed → restart" behavior. After restart, the fresh @prisma/client was loaded and `db.user is defined = true`. The dev.log captures this transition:
```
⚠ Found a change in next.config.ts. Restarting the server to apply the changes...
[db.ts] db.user is defined = true
POST /api/auth/signup 201 in 518ms
```

The db.ts now also includes the singleton-staleness check as a safety net for future schema changes.

### Verification — all passing

`bun run lint` → **clean** (0 errors, 0 warnings).

Dev log shows **no 500s** and clean compiles for every endpoint after the restart.

Endpoint smoke tests (raw curl outputs):
```
GET /api/auth/me (no session)              → 200 {"user":null}
POST /api/auth/signup (new user)           → 201 {"user":{"id":"cmt6...","email":"test@nexus.ai","name":"Test User"}}
                                            + Set-Cookie: nexus-session=eyJhbGc...; HttpOnly; SameSite=lax; Max-Age=2592000
POST /api/auth/signup (duplicate email)    → 409 {"error":"An account with this email already exists."}
POST /api/auth/signup (short password)     → 400 {"error":"Password must be at least 8 characters"}
POST /api/auth/signup (invalid email)      → 400 {"error":"Invalid email address"}
POST /api/auth/signin (correct creds)      → 200 {"user":{...}} + Set-Cookie
POST /api/auth/signin (wrong password)    → 401 {"error":"Invalid email or password."}
POST /api/auth/signin (unknown email)      → 401 {"error":"Invalid email or password."}  (same message — no enumeration)
GET /api/auth/me (with cookie)             → 200 {"user":{"id":...,"email":...,"name":...,"interests":[],"commStyle":"balanced"}}
POST /api/auth/signout                     → 200 {"ok":true} + Set-Cookie: nexus-session=; Max-Age=0
GET /api/auth/me (after signout)           → 200 {"user":null}
```

## Stage Summary

Real email/password auth is live end-to-end:
- Passwords hashed with bcryptjs (10 rounds), never stored or returned in plaintext.
- Sessions are httpOnly JWT cookies (Jose HS256, 30-day expiry, signed with `AUTH_SECRET` env or dev fallback). Secure flag active only in production.
- Four `/api/auth/*` endpoints cover the full lifecycle (signup / signin / signout / me) with proper status codes, validation, and identical-generic signin errors to avoid user enumeration.
- Client state lives in a Zustand store (`useAuthStore`) and is hydrated lazily on first consumer mount via the `useAuth()` hook (no SSR fetching). All actions throw on failure so the calling component can surface inline errors.
- The new `AuthModal` is a self-contained shadcn-styled tabbed modal with Framer Motion entrance, inline validation, and auto-focus — ready to drop into `page.tsx`.

### What the main agent needs to know to integrate

**Hook:** `useAuth()` from `@/hooks/use-auth`. Returns `{ user, loading, error, fetchMe, signIn, signUp, signOut, clearError }`. The `user` shape is `{ id, email, name, interests: string[], commStyle: string } | null`. The hook auto-fetches `/api/auth/me` on first consumer mount — just call `useAuth()` anywhere in the client tree.

**Component:** `<AuthModal open={boolean} onClose={() => void} initialMode?: 'signin' | 'signup' />` from `@/components/omni/auth-modal`.

**Integration sketch for `src/app/page.tsx`** (left for the main agent to actually wire):
```tsx
import { AuthModal } from '@/components/omni/auth-modal'
import { useAuth } from '@/hooks/use-auth'

// inside NexusApp or Profile:
const { user, signOut } = useAuth()
const [authOpen, setAuthOpen] = useState(false)
const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

// Trigger from profile button / "Sign in" CTA:
<Button onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}>Sign in</Button>
<Button onClick={() => { setAuthMode('signup'); setAuthOpen(true) }}>Create account</Button>

// Render once near the root:
<AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />

// Sign-out:
<Button onClick={() => void signOut()}>Sign out</Button>

// Display name fallback: use `user?.name` first, then preferences.name, then "Guest".
```

**Notes / gotchas:**
1. The `nexus-session` cookie is httpOnly so client JS can't read it directly — that's expected. The `useAuth()` hook handles hydration by calling `/api/auth/me` on mount.
2. The `name` field defaults to `""` in the DB schema. The `/me` endpoint returns it as-is; UI may want to fall back to the email local-part when `name` is empty.
3. `interests` is stored as a JSON-string column (SQLite has no array type). `/me` parses it back to `string[]` for the client. When the main agent wires onboarding completion to the database, it should POST the array as JSON to a new endpoint (e.g. `PATCH /api/auth/me` or `POST /api/auth/onboarding`) — not yet built; this task only covers signup/signin/signout/me.
4. The auth cookie is `sameSite=lax` and `secure` only in `NODE_ENV=production`. In dev it will be sent over plain HTTP, which is fine for local testing.
5. There is **no middleware protecting routes** — every API route that needs auth should call `getCurrentUser(req)` from `@/lib/auth` and return 401 if null. The `/api/auth/me` route is the reference implementation.
6. If future Prisma schema migrations add new models and the dev server was already running, the db.ts singleton-staleness check will auto-clear the cached instance — but if the @prisma/client module itself is stale, the dev server must be restarted (touch `next.config.ts`).
