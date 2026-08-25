# Task 4 — Auth hardening + user-profile/avatar routes

**Agent:** full-stack-developer (auth + profile routes)
**Task:** Harden `src/lib/auth.ts` secret resolution, rate-limit the auth (signin/signup) routes, expose Task-3's new `User` profile fields through `/api/auth/me` and two new routes (`/api/user/profile` GET+PATCH, `/api/user/avatar` POST), and extend the Zustand `useAuth` store with `updateProfile` + `uploadAvatar` actions.

## Work Log

1. **Read previous work** — read `worklog.md` (chunks) and confirmed Task 7's auth system + Task 3's extended `User` schema (avatarUrl?, bio?, location?, timezone?, language, jobTitle?, website?, notifications, emailVerified, lastActiveAt?).
2. **Harden `src/lib/auth.ts`** — `getSecret()` now throws `new Error('AUTH_SECRET environment variable is required in production')` when `NODE_ENV === 'production'` and `AUTH_SECRET` is empty/missing. Dev fallback `'nexus-dev-secret-change-me'` kept ONLY for non-production. bcrypt 10 rounds / jose HS256 / 30-day TTL / cookie flags all unchanged.
3. **Rate-limit `src/app/api/auth/signin/route.ts`** — added `rateLimit('auth-signin:'+clientKey(req), 10, 60_000)` at the top of POST, returns 429 `{ error: 'Too many attempts. Wait a minute.' }` if `!rl.ok`. Existing identical-generic 401 logic preserved (unknown email vs wrong password both return same message).
4. **Rate-limit + tighten password schema in `src/app/api/auth/signup/route.ts`** — `rateLimit('auth-signup:'+clientKey(req), 5, 60_000)` → 429. Password zod schema now `min(8).regex(/[A-Za-z]/).regex(/\d/)` (8+ chars, ≥1 letter, ≥1 digit).
5. **Extend `src/app/api/auth/me/route.ts`** — Now calls `getCurrentUser(req)` to verify the session, then does a fresh `db.user.findUnique` with extended `select` (adds avatarUrl, bio, location, timezone, language, jobTitle, website, notifications, emailVerified, lastActiveAt, updatedAt). Returns `{ user: { ... } | null }`. Fire-and-forget presence ping: `void db.user.update({ where: { id }, data: { lastActiveAt: new Date() } }).catch(()=>{})` — never awaited, never blocks the response.
6. **NEW `src/app/api/user/profile/route.ts`** —
   - `GET`: `getCurrentUser(req)` → 401 if missing. Returns the full profile (id, name, email, avatarUrl, bio, location, timezone, language, jobTitle, website, notifications, interests[], commStyle, emailVerified, createdAt, updatedAt).
   - `PATCH`: 401 if not signed in, then strict-zod parse (any unknown key rejected): `name` (1-80), `bio` (≤500), `location` (≤120), `timezone` (≤80 IANA), `language` (enum en/ar), `jobTitle` (≤100), `website` (≤200), `notifications` (bool), `interests` (string[] ≤12 items, each ≤40 chars → JSON.stringify'd for storage), `commStyle` (enum concise/balanced/detailed/friendly). Builds `data` only from provided keys, runs `db.user.update`, returns updated full profile. Rate-limit `profile-update:${clientKey(req)}` 20/min. `export const maxDuration = 30`.
7. **NEW `src/app/api/user/avatar/route.ts`** — `POST` with `getCurrentUser(req)` → 401 if missing. Rate-limit `avatar-upload:${clientKey(req)}` 10/min. Parses `req.formData()`, validates `file.type ∈ {image/png, image/jpeg, image/webp}` (else 400), validates `file.size ≤ 2MB` (else 413). Reads `arrayBuffer` → `Buffer`. Generates safe filename `<base36-timestamp>-<8-hex-random>.<png|jpg|webp>` via `Date.now().toString(36)+'-'+randomBytes(4).toString('hex')`. `fs.mkdirSync(public/avatars, {recursive:true})` + `fs.writeFileSync`. `db.user.update({data:{avatarUrl:'/avatars/'+filename}})`. Cleanup: if the previous `avatarUrl` started with `/avatars/`, best-effort `fs.unlink` (callback-style — never fails the upload on cleanup error). Returns `{ avatarUrl }`. `export const maxDuration = 30`.
8. **Extend `src/hooks/use-auth.ts`** — `AuthUser` interface now has all Task-3 fields (avatarUrl?, bio?, location?, timezone?, language, jobTitle?, website?, notifications, emailVerified, lastActiveAt?, updatedAt?). Added exported `ProfilePatch` type. Added two new actions:
   - `updateProfile(patch: ProfilePatch)`: `PATCH /api/user/profile` with JSON body, sets `user: data.user` on success, throws `Error(message)` on failure.
   - `uploadAvatar(file: File)`: `POST /api/user/avatar` with FormData, sets `user.avatarUrl: data.avatarUrl` on success (spreads current user to preserve other fields), returns the new `avatarUrl` string.
   - The Zustand `create` factory now takes `(set, get)` instead of `(set)` so `uploadAvatar` can read current user.
9. **Created `public/avatars/` directory** — `mkdir -p public/avatars` + `.gitkeep` placeholder so the avatar route works immediately even on a fresh checkout.
10. **Lint** — `cd /home/z/my-project && bun run lint` → exit 0, 0 errors, 0 warnings.

## Files Changed / Created

- **Modified** `src/lib/auth.ts` (hardened `getSecret()` — only this function touched; all other primitives unchanged)
- **Modified** `src/app/api/auth/signin/route.ts` (added rate-limit + import)
- **Modified** `src/app/api/auth/signup/route.ts` (added rate-limit + tightened password zod + import)
- **Modified** `src/app/api/auth/me/route.ts` (extended select, returns new fields, fire-and-forget lastActiveAt)
- **Created** `src/app/api/user/profile/route.ts` (GET + PATCH, strict-zod, rate-limited)
- **Created** `src/app/api/user/avatar/route.ts` (POST, formdata, validates type/size, writes to public/avatars, best-effort cleanup)
- **Modified** `src/hooks/use-auth.ts` (extended `AuthUser`, added `ProfilePatch` type, added `updateProfile` + `uploadAvatar` actions, store factory now `(set, get)`)
- **Created** `public/avatars/.gitkeep` (so the directory exists in git)

## Key code blocks

### auth.ts getSecret() hardening
```ts
function getSecret(): string {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.AUTH_SECRET
    if (!secret || secret.trim() === '') {
      throw new Error('AUTH_SECRET environment variable is required in production')
    }
    return secret
  }
  return process.env.AUTH_SECRET || 'nexus-dev-secret-change-me'
}
```

### signin rate-limit
```ts
export async function POST(req: NextRequest) {
  const rl = rateLimit(`auth-signin:${clientKey(req)}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 })
  // ... existing logic with identical-generic 401 for unknown email / wrong password
}
```

### signup password schema
```ts
password: z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/\d/, 'Password must include at least one digit'),
```

### me route fire-and-forget presence ping
```ts
void db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {})
```

### profile PATCH strict zod (rejects unknown keys)
```ts
const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  // ...
  interests: z.array(z.string().max(40)).max(12).optional(),
  commStyle: z.enum(['concise','balanced','detailed','friendly']).optional(),
}).strict()
```

### avatar upload validation + safe filename
```ts
const ALLOWED_TYPES = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' }
const ext = ALLOWED_TYPES[file.type]  // undefined -> 400
if (file.size > 2*1024*1024) return 413
const filename = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`
fs.mkdirSync(AVATARS_DIR, { recursive: true })
fs.writeFileSync(path.join(AVATARS_DIR, filename), Buffer.from(await file.arrayBuffer()))
// best-effort cleanup of previous /avatars/... (never for external URL)
```

