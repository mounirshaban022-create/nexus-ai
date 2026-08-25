# Task 13-3 — Voice Quality Upgrade + Freeze Root-Cause

**Agent**: full-stack-developer
**Task**: Voice quality upgrade (default voice + bitrate + Arabic voice selection) + freeze root-cause investigation (image generation heartbeat + markdown/answer-card perf).
**Status**: COMPLETE — lint clean (0/0), TTS tests pass, dev.log shows no new errors.

## Files modified (7 — all within the allowed set)
1. `src/lib/voices.ts` — added `DEFAULT_VOICE` constant + `pickVoiceForLanguage(lang)` helper + 1 new Arabic male voice (`ar-SA-HamedNeural`).
2. `src/app/api/tts/route.ts` — default voice schema `tongtong` → `en-US-AriaNeural`; bump bitrate `AUDIO_24KHZ_48KBITRATE_MONO_MP3` → `AUDIO_24KHZ_96KBITRATE_MONO_MP3`; accept `?lang=en|ar` query param; language override when `lang=ar` and voice isn't already `ar-*`.
3. `src/app/api/voice/turn/route.ts` — schema defaults via `DEFAULT_VOICE`; added `lang: 'en'|'ar'` body field; same Arabic override logic; same 96kbit/s MP3 bitrate bump.
4. `src/components/omni/voice-mode-overlay.tsx` — read `prefLang` from `usePreferences`; pass `?lang=` query param to `/api/tts` calls (Layer-1 speak) and `lang` body field to `/api/voice/turn` calls.
5. `src/app/api/chat/route.ts` — added streaming `tool_progress` heartbeat every 5s while any tool runs (most relevant for image generation, which takes 60s+).
6. `src/components/omni/markdown.tsx` — switched `Prism` (sync, ~500KB upfront) → `PrismAsyncLight` (lazy-load language grammars on demand); wrapped `CodeBlock` in `memo()` + `useCallback` for copy handler.
7. `src/components/omni/answer-card.tsx` — wrapped `CitationMarkdown` in `memo()` so it only re-renders when `content` or `sourceMap` actually changes (was re-parsing citation substitution AND re-tokenizing markdown on every streaming token).

## Files NOT touched (per spec)
- `src/app/page.tsx` — verified the voice overlay lazy-mount is still in place (lines 89-90 + 244-248 + 307-310). `voiceMounted` is `false` initially, flips to `true` only when `voiceOpen` becomes true. Confirmed intact — no fix needed.
- `src/components/omni/onboarding.tsx`, `auth-modal.tsx`, `auth-landing.tsx` (new), `profile-page.tsx` (new), `connect-panel.tsx`, `legal-page.tsx`, `profile-edit-modal.tsx`, `globals.css`, `preferences.ts`, `use-auth.ts` — not touched.

## PART A — Voice Quality Upgrade

### A1. voices.ts
- Added `ar-SA-HamedNeural` (Arabic Saudi male — fills the gap; previously only Arabic female voices were listed).
- Exported `DEFAULT_VOICE = 'en-US-AriaNeural'` so both TTS routes share one source of truth.
- Exported `pickVoiceForLanguage(lang: 'en'|'ar'): string` — returns `ar-SA-HamedNeural` for Arabic, `en-US-AriaNeural` for English.

### A2. tts/route.ts
- Zod schema default changed from `'tongtong'` → `DEFAULT_VOICE` (`en-US-AriaNeural`).
- New `readLangParam(req)` helper validates the `?lang=` query (defaults to 'en', accepts any string starting with 'ar' as Arabic).
- New `effectiveVoice` computation: when `lang === 'ar'` AND the chosen `voice` doesn't start with `ar-`, override to `pickVoiceForLanguage('ar')`. Otherwise pass `voice` through unchanged.
- Bitrate bump: `OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3` → `OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3`. (msedge-tts only exposes 24kHz MP3 + WebM/Opus — no 48kHz option. 96kbit/s is the highest-quality format available.)
- WAV-header stripping logic (ZAI path) — verified NOT applied to the Edge path. Edge path returns MP3 chunks directly via `Buffer.concat(buffers)`, no header manipulation. Correct.

