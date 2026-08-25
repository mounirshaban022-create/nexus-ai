# Task 5-a — full-stack-developer

## Task
Frontend redesign half 1 of the NEXUS → "The Agency" transformation: app shell, marketing landing, auth modal, onboarding overlay, home dashboard, and the page.tsx view-switch/auth/guest wiring, all in the new dark premium editorial design language.

## Files Created / Modified (ownership respected)
- **Modified** `src/app/layout.tsx` — Space Grotesk display font (`--font-display`), agency metadata + `themeColor #09090b`; Inter, theme boot script and Toaster untouched.
- **Modified** `src/app/globals.css` — appended-only agency section: `.agency-scroll` dark scrollbar, amber `::selection`, `.font-display` utility.
- **Modified** `src/app/page.tsx` — complete rewrite: `View` state switch over all 7 view types, auth (`getCurrentUser`/`onAuthChange`/`signOut`), guest mode, dark splash during auth check, onboarding gate (`agency-onboarding-done`), preferences wiring, WhatsApp/Settings in white card on dark shell.
- **Created** `src/components/agency/shell.tsx` — `AppShell`: fixed 264px sidebar (logo, New conversation, live search, nav, 17-division rail, channels, settings/account/`agency-v1` build tag) + mobile top bar + Sheet nav.
- **Created** `src/components/agency/landing.tsx` — `AgencyLanding`: hero, division dots, stats, CTAs, featured strip, sticky footer.
- **Created** `src/components/agency/auth-modal.tsx` — `AgencyAuthModal`: dark Dialog + tabs → `/api/auth/signin` / `/api/auth/signup`.
- **Created** `src/components/agency/onboarding.tsx` — `AgencyOnboarding`: 17-tile division picker (max 5), Enter/Skip.
- **Created** `src/components/agency/home.tsx` — `AgencyHome`: Dubai-time greeting, quick actions, stats, pinned divisions, featured rail, recent conversations.

**NOT touched** (per contract): `src/lib/**`, `src/app/api/**`, `src/components/omni/**`, `src/components/agency/shared.tsx`, `prisma/**`, and the 4 task-6a files (roster/division-view/agent-profile/agency-chat).

## Verification Results
- `bun run lint` — PASS, zero errors (one `react-hooks/set-state-in-effect` error found and fixed via deferred localStorage read).
- `dev.log` — no compile errors, no Space Grotesk fetch errors.
- Browser E2E (session `t5a`), zero page errors on every flow:
  - Landing renders fully; "Explore as guest" → onboarding → pick 2 divisions → home shows exactly those pinned + "All 17 divisions →".
  - Sidebar: 17 divisions, navigation to roster/division/agent/chat verified (live against task 6-a's components which landed mid-verification — integration works).
  - Auth: signup 201 → account block + personalized greeting; signin; wrong-password inline error; sign out → landing.
  - WhatsApp + Settings channels render in white card; mobile 375px Sheet nav works; sidebar live search filters roster.
- Screenshots: `agent-ctx/t5a-verify.png`, `t5a-landing.png`, `t5a-auth-modal.png`, `t5a-mobile-sheet.png`.

## Deviations / Notes
- `BUILD_VERSION = 'agency-v1'` lives in `shell.tsx` (not page.tsx) because it renders at the sidebar bottom and `AppShell` props are fixed by the interface contract.
- `authChecked` splash state added so returning signed-in users never see the marketing landing flash (spec's on-mount `getCurrentUser` implies a flash otherwise).
- `homeEpoch` remount in page.tsx: home reads pinned divisions from localStorage on mount, and it mounts *under* the onboarding overlay, so completing onboarding bumps the key to refresh favorites immediately.
- Dev server died once mid-verification (reaped/OOM on this box) — restarted with the double-fork pattern; command recorded in worklog.
