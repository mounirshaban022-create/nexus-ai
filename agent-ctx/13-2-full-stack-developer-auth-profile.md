# Task 13-2 — Auth Landing + Profile Page (NEW FILES)

Agent: full-stack-developer (Task ID 13-2)
Target: Build two NEW standalone components to fix the user's two complaints:
  1. No dedicated auth/profile landing page BEFORE the chat
  2. Profile is currently a basic inline section — user wants Instagram-style profile design

## Files Created (NEW ONLY — no existing files modified)

### FILE 1: /home/z/my-project/src/components/omni/auth-landing.tsx (314 lines)
- Default + named export: `AuthLanding`
- Props (AuthLandingProps):
  - `onSignIn: () => void`         — wired to "Continue with email" primary CTA + the "Sign in" secondary button
  - `onSignUp: () => void`         — wired to the "Sign up" secondary button
  - `onContinueAsGuest: () => void` — wired to the "Try as guest" ghost button
  - `onOpenPrivacy: () => void`    — wired to the footer "Privacy" button + the legal microcopy "Privacy Policy" link
  - `onOpenTerms: () => void`     — wired to the footer "Terms" button + the legal microcopy "Terms" link
  - `language: 'en' | 'ar'`       — drives dir="rtl" + flex-row-reverse on the CTA row
  - `onToggleLanguage: () => void` — wired to the EN/AR pill button in the header
- Layout:
  - Root: `nexus-shell fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background` + motion.div with initial/animate/exit opacity 0.3s
  - Header (h-14, shrink-0, sticky-style): `/nexus-header-logo.png` (h-7) on left + EN/AR language pill on right (active side bold, divider `/`)
  - Main (flex-1, max-w-md mx-auto, lg:justify-center): vertical stack of 4 blocks:
    1. Hero: small "Now in public beta" badge → brand mark (`/nexus-icon-warm.png` 96×96 in `rounded-3xl shadow-xl shadow-primary/15 ring-1 ring-border/50`) → headline "One AI. Infinite connections." (text-3xl, "AI" in `text-brand-gradient`) → subtitle
    2. CTA: "Continue with email" (h-12 bg-brand-gradient text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-105 active:scale-[0.98]) with Mail icon → "or" divider with horizontal gradient rules on either side → 3 secondary CTAs (Sign in outline / Sign up outline / Try as guest ghost-muted), flex-row-reverse when ar → legal microcopy "By continuing you agree to our Terms and Privacy Policy"
    3. Features: 3 cards in vertical stack, each with gradient icon chip (rose→orange for AI / amber→orange for Voice / orange→rose for Documents) + bold title + muted subtitle + right-pinned ChevronRight that translates on group-hover
    4. Trust row: 3 inline icon+label pairs (Gift "Free to start", CreditCard "No credit card", ShieldCheck "Privacy-first") at text-[11px]
  - Footer (shrink-0, nexus-footer, border-t, h-10, pb-[env(safe-area-inset-bottom)]): "© 2026 NEXUS AI · by Mounir Shaaban" on left + Privacy/Terms buttons on right
- AnimatePresence wraps the motion.div (per spec) — entrance animation fires on mount; exit fires when parent uses `<AnimatePresence>{show && <AuthLanding key="..." />}</AnimatePresence>`
- Staggered entrance: hero (delay 0.05s) → CTA (delay 0.12s) → features (delay 0.2s) → trust row (delay 0.28s); each block fades in + slides up 8px over 0.4s
- Subtle ambient backdrop: `<div className="nexus-ambient pointer-events-none absolute inset-0 -z-10" />` (uses the existing globals.css helper that adds a primary-tinted radial gradient at the top)
- RTL: `dir={isRtl ? 'rtl' : 'ltr'}` on root + `flex-row-reverse` on the secondary CTA row when ar — strings stay English per spec (main agent will handle full i18n)
- Icons used (lucide-react): Mail, Sparkles, Mic, FileText, Languages, ChevronRight, ShieldCheck, CreditCard, Gift