### use-auth updateProfile + uploadAvatar
```ts
updateProfile: async (patch) => {
  const res = await fetch('/api/user/profile', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error ?? 'Update failed')
  const data = await res.json(); set({ user: data.user }); return data.user
},
uploadAvatar: async (file) => {
  const fd = new FormData(); fd.append('file', file)
  const res = await fetch('/api/user/avatar', { method: 'POST', credentials: 'include', body: fd })
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error ?? 'Upload failed')
  const data = await res.json()
  set({ user: { ...get().user!, avatarUrl: data.avatarUrl } })
  return data.avatarUrl
},
```

## Lint status

`cd /home/z/my-project && bun run lint` → **exit 0, 0 errors, 0 warnings.**
No pre-existing errors found in files I didn't touch.

## `public/avatars` directory

Exists at `/home/z/my-project/public/avatars/` (created with `.gitkeep` placeholder so it's preserved in git). The avatar route also calls `fs.mkdirSync(dir, { recursive: true })` defensively on every upload.

## Constraints honored

- Did NOT touch `src/app/page.tsx`, `src/components/omni/*`, `prisma/schema.prisma`.
- Did NOT run `bun run build`.
- All new routes import `rateLimit, clientKey` from `@/lib/rate-limit` and `getCurrentUser` from `@/lib/auth`.
- `auth.ts` only had `getSecret()` modified — bcrypt 10 rounds, jose HS256, 30-day TTL, httpOnly/lax/secure cookie flags all preserved.
- Identical-generic 401 message preserved on signin (no user enumeration).
