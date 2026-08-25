# Task 2-a — full-stack-developer — Agent Skills feature (CLI-Anything browser)

> NOTE: `agent-ctx/2-a-full-stack-developer.md` already existed for an earlier,
> unrelated task (the /api/answer Perplexity engine), so this record uses a
> distinct filename per the `{task id}-{agent name}` convention.

## What I built

The "Agent Skills" product surface for NEXUS AI: two API routes exposing the
79 vendored CLI-Anything skills, a premium dark full-height skills browser,
sidebar wiring, and a verified hand-off into the chat composer.

## Files created / modified

| File | Change |
|------|--------|
| `src/app/api/skills/route.ts` | NEW — catalog + search endpoint |
| `src/app/api/skills/doc/route.ts` | NEW — SKILL.md manual endpoint |
| `src/components/omni/skills-mode.tsx` | NEW — 922-line skills browser |
| `src/components/nexus/framed-panel.tsx` | MODIFIED — opt-in `fill` + `dark` variants (defaults byte-identical) |
| `src/components/nexus/shared.tsx` | MODIFIED — `View` union += `{ type: 'skills' }` |
| `src/components/nexus/shell.tsx` | MODIFIED — Puzzle "Skills" NavItem (badge 79) between WhatsApp and Settings |
| `src/app/page.tsx` | MODIFIED — skills view block after whatsapp + `handleUseSkillInChat` |

Do-not-touch files untouched: `api/chat/route.ts`, `chat.tsx`, `ai-providers.ts`,
`smart-chat.ts`, `orchestrator.ts`, `email.ts`, `cli-skills.ts`.

## API contract

### `GET /api/skills?q=<query>&category=<cat>` → 200
```json
{
  "skills": [ { "name": "blender", "displayName": "Blender", "description": "...",
                "category": "3d", "requires": "blender >= 4.2",
                "homepage": "https://www.blender.org",
                "installCmd": "pip install git+..." } ],
  "total": 79,
  "categories": ["3d","ai","audio", ...]   // all 31, sorted
}
```
- `q` present → `searchCliSkills(q, catalogSize)`; else `listCliSkills()`
- `category` (exact, case-insensitive) applied after the search
- `total` = FULL catalog size (79) — the UI computes "X of 79" client-side
- Rate limit `skills:{ip}` 60/min → 429; errors → 500 with logged cause

### `GET /api/skills/doc?name=<skill>` → 200 `{ skill, doc }`
- `doc` = SKILL.md text capped at 7000 chars server-side by the lib
- 400 missing/oversized name · 404 unknown skill · 60/min rate limit
- Resolver accepts bare registry names ("blender", "jumpserver") — all 79
  registry names are bare; the `cli-anything-` prefix form does NOT resolve
  (lib behavior, untouched)

## UI structure (`skills-mode.tsx`)

- Root `flex h-full min-h-0 flex-1 flex-col` inside `<FramedPanel fill dark>`
  → chat-style full-height (`h-[calc(100dvh-56px)] md:h-screen` lives on the
  FramedPanel wrapper, extended with opt-in props; legacy WhatsApp/Settings
  framing unchanged).
- Toolbar: "Agent Skills" display-font title + live badge ("8 of 79"),
  subtitle naming the headline apps, h-11 search (250ms debounce, token match
  over name/display/description/category, clear button), category chip rail
  (scrollable on mobile, wrapped on desktop, top-12 by count + "+19 more"
  expander, active tail category always visible).
- Grid: max-w-5xl centered, 1/2/3 cols, `nx-scroll` + `overflow-y-auto`,
  `nx-glow-card` cards (category-tinted icon tile + hue pill +
  line-clamp-3 description + "View manual" + requires hint). Cards are
  `role="button"` `tabIndex={0}` with Enter/Space handlers and focus rings.
- 31 categories → lucide icons + distinct pastel hues (no blue/indigo),
  fallback Puzzle; `categoryLabel()` prettifies ("knowledge-management" →
  "Knowledge Management", ai → AI, 3d → 3D, osint → OSINT).
- Detail dialog (dark shadcn Dialog, sm:max-w-3xl, max-h-88vh): copy-name,
  primary "Use this skill in chat" → `onUseInChat('Use the "NAME" skill to help me: ')`,
  copyable install command, requires + homepage, SKILL.md rendered with a
  light dependency-free markdown pass (frontmatter stripped, fences, headings,
  lists, bold/inline-code, mono tables). Skeletons for grid + doc, catalog
  error retry, empty state "No skills match — try another word".

## Prefill wiring (the subtle part)

`chat.tsx` consumes `prefill` via `useState(props.prefill ?? '')` — mount
only. So `handleUseSkillInChat` in page.tsx does:
`setPrefill(prompt); setChatEpoch(e => e + 1); setView({ type: 'chat' })`
— the epoch bump remounts chat (same pattern as handleNewChat) so the
composer picks the prefill up. Current session binding is preserved.

## Verification (agent-browser, guest session)

- API: 79 skills / 31 categories; `q=blender` → 1; `category=ai` → 8;
  q+category compose; doc 200/400/404; rate limit → 429 after 60 req/min.
- UI: search debounce + badge counts; category chips filter; expander
  toggle (also fixed a bug where the expanded state hid "Show less");
  copy buttons (Check swap + toast, including the blocked-clipboard
  fallback path); "Use this skill in chat" → composer prefilled with
  `Use the "blender" skill to help me: `; keyboard (Enter/Space open,
  Tab → Close, Escape); desktop 1440px (3-col, grid scrolls); mobile
  390px (hamburger → Sheet → Skills, 1-col, no horizontal overflow,
  dialog fits 358×743).
- `bun run lint` PASS · `tsc --noEmit` zero errors in my files · dev.log
  clean (all skills routes 200).
- Screenshots: `agent-ctx/2a-skills-{desktop,dialog,mobile,mobile-dialog,useinchat}.png`

## Deviations from the plan (all minor, reported)

1. **FramedPanel `fill`/`dark` props** — the spec wanted the browser to fill
   the FramedPanel chat-style; the legacy white-card framing couldn't host a
   full-height dark browser, so I added opt-in variants (defaults unchanged).
2. **Top-12 chips + "+19 more"** — wrapping all 31 category chips consumed
   ~150px (4 rows) of grid height; the expander keeps the toolbar at ~186px
   while keeping every category one click away (and the active one always
   visible).
3. **`total` semantics** — documented as full-catalog size rather than the
   filtered count (the filtered count is derivable from `skills.length`).
4. **Registry name caveat** — doc lookups work with bare names only
   (`cli-anything-blender` does not resolve); the UI always sends bare
   registry names, so this only affects direct API consumers.
