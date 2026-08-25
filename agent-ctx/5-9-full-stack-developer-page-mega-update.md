# Task 5-9 — page.tsx mega-update + ProfileEditModal

**Agent:** full-stack-developer
**Task ID:** 5-9
**Files touched (only these):**
- MODIFIED `src/app/page.tsx` (722 → 802 lines, surgical MultiEdits)
- NEW `src/components/omni/profile-edit-modal.tsx` (~285 lines)

**Untouched (per spec):** `legal-page.tsx`, `onboarding.tsx`, `auth-modal.tsx`, `connect-panel.tsx`, `voice-mode-overlay.tsx`, `globals.css`, `use-auth.ts`, `preferences.ts`, any API route.

---

## PART A — Wire LegalPage + Privacy/Terms links

| # | What | Where (final line numbers) |
|---|------|-----------------------------|
| 1 | `import { LegalPage } from '@/components/omni/legal-page'` | page.tsx:48 |
| 2 | `const [legalPage, setLegalPage] = useState<'privacy' \| 'terms' \| null>(null)` | page.tsx:90 |
| 3 | `useEffect` window listener for `'nexus:open-legal'` (reads `e.detail` = `'privacy' \| 'terms'`) | page.tsx:254–263 |
| 4 | `<LegalPage type={legalPage} onClose={...} language={language} />` rendered next to `<AuthModal>`/`<ConnectPanel>` (only when `legalPage !== null`) | page.tsx:313–319 |
| 5 | Two new Personalization rows in the Profile section: "Privacy Policy" and "Terms of Service" (both `FileText` icon) → `setLegalPage('privacy')` / `setLegalPage('terms')` | page.tsx:732–739 |
| 6 | Tiny legal footer at the bottom of the Profile section: `Privacy · Terms · © 2026 NEXUS AI` (each Privacy/Terms calls `setLegalPage`) | page.tsx:753–760 |

## PART B — Avatar + Edit Profile button

| # | What | Where |
|---|------|-------|
| 1 | Profile section avatar: `user?.avatarUrl` ? `<Image src=... width=64 height=64 className="h-16 w-16 rounded-full border-2 border-border object-cover" />` : existing gradient + initial circle (in an `else` branch) | page.tsx:675–687 |
| 2 | "Edit profile" button (Pencil icon) below the avatar, opens `ProfileEditModal`. Visible only when signed in. Rendered as the primary action above Sign out (replaces the lone Sign out button). | page.tsx:706–713 |
| 3 | Sign in / Sign up buttons (signed-out state) untouched | page.tsx:697–705 |

## PART C — NEW `src/components/omni/profile-edit-modal.tsx`

Full-screen overlay (`fixed inset-0 z-50 bg-background`), `mx-auto max-w-2xl flex-col h-[100dvh]`, sticky header + scrollable body + sticky footer. Entrance via `AnimatePresence` (opacity fade).

