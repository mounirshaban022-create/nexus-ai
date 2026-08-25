# Task 6-a — full-stack-developer — Agency roster / division / profile / chat views

## What I built (4 files, exactly my ownership)

1. **src/components/agency/roster.tsx**
   - `AgencyRoster({ initialQuery, initialDivision, setView })`
   - Micro-label "THE ROSTER" + display H1 "Every specialist." + stats subline
   - Controlled search (autofocus, X clear button, 44px-height input) filtering name +
     description + division label case-insensitively
   - Division filter chips: "All" (amber active) + 17 division chips (DivisionIcon + label +
     count; active chip = division color border/text + tint bg)
   - Agent grid 1/2/3 cols, framer-motion staggered entrance (delay capped 0.25s)
   - 60 per page + "Show more" (shows "N of total"), empty state + "Clear filters"
   - **Exports `AgentCard`** (reused by division-view so both grids are pixel-identical)

2. **src/components/agency/division-view.tsx**
   - `AgencyDivisionView({ divisionId, setView })`
   - Back link "← All divisions", hero: DivisionIcon in tint rounded-2xl + display-font
     label + "N specialists · descriptor"
   - Hardcoded 1-line descriptors for ALL 17 division ids
   - Unknown division → friendly not-found card; imports AgentCard from roster.tsx

3. **src/components/agency/agent-profile.tsx**
   - `AgencyAgentProfile({ agentSlug, setView })`
   - Big emoji avatar in tint rounded-3xl, name (display font), division chip, vibe,
     description, amber "Start conversation" button
   - **Exports `DIVISION_OPENERS`** (17 divisions × 4 prompts), **`NEXUS_OPENERS`** (3
     generic), **`CHAT_PREFILL_KEY = 'agency-chat-prefill'`**
   - Opener chips → sessionStorage prefill → setView chat (chat composer picks it up)
   - Recent conversations: GET /api/chat/sessions?kind=chat, filter `agentSlug === slug`,
     top 5 with relative time ("2m ago"), skeletons while loading, fail-soft
   - Unknown slug → "Agent not found." + back to roster

4. **src/components/agency/agency-chat.tsx** (the core)
   - `AgencyChat({ agentSlug, sessionId, setView })`
   - Full-height `flex h-[calc(100vh-56px)] flex-col md:h-screen`; header h-14 with back
     (→ agent profile / home), tint emoji circle, name + division chip, New (RotateCcw)
   - NDJSON streaming over POST /api/chat with `{ message, sessionId?, thinking,
     language:'en', agentSlug? }` — pattern copied from omni/chat-mode.tsx
   - Handles: user echo, assistant_start/delta/end (multi-bubble tool flows), assistant
     full-message fallback, tool_start/tool_progress/tool_result (live chips with
     TOOL_LABELS map + spinner/check/x states, matched by tool index), done (sessionId
     capture), error (red assistant-style bubble)
   - **Delta flush throttle**: deltas buffer in a ref and flush every 80ms so
     react-markdown isn't re-parsed per token — keeps long streams smooth
   - Smart auto-scroll: follows output unless the user scrolled >150px up
   - Empty state: big emoji, name, vibe, description, 3 suggestion chips that SEND
     immediately; mounts read sessionStorage 'agency-chat-prefill' into the composer
     (cleared, never auto-sent)
   - Assistant messages reuse `Markdown` from omni/markdown wrapped in `div.dark` —
     activates the existing `.dark .omni-prose` code-styling rules on our forced-dark
     surface without touching globals.css
   - Collapsible "Thought process" panel (Brain icon, amber left border) when
     message.thinking exists
   - Attachments V1: image → inline `<img>` rounded-xl max-w-sm; document+url →
     download card (FileText + title + Download); anything else → guarded text card
   - Composer: auto-resizing textarea (max-h-40), Enter=send / Shift+Enter=newline,
     Brain deep-thinking toggle (amber when active), amber ArrowUp send (spinner while
     streaming, disabled when empty)
   - Session resume: GET /api/chat/sessions/[id] on mount/prop-change; role:'tool' rows
     render as subtle done chips; abort in-flight stream on unmount

## Verification (all green)
- `bun run lint` → 0 errors, 0 warnings
- `bun x tsc --noEmit` → zero errors in my 4 files
- dev.log → no compile errors (dev server had died; restarted with the double-fork
  `((setsid nohup bun run dev > dev.log 2>&1 &))` pattern)
- Browser E2E (session t6a, parallel agent's shell WAS deployed by then):
  - Landing → Explore as guest → skip onboarding → "All Agents" → roster renders with
    search + 18 chips + 60 cards
  - Search "designer" → 8 designer specialists; "ui designer" → exact match
  - UI Designer profile → openers + "No conversations yet" → Start conversation
  - Sent "who are you?" → **streamed in-persona reply as UI Designer** (persona backend
    confirmed end-to-end through my chat view); screenshot agent-ctx/t6a-chat.png
  - Opener chip → composer pre-filled, NOT auto-sent ✓; empty-state chip → sends
    immediately ✓; New conversation resets ✓
  - Back to profile → recent conversation listed ("just now") → resume loads full
    history ✓
  - Division view (Design) → hero + 10 specialists ✓
  - Show more 60→120 ✓; nonsense search → "No specialists match." + Clear filters ✓
  - `agent-browser errors` → zero console errors

## Integration notes for the main agent
- No wiring needed — page.tsx already imports all 4 components with the exact prop
  signatures I implemented.
- `DIVISION_OPENERS` / `NEXUS_OPENERS` / `CHAT_PREFILL_KEY` live in agent-profile.tsx
  and are imported by agency-chat.tsx (both my files) — if the home view (5-a) ever
  wants "ask {agent}" quick actions, reuse the same sessionStorage prefill contract.
- Screenshots: agent-ctx/t6a-chat.png, agent-ctx/t6a-roster.png