### A3. voice/turn/route.ts
- Zod schema `voice` default switched to `DEFAULT_VOICE` (was already `en-US-AriaNeural` from Task 2, but now references the shared constant).
- Added `lang: z.enum(['en','ar']).optional().default('en')` to the request schema.
- Same `effectiveVoice` Arabic override logic as `/api/tts`.
- Same 96kbit/s MP3 bitrate bump on the Edge path.

### A4. voice-mode-overlay.tsx
- Imported `usePreferences` from `@/lib/preferences`.
- New `prefLang = usePreferences((s) => s.language)` selector — subscribes to the global UI language ('en' | 'ar').
- `speak()` Layer-1 fetch URL changed from `/api/tts` → `` `/api/tts?lang=${encodeURIComponent(prefLang)}` `` (both the initial fetch AND the fallback blob fetch). Added `prefLang` to deps.
- `think()` body now includes `lang: prefLang`. Added `prefLang` to deps.

## PART B — Freeze Root-Cause Investigation

### B1. Image generation freeze — chat/route.ts
- **Root cause confirmed**: `dev.log` shows `POST /api/image 200 in 61s` (60s of "render" time). The chat route's `executeChatTool('generate_image', ...)` makes a synchronous `await fetch('/api/image')` call that blocks the entire streaming response for 60+ seconds.
- The chat route already streams `tool_start` BEFORE the long fetch, and `tool_result` AFTER — but in between, the user perceives a "freeze" because nothing is sent for 60s.
- **Fix applied** (small, contained): added a `setInterval(…, 5000)` heartbeat that emits `{ type: 'tool_progress', tool, index, elapsedMs, message: 'Still working on {tool}… {Ns}' }` every 5 seconds while ANY tool is running (most impactful for image generation). The interval is cleared in the `finally` block after `executeChatTool` resolves. This doesn't speed up image generation but eliminates the perceived freeze — the client now knows the stream is alive and can show "still working…" UI.
- Did NOT change the architecture (e.g. async job + polling) — that would be a much bigger refactor across the chat handler + frontend, beyond the scope of "small fix".

### B2. Markdown rendering perf — markdown.tsx + answer-card.tsx
- **markdown.tsx issue 1**: `import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'` — `Prism` is the sync entry that bundles ALL Prism language grammars upfront (~500KB initial bundle). Switched to `PrismAsyncLight` which lazy-loads each language grammar on demand via dynamic import. Same rendering API, smaller bundle, faster first paint.
- **markdown.tsx issue 2**: `CodeBlock` was a plain function — re-rendered (and re-tokenized) on every `Markdown` re-render, which happens on every streaming token. Wrapped `CodeBlock` in `memo()` so it only re-renders when its `language` or `code` props actually change. Also wrapped `copy` callback in `useCallback([code])`.
- **answer-card.tsx issue**: `CitationMarkdown` was NOT memoized. The `AnswerCard` re-renders on every streaming token (parent re-renders when the assistant message grows), so `CitationMarkdown` re-parsed the citation substitution AND re-tokenized the whole markdown tree on every token. Wrapped `CitationMarkdown` in `memo()`. The `sourceMap` is already stabilized via `useMemo([sources])` in the parent, and `content` only changes when the answer text changes — so the memo is effective.