**Fields (all pre-filled from `useAuth().user`):**
- **Avatar**: 80×80 preview (`<Image>` if `avatarUrl`, else gradient+initial). Hidden `<input type="file" accept="image/png,image/jpeg,image/webp">` triggered by a Pencil overlay button. On change → 2MB guard → `await uploadAvatar(file)` → toast. Loader2 spinner while uploading. "PNG, JPEG, or WebP · max 2 MB" hint.
- **Name** (Input, maxLength 80)
- **Bio** (Textarea, maxLength 500, char counter)
- **Location** (Input, maxLength 120)
- **Timezone** (Select with 23 hardcoded IANA zones — UTC, Africa/Cairo, Asia/Dubai, Asia/Riyadh, Asia/Kolkata, Asia/Shanghai, Asia/Tokyo, Asia/Singapore, Asia/Seoul, Asia/Hong_Kong, Europe/London, Europe/Paris, Europe/Berlin, Europe/Istanbul, Europe/Moscow, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Sao_Paulo, America/Toronto, Australia/Sydney, Pacific/Auckland)
- **Language** (Select: English / العربية → en/ar)
- **Job title** (Input, maxLength 100)
- **Website** (Input, maxLength 200)
- **Interests** (8 chips redefined locally — onboarding.tsx doesn't export them. Toggle on click, max 12, counter)
- **Communication style** (4-segment grid redefined locally — concise/balanced/detailed/friendly with one-line desc each)
- **Notifications** (Switch in a bordered card labeled "Product & update emails")

**Actions:**
- **Save** → `await updateProfile({ name, bio, location, timezone, language, jobTitle, website, interests, commStyle, notifications })` (all trimmed + length-clamped per `ProfilePatch`) → toast "Profile saved" → `onClose()`. Shows Check + Loader2 spinner, disabled while saving/uploading.
- **Cancel** → `onClose()`.

**Extra:** body-scroll lock + ESC-to-close + cleanup on unmount. Only renders content when `open === true` (gated by AnimatePresence), so closed-state cost ≈ 0.

Uses shadcn `Input`, `Textarea`, `Label`, `Switch`, `Button`, `Select` + framer-motion + lucide `X`, `Pencil`, `Loader2`, `Check`, `Sparkles`, `LucideIcon` type. Imports `useAuth`/`ProfilePatch` from `@/hooks/use-auth`, `useToast` from `@/hooks/use-toast`, `CommStyle`/`Interest` types from `@/lib/preferences`.

## PART D — Voice overlay lazy-mount

| # | What | Where |
|---|------|-------|
| 1 | `const [voiceMounted, setVoiceMounted] = useState(false)` | page.tsx:87 |
| 2 | `useEffect(() => { if (voiceOpen) setVoiceMounted(true) }, [voiceOpen])` | page.tsx:241–245 |
| 3 | `{voiceMounted && <VoiceModeOverlay open={voiceOpen} onClose={...} />}` (was unconditional) | page.tsx:304–307 |

Effect: typing in the chat textarea no longer re-evaluates the voice overlay's ~30 hooks until the user has opened voice mode at least once.

## PART E — Visual polish (8 fixes)

| # | What | Where |
|---|------|-------|
| 1 | Root wrapper `flex h-dvh flex-col bg-background` → `nexus-shell bg-background` (sticky-footer rule). Chat-internal-scroll preserved because main row retains `flex min-h-0 flex-1` → root stays at `min-height: 100dvh` even with tall chat content (min-h-0 zeroes the main row's hypothetical main size). | page.tsx:293 |
| 2 | NEW desktop footer: `<footer className="mt-auto hidden h-10 items-center justify-between border-t bg-background/95 px-6 py-3 text-xs text-muted-foreground lg:flex">` with `NEXUS AI · by Mounir Shaaban` (left, moved from old Profile "Built by" credit) and `Privacy · Terms · © 2026` (right, each Privacy/Terms calls `setLegalPage`). Sibling of mobile `<nav>`. | page.tsx:788–798 |
| 3 | Removed inline `pb-[env(safe-area-inset-bottom)]` from the mobile `<nav>` (globals.css already adds it for `nav[aria-label="Primary"]`). No behavior change, no double padding. | page.tsx:768 |
| 4 | Mobile nav active indicator: replaced `absolute -top-px h-0.5 w-10 rounded-full bg-primary` hairline → `absolute inset-x-2 inset-y-1 -z-10 rounded-full bg-primary/10` pill (Apple/Instagram pattern). Same `layoutId="nav-active"` so framer-motion still springs between tabs. | page.tsx:777 |
| 5 | Composer radius: `rounded-[26px]` → `rounded-3xl`, `rounded-l-[26px]` → `rounded-l-3xl`. Pending tool banner `bg-primary/8` → `bg-primary/10`. Send button `hover:brightness-110` → `hover:bg-primary/90`. | page.tsx:516, 540, 542, 559 |
| 6 | Warm TOOL_GRADIENT (no cool/green tones left): `vision`→`from-orange-500 to-rose-500`, `upload`→`from-amber-500 to-orange-500`, `documents`→`from-rose-500 to-pink-500`, `code`→`from-amber-500 to-yellow-500`. Other entries already warm, untouched. | page.tsx:215–220 |
| 7 | Intel dropdown: wrapped the mobile header + desktop chat toolbar + intel `<AnimatePresence>` dropdown in `<div className="relative">…</div>` so the absolute dropdown anchors against the chat header instead of the viewport. All existing children + classes preserved. | page.tsx:370 open, 435 close |
| 8 | Typing indicator: replaced 3 `omni-dot` 1.5×1.5 dots with a left-aligned skeleton bubble: `rounded-2xl bg-secondary/60 px-4 py-3` containing 3 `omni-shimmer` rounded bars (`h-3 w-24`, `h-3 w-32`, `h-3 w-20`) stacked with `gap-2`. The `toolRunningLabel` branch (Loader2 + label) untouched. | page.tsx:499–503 |

---

## Lint + tsc status

- `bun run lint` → **exit 0, ZERO errors, ZERO warnings**.
- `bunx tsc --noEmit --skipLibCheck` filtered to my files (`src/app/page`, `src/components/omni/profile-edit-modal`, `src/components/omni/legal-page`, `src/hooks/use-auth`, `src/lib/preferences`) → **ZERO errors**. Pre-existing tsc errors in unrelated files (api/agent, api/chat/regenerate, api/code/run, api/documents, api/office/*, examples/websocket, skills/*) verified as NOT caused by my edits.
- dev.log: GET / 200 in 39–46ms after edits (compiles cleanly, renders).
- grep verification: ZERO remaining occurrences of `rounded-[26px]`, `bg-primary/8`, `hover:brightness-110`, `pb-[env(safe-area-inset-bottom)]`, `flex h-dvh flex-col`, `omni-dot`, `from-cyan`, `from-teal`, `from-emerald`, `from-green` in page.tsx.

## Deviations from the plan

- **ProfileEditModal avatar preview size**: spec said "80×80" — I rendered at `h-20 w-20` (Tailwind 20 = 5rem = 80px). Same pixel size; just expressed as a Tailwind class for consistency with the existing `h-16 w-16` Profile-section avatar.
- **Interests / CommStyle redefined locally**: confirmed onboarding.tsx does NOT export `INTERESTS` / `STYLES` (only local consts). Spec explicitly allowed this fallback ("reuse the same INTERESTS list from onboarding.tsx if exported; else redefine the 8"). I redefined both with the same 8 interests and 4 comm-style ids as onboarding.tsx, plus a short one-line `desc` for each style.
- **Profile section avatar in `else` branch**: spec said "Else keep the existing gradient + initial circle as the fallback" — implemented via `user?.avatarUrl ? <Image/> : <div className="flex h-16 w-16 …rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500…">{displayInitial}</div>`. Same gradient + initial; just inside an `else` branch so only one of the two renders. The rounded shape on the fallback stays `rounded-2xl` to match the original; the `<Image>` uses `rounded-full` per spec.
- **No changes to the desktop sidebar avatar**: the small `bg-primary/15 text-xs` circle in the desktop sidebar bottom (line 322-326) was not mentioned in the spec; left untouched. Only the Profile section's `h-16 w-16` avatar was made conditional.
- **Body-scroll lock + ESC close on ProfileEditModal**: spec didn't explicitly require these but they match the pattern of other full-screen overlays in the codebase (e.g., voice-mode-overlay, legal-page) and prevent the background from scrolling. Implemented via `document.body.style.overflow = 'hidden'` and a `keydown` ESC listener, both with cleanup.