### FILE 2: /home/z/my-project/src/components/omni/profile-page.tsx (490 lines)
- Default + named export: `ProfilePage`
- Props (ProfilePageProps):
  - `onEditProfile: () => void`
  - `onSignIn: () => void`
  - `onSignUp: () => void`
  - `onOpenChat: () => void`         — called by the empty-activity "Start chatting" CTA
  - `onOpenConnect: () => void`     — called by the "Email & apps" row
  - `onToggleTheme: () => void`
  - `onToggleLanguage: () => void`
  - `onRerunOnboarding: () => void`
  - `onOpenPrivacy: () => void`
  - `onOpenTerms: () => void`
  - `theme: 'light' | 'dark'`
  - `language: 'en' | 'ar'`          — drives dir="rtl" on root
  - `activity?: ProfileActivity[]`   — defaults to []
  - `stats?: ProfileStats`           — defaults to {messages:0, files:0, images:0}
- Types exported:
  - `ProfileActivity = { type: 'image' | 'document' | 'code'; url?: string; title: string; createdAt: string }`
  - `ProfileStats = { messages: number; files: number; images: number }`
- Reads `useAuth()` directly (per spec) — pulls `user` (AuthUser | null) and `signOut`
- Layout (5 sections, mobile-first, max-w-2xl mx-auto):
  - Section 1 — Header (Instagram-style):
    - Row 1: avatar (left) + name + "Edit profile" button (right) — flex-col on mobile, flex-row on sm+
    - Avatar: 80×80 mobile / 96×96 sm+, real `user.avatarUrl` via next/Image OR fallback `bg-brand-gradient text-3xl font-bold text-primary-foreground ring-2 ring-border shadow-md shadow-primary/10` with displayInitial
    - Row 2 (stats): 3 cells (messages / files / images) separated by `·` dots, each with bold number above + muted label below; flex-row justify-center on mobile / justify-start on sm+
    - Row 3: email (Mail icon) + member since (Calendar icon, formatted "Mon YYYY") + location (MapPin icon), separated by `·`, muted text-xs
    - Row 4: bio (if present) in text-sm text-foreground
    - Row 5: interests as chips (border-primary/30 bg-primary/5 text-primary, Sparkles icon)
  - Section 2 — Action bar (grid-cols-2 gap-2):
    - Signed in: "Edit profile" (primary, Pencil icon) + "Sign out" (outline, calls auth.signOut())
    - Signed out: "Sign in" (primary, LogIn icon, calls onSignIn) + "Sign up" (outline, UserPlus icon, calls onSignUp)
  - Section 3 — Activity grid (Instagram posts pattern):
    - 3-column grid of aspect-square cells, rounded-lg, border, bg-card
    - Image cell: shows Image with fill + object-cover, scales 1.05 on group-hover
    - Doc cell: FileText icon in `bg-gradient-to-br from-amber-500 to-orange-500`
    - Code cell: Code icon in `bg-gradient-to-br from-orange-500 to-rose-500`
    - Empty state: dashed border, centered, "No activity yet" + Sparkles icon + "Start chatting" outline button (calls onOpenChat)
  - Section 4 — Personalization (collapsible card):
    - Container: `rounded-2xl border border-border bg-card overflow-hidden`
    - Header row (clickable button, aria-expanded, aria-controls): Settings icon + "Personalization" title + ChevronDown that rotates 180° when expanded, on the LEFT; "Theme: {theme}" pill on the RIGHT
    - Collapsible body: AnimatePresence + motion.div with `initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.25,ease:'easeInOut'}}` + `overflow-hidden`
    - 6 rows in `divide-y divide-border`: Email & apps (Mail icon, ChevronRight), Theme (value, no chevron), Language (value, no chevron), Re-run onboarding (ChevronRight), Privacy Policy (FileText icon, ChevronRight), Terms of Service (FileText icon, ChevronRight)
  - Section 5 — Bottom legal footer: tiny centered row "Privacy · Terms · © 2026 NEXUS AI" at text-[11px] text-muted-foreground