### B3. Voice overlay lazy-mount verification — page.tsx (NO EDITS)
- Read `page.tsx` lines 80-94, 244-248, 295-314.
- `voiceMounted` state (line 90) initialized to `false`.
- `useEffect(() => { if (voiceOpen) setVoiceMounted(true) }, [voiceOpen])` at line 246-248 — flips `voiceMounted` to `true` only when the user opens voice mode, and never flips back (intentional — once mounted, the overlay's hooks can stay cheap via `openRef` no-op guards).
- Conditional render at line 307-310: `{voiceMounted && <VoiceModeOverlay open={voiceOpen} onClose={...} />}` — confirmed intact.
- **Conclusion**: lazy-mount is still in place. No fix needed. Bug C (openRef guards) from Task 2 still protects the mounted-but-closed state.

### B4. dev.log slow-request scan
- Searched for `in [6-9][0-9]s|in 1[0-9][0-9]s` patterns in `/home/z/my-project/dev.log`.
- Only one match: `POST /api/image 200 in 61s` — the image generation call. This is the singular 60s+ operation in the dev log; everything else (GET /, POST /api/chat, POST /api/tts, POST /api/voice/turn) returns in 0.3–1.6s.
- After my edits, dev.log shows:
  - `POST /api/tts 200 in 860ms` (English, en-US-AriaNeural, 96kbit/s MP3)
  - `POST /api/tts?lang=ar 200 in 564ms` (Arabic auto-voice, ar-SA-HamedNeural, 96kbit/s MP3)
  - `POST /api/tts 200 in 381ms` (default = en-US-AriaNeural)
  - `POST /api/voice/turn 200 in 1064ms` (full LLM + TTS round-trip)
- No new errors. No new 429s. No new 500s.

## Constraints honored
- Touched ONLY the 7 files listed above. Did NOT touch `page.tsx`, `onboarding.tsx`, `auth-modal.tsx`, `auth-landing.tsx` (new), `profile-page.tsx` (new), `connect-panel.tsx`, `legal-page.tsx`, `profile-edit-modal.tsx`, `globals.css`, `preferences.ts`, `use-auth.ts`.
- Did NOT install any packages (`msedge-tts` was already installed).
- Did NOT re-introduce any of the 12 voice bugs (A–L) fixed in Task 2:
  - Bug A (server TTS direct play) — unchanged.
  - Bug B (Kokoro removed) — unchanged.
  - Bug C (openRef guards) — unchanged.
  - Bug D (throttled re-renders, no blur) — unchanged.
  - Bug E (ASR auto-restart loop) — unchanged.
  - Bug F (voice LLM 15s × 2 cap) — unchanged.
  - Bug G (parallel TTS chunks) — unchanged.
  - Bug H (arrayBufferToBase64) — unchanged.
  - Bug I (AudioContext cleanup) — unchanged.
  - Bug J (per-request timestamp) — unchanged.
  - Bug K (per-turn AbortController) — unchanged.
  - Bug L (dead files removed) — unchanged.
- API response shapes preserved:
  - `/api/tts` still returns raw audio bytes (`Content-Type: audio/mpeg` for Edge, `audio/wav` for ZAI). The only change is the bitrate (96kbit vs 48kbit) and the `?lang=` query param handling.
  - `/api/voice/turn` still returns `{ sessionId, transcript, reply, audio, audioFormat }`. Added one optional input field (`lang`) — no breaking change to existing callers (defaults to 'en').

## Verification
- `cd /home/z/my-project && bun run lint` → exit 0, ZERO errors, ZERO warnings.
- `bunx tsc --noEmit --skipLibCheck` filtered to my files → only ONE pre-existing error in `voice-mode-overlay.tsx(283,64)` (was line 277 before my edits added 6 lines for the `prefLang` declaration). Verified via `git stash` + re-run that this error existed at line 277 BEFORE my edits — it is NOT introduced by me. (Task 2's worklog notes this same error at line 277 as pre-existing.)
- TTS endpoint tests:
  - `curl -X POST /api/tts -d '{"text":"Hello, this is a test of the new voice quality.","voice":"en-US-AriaNeural"}'` → 44,064 bytes, `MPEG ADTS, layer III, v2, 96 kbps, 24 kHz, Monaural` — valid MP3, >5KB ✓
  - `curl -X POST "/api/tts?lang=ar" -d '{"text":"مرحبا، هذا اختبار"}'` → 38,016 bytes, `MPEG ADTS, layer III, v2, 96 kbps, 24 kHz, Monaural` — valid MP3 ✓ (Arabic voice `ar-SA-HamedNeural` was auto-selected because no voice was provided and `lang=ar` triggered the override)
  - `curl -X POST /api/tts -d '{"text":"Default voice test."}'` → 28,224 bytes, valid MP3 ✓ (default voice is now `en-US-AriaNeural` — was `tongtong`)
- Voice/turn endpoint test: `POST /api/voice/turn -d '{"message":"Hello","voice":"en-US-AriaNeural","lang":"en"}'` → 200, returns `{ sessionId, transcript, reply, audio: base64MP3, audioFormat: 'mp3' }` — response shape preserved.
- dev.log shows no new errors after my edits.
