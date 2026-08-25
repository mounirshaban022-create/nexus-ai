# Task F2 — Voice Overlay + Agents Directory + Framed Panel (NEXUS One premium implementations)

## Files written (exactly my 3 assigned stubs, no other files touched)

1. **src/components/nexus/voice-overlay.tsx** — `VoiceOverlay({ open, onOpenChange })` (contract kept)
   - Full-screen fixed inset-0 z-50 overlay, warm dark gradient (#09090b → #14080c) with
     backdrop-blur, X close (rounded-full hover:bg-white/10) + Escape-to-close
   - **The orb**: BrandMark 116px inside a 184px radial-gradient glass disc; layered glow:
     ambient blurred brand aura + framer-motion pulse rings
     - `listening`: 3 expanding coral rings (1.9s stagger) + disc scales live with mic level
     - `thinking`: slow (5.5s) rotating conic-gradient ring (brand gradient, CSS mask) +
       .nx-shimmer sweep across the disc
     - `speaking`: faster amber rings at 1.2s locked to the .nx-dot bounce rhythm +
       framer scale pulse + 3 .nx-dot dots beside the status label
   - **State machine** idle → listening → thinking → speaking → listening, ported from
     omni/voice-live-mode.tsx: Web Speech Recognition (continuous + interim), restart-on-end
     while listening, mic-level pulse interval, handler cleanup on close/unmount
   - **Pipeline**: POST /api/voice/turn {message, history(6), language, voice, audio: silent wav}
     → reply → speak via inline base64 audio from the turn response (saves a round-trip),
     falling back to POST /api/tts {text, voice} → blob object URL → shared `<audio>` element,
     then browser speechSynthesis as last resort; every step try/catch with visible error
     line + auto-reset to listening
   - Live interim transcript (italic zinc-500) under the orb; conversation log = last 4
     turns with older-turns opacity fade
   - Language picker: globe button bottom-left → animated popover with all 12 languages
     (en-US…tr-TR + neural voices); switching mid-listening restarts recognition in the
     new locale (langOverride avoids stale-closure restart)
   - Bottom controls: mute/unmute mic (Mic/MicOff, disabled when ASR unsupported) +
     red PhoneOff end-call → onOpenChange(false); safe-area inset padding
   - **Graceful fallback**: no SpeechRecognition → "Your browser doesn't support live
     voice — try Chrome" + text input + Send running the same think+speak pipeline
     (also covers mic-blocked error path with actionable message)

2. **src/components/nexus/agents-directory.tsx** — `AgentsDirectory` (modal) +
   `AgentsDirectoryPage` (page) sharing one premium DirectoryBody (contracts kept exactly)
   - Header: display-font "The Agency" + live count chip ("N of 255" / "255 specialists") +
     X (modal) / ArrowLeft back (page)
   - Search: h-11 rounded-xl with focus ring (nx-composer colors) + clear button;
     fuzzy-ish token matching over name + description + division label + vibe
   - Division rail (.nx-rail): All + 17 division chips, each DivisionIcon in division
     color + label + count; active chip = division-color tint() bg + border; click again
     to toggle off
   - Agent cards (.nx-glow-card p-4): emoji in tinted rounded-xl tile, name, division
     label in division color, description (line-clamp-2), italic vibe quote (truncate,
     title tooltip); hover-reveal action row (`md:opacity-0 md:group-hover:opacity-100` +
     translate) with "Chat" (nx-gradient-surface → onNewChatWith) and "Pin to current
     chat" (outline → onPin) / "Unpin" (red outline → onUnpin) — always visible on touch
   - Pinned banner: gradient strip in the pinned agent's division color: emoji + name +
     "auto-routing paused for this chat" + Unpin button
   - Grid 1/2/3 cols; modal = internal .nx-scroll flex-1 scroll, page = whole-page scroll
   - Pagination: 60 initial + "Show N more · M remaining" (+60)
   - Empty state: Hexagon + "No specialists match" + gradient "Clear filters"

3. **src/components/nexus/framed-panel.tsx** — `FramedPanel({ title, description, children })`
   (contract kept)
   - Dark editorial header (display-font title + description + small BrandMark)
   - rounded-2xl white card (bg-white text-zinc-900) with 3px BRAND.gradient hairline
     across the top (inline background-image div), inner ring + deep soft shadow,
     max-w-6xl centered, responsive padding

## Verification results

- **tsc --noEmit**: zero errors in my 3 files (remaining errors are pre-existing in
  examples/, skills/, api routes)
- **bun run lint**: PASS (exit 0, zero output)
- **dev.log**: compiles clean, GET / 200 (dev server died twice mid-session from box
  memory pressure during F1's parallel compiles — restarted with the double-fork
  setsid pattern from the worklog; not caused by my files)

### Browser E2E (agent-browser session f2, guest flow)
- **Directory page**: renders with back arrow, "The Agency" header + "255 specialists"
  chip, search box, all 18 division chips with correct counts (Academic 6 … Engineering
  58 … Marketing 36)
- **Search "frontend"** → "2 of 255" (Frontend Developer, USWDS Developer) — live count
  chip verified
- **Marketing chip** → "36 of 255", 36 cards; combined filters (marketing + "email")
  → "1 of 255"; empty search + wrong division → empty state with Clear filters (works)
- **Show more**: All → 60 cards → click → 120 cards ("Show 60 more · 195 remaining")
- **Chat on UI Designer** → lands in chat view with agent pinned
- **Pinned banner** (page + modal variants): "Pinned: UI Designer — auto-routing paused
  for this chat." + Unpin; unpin removes banner; Pin from card pins instantly
- **Modal variant** (opened from F1's chat header "Agents"): search + pin-from-modal
  closes modal and pins in chat (composer placeholder "Message Brand Guardian…",
  chat header Unpin button — F1's side)
- **Voice overlay**: orb + glow rings + all controls render; with SpeechRecognition
  deleted → "Your browser doesn't support live voice — try Chrome" + fallback input;
  sent "Say exactly: voice pipeline works" via fallback → status "Thinking…" →
  POST /api/voice/turn 200 (4.7s) → reply "voice pipeline works" in conversation log →
  auto-reset; language picker shows 12 languages, Français selectable; mute disabled
  when unsupported; close button + Escape close; mic-blocked path shows actionable error
- **FramedPanel**: WhatsApp + Settings views render framed (title/description header,
  gradient hairline, white card)
- **Mobile 390×844**: directory page + voice overlay render cleanly via hamburger sheet nav
- **Zero page errors** across all flows (`agent-browser errors` empty)
- **VLM visual review** of screenshots: orb/rings/controls ✓, directory cards/chips ✓,
  framed panel hairline ✓ — no broken layout (one transient broken-image artifact in an
  early screenshot was caused by the dev-server restart window; re-verified loaded:
  images complete with naturalWidth>0)

### Screenshots (agent-ctx/)
f2-directory-page.png, f2-search-frontend.png, f2-division-filter.png,
f2-marketing-36.png, f2-show-more.png, f2-pinned-banner.png, f2-chat-pinned.png,
f2-modal-pinned-banner.png, f2-voice-open.png, f2-voice-languages.png,
f2-voice-fallback-turn.png, f2-mobile-directory.png, f2-mobile-voice.png,
f2-framed-whatsapp.png, f2-framed-settings.png

## Deviations / notes
- /api/tts returns raw audio bytes (not a URL) — the overlay creates a client-side blob
  object URL and plays it through a real `<audio>` element, per the task intent. It also
  prefers the inline base64 audio already returned by /api/voice/turn (same audio, one
  less round-trip); /api/tts is the fallback when that field is absent.
- "Pin to current chat" button uses the full label from the spec (wraps to 2 rows on
  narrow cards via flex-wrap).
- Division chips toggle off when clicked again (small UX nicety, still passes the
  click-a-chip E2E flow).
- The pre-existing `req is not defined` error seen in dev.log comes from
  /api/image/file/[id] (not my scope, untouched).