- Root container: `omni-scroll flex-1 overflow-y-auto` + `dir={isRtl ? 'rtl' : 'ltr'}`
- Inner wrapper: `mx-auto max-w-2xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]` — pads bottom for mobile nav + safe-area
- Icons used (lucide-react): Settings, ChevronDown, ChevronRight, Sparkles, Mail, FileText, Pencil, LogIn, UserPlus, Image as ImageIcon, Code, MessageSquare, Calendar, MapPin
- Helper functions: `resolveDisplayName(user)`, `resolveInitial(name)`, `formatMemberSince(iso)`, `activityIconFor(type)`, `ACTIVITY_GRADIENTS` map

## Constraints Honored

- ONLY 2 new files created. ZERO existing files modified (no page.tsx, no onboarding.tsx, no auth-modal.tsx, no preferences.ts, no globals.css, nothing else).
- NO new npm packages installed.
- Used existing shadcn/ui Button component (src/components/ui/button.tsx) in profile-page.tsx.
- Used existing global CSS helpers: `.nexus-shell`, `.nexus-footer`, `.nexus-ambient`, `.bg-brand-gradient`, `.text-brand-gradient`, `.omni-scroll` — all from src/app/globals.css. No CSS file modifications.
- All text in English (the main agent will handle Arabic translation in a separate pass — but components DO accept a `language` prop and add `dir="rtl"` on the root when `language === 'ar'`, plus `flex-row-reverse` on the auth-landing CTA row, for layout correctness).
- Mobile safe-area respected:
  - auth-landing footer: `pb-[env(safe-area-inset-bottom)]` on the footer + `flex h-10` inner content row (so content stays 40px tall and safe-area adds space below on iOS)
  - profile-page inner wrapper: `pb-[calc(env(safe-area-inset-bottom)+5rem)]` so content clears the mobile nav + safe-area
- Sticky footer rule (auth-landing): root uses `nexus-shell` (min-height 100dvh flex col) + footer has `nexus-footer` (margin-top: auto) so the legal footer sticks to the bottom of the viewport when content is shorter than one screen and is naturally pushed down when content exceeds viewport.
- TypeScript strict-mode clean: all props typed, no `any`, no `// @ts-ignore`, no non-null assertions on potentially-null values.
- Accessibility:
  - Auth-landing: `role="region"` + `aria-label="NEXUS AI welcome"` on root; `aria-label` on language toggle button with current language in the label; all icon-only buttons have `aria-label`
  - Profile-page: `aria-expanded` + `aria-controls` on the personalization header button; `aria-hidden` on all decorative icons and dot separators; `<button type="button">` everywhere; title attribute on activity grid cells for hover tooltips

## Verification

- `cd /home/z/my-project && bun run lint` → exit 0, ZERO errors, ZERO warnings. (output: `$ eslint .` + clean exit)
- `bunx tsc --noEmit --skipLibCheck` filtered to `auth-landing|profile-page` → ZERO matches (no TS errors in new files). Pre-existing TS errors in unrelated files (smart-chat.ts, email.ts, connectors.ts, test-fix2.ts) verified as NOT caused by these new files — they reference types and APIs from other library modules.
- Dev server: GET / 200 in ~40-60ms after file creation (compiles cleanly, no Fast Refresh runtime errors).
- File line counts: auth-landing.tsx = 314 lines (spec said ~350-450; slightly under but all spec requirements met including the AnimatePresence wrap, RTL support, mobile safe-area, staggered entrance, "or" divider, beta badge, ambient backdrop, right-pinned chevron on feature cards, legal microcopy under CTAs, 3 trust points with icons). profile-page.tsx = 490 lines (in spec's 400-500 range).

## Decisions / Notes for the Main Agent

1. **"Continue with email" → `onSignIn`**: the spec listed no `onContinueWithEmail` prop, so I wired the primary "Continue with email" CTA to `onSignIn()` (Instagram's "Continue with email" effectively opens an email login form). The secondary "Sign in" button also calls `onSignIn()`. The main agent can adjust this routing if it wants the primary CTA to open a different flow (e.g., a magic-link form).
2. **`useAuth()` usage in profile-page**: per spec, the component reads `user` and `signOut` directly from `useAuth()`. The parent does NOT need to pass `user` as a prop — the parent just conditionally renders `<ProfilePage />` (e.g., only when activeTab === 'profile'). The component internally handles both signed-in and signed-out states (different action bars in Section 2).
3. **AnimatePresence inside auth-landing**: the spec literally said "Wrap in framer-motion AnimatePresence", so the root motion.div is wrapped in `<AnimatePresence>`. For the exit animation to actually fire on parent-driven unmount, the parent should ALSO use `<AnimatePresence>{show && <AuthLanding key="auth-landing" ...props}</AnimatePresence>`. The entrance animation (initial → animate) fires on mount regardless.
4. **No i18n**: all strings are English. Components accept a `language` prop and apply `dir="rtl"` (and `flex-row-reverse` on the auth-landing CTA row) when `language === 'ar'`, but the actual Arabic string translations are deferred to the main agent's i18n pass per spec.
5. **`stats` prop**: I added a `stats` prop (`{messages, files, images}`) to profile-page.tsx that defaults to all-zeros. The main agent should wire this to actual chat/file/image counts from the parent's data layer. If the parent doesn't pass `stats`, the component shows "0 messages · 0 files · 0 images" (placeholder per spec).
6. **`activity` prop**: array of `{type, url?, title, createdAt}`. If empty (default), shows the empty-state CTA "Start chatting" which calls `onOpenChat`. The main agent should pass real recent activity from the parent's data layer.
7. **Profile-page Section 1 layout**: I followed the spec's "stats row separated by `·`" literally — the 3 stat cells are separated by `·` dots (not just gap-6). The "Each stat: bold number + muted label below" pattern is preserved (number above, label below within each cell). On mobile the row is `flex-row justify-center`; on sm+ it's `justify-start`.
8. **Personalization chevron placement**: the spec said the chevron goes on the LEFT next to the Settings icon + "Personalization" title. I followed this literally (Settings icon + title + ChevronDown on the left, theme pill on the right). The chevron rotates 180° when expanded.
9. **Profile-page Section 4 rows**: I duplicated the exact row pattern from the current page.tsx Profile section (Email & apps / Theme / Language / Re-run onboarding / Privacy Policy / Terms of Service), but inside the collapsible container with `divide-y divide-border` and ChevronRight indicators on every navigational row (matching Task 12-visual-enhance ENH-10).

## Stage Summary

- 2 NEW files created, ZERO existing files modified.
- `src/components/omni/auth-landing.tsx` (314 lines, exports `AuthLanding` named + default): full-screen dedicated auth landing page with hero + 3 CTAs + 3 feature cards + trust row + legal footer. AnimatePresence-wrapped motion.div with 0.3s opacity fade in/out. RTL-aware (dir + flex-row-reverse on CTA row). Mobile safe-area on footer. Desktop centered. Ambient backdrop. Staggered entrance. Beta badge. "or" divider. Legal microcopy. Right-pinned chevron on feature cards.
- `src/components/omni/profile-page.tsx` (490 lines, exports `ProfilePage` named + default): Instagram-style profile page with header (avatar + name + stats + email + bio + interests) + action bar (Edit profile / Sign out OR Sign in / Sign up) + activity grid (3-col image/doc/code, empty state with "Start chatting" CTA) + collapsible personalization card (AnimatePresence + height animation, 6 rows) + bottom legal footer. Reads useAuth() directly. RTL-aware.
- Lint CLEAN (0 errors, 0 warnings). tsc CLEAN for new files. Dev server healthy.
- The main agent can now wire these into page.tsx in a follow-up pass: render `<AuthLanding />` BEFORE onboarding/chat (when user is signed out OR before first session), and replace the inline Profile section with `<ProfilePage />`.
