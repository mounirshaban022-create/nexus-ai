<div align="center">

<img src="public/nexus-brand-logo.png" width="110" alt="NEXUS AI" />

# NEXUS AI

**One AI. Infinite connections.**

A full-stack AI super app — 13 abilities, 27 live connectors, a real code sandbox, AI video generation, and a real email agent.

</div>

## ✨ Abilities

| | | |
|---|---|---|
| 💬 **AI Chat** — deep thinking mode, Markdown answers | 🎙️ **Live Voice** — real-time conversation in 12 languages | 🤖 **Agent** — autonomous tool-calling with 27 connectors |
| 💻 **Code Studio** — real sandbox (JS/TS/Python) + AI assist | 🎬 **Video Studio** — AI-directed MP4s with narration | 🎨 **Image Studio** — dual providers |
| 📄 **Office Studio** — real Word/Excel/PowerPoint with premium templates | 👁️ **Vision** — image understanding | 🔍 **Web Search** — live results + AI digest |
| 📖 **Page Reader** — clean extraction | 🗣️ **Voice Studio** — 40+ neural voices, TTS + ASR | 🧠 **AI Models** — bring your own free API keys |

## 🆕 Latest Upgrades

| | |
|---|---|
| 🛡️ **Reliability pass** — the dev process now caps V8 heap (2GB) + Turbopack memory (1.5GB), so the sandbox's OOM-killer can no longer terminate mid-request (the real cause of "Network error" + every feature appearing broken). Mic Permissions-Policy opened for the embedded preview so voice calls get real audio. | 🔊 **Voice chain repaired** — Microsoft's free Edge TTS now 403s from cloud IPs, so TTS/ASR/video-narration fall through to the always-available gateway engine (chat → LLM → speech verified end-to-end), with Kokoro (82M, OSS) still available in-browser. |
| 🖼️ **Vision + image cascade** — image understanding gained a key-free gateway engine (glm-4.5v class); image generation tries the millisecond gateway FIRST (sizes snapped to the engine's 32px grid), then Gemini/Grok/HF/Pollinations as before. | 🎬 **Video pipeline hardened** — scene art and narration each fall back to the gateway engine when the anonymous tiers drain (402/503 storms), so a 2-scene cinematic MP4 renders end-to-end instead of dying mid-job. |
| 📚 **Knowledge Base (RAG)** — chat with your documents, AnythingLLM/Open WebUI style: upload PDF, DOCX, TXT, MD or CSV → sentence-aware chunking with overlap → BM25-style retrieval → grounded answers with numbered citation chips that map back to the source file and chunk. Private per-user libraries, zero external vector DB. | 📞 **AI Voice Call** — a true real-time phone call with NEXUS: socket.io streaming pipeline (ASR → LLM → TTS), animated call screen with timer, mute & barge-in interruption, live captions, and a captions-mode fallback when the mic is unavailable. |

### 🛠️ What was actually broken (and how it was fixed)

| Symptom | Root cause | Fix |
|---|---|---|
| "Network error — try again" on sign-in/features | Linux OOM-killer terminated `next-server` at ~1.6GB RSS mid-request | `NODE_OPTIONS=--max-old-space-size=2048` + `turbopackMemoryLimit: 1536` |
| Sign-in "doesn't work" | Same OOM death (auth itself was healthy — bcrypt+JWT verified 200/201) | Server survives; signup/signin re-verified through the gateway |
| Voice call silent | Server dead + Edge TTS 403 + ASR chain never fell back | Gateway ASR/TTS fallbacks; socket.io call verified live with replies |
| Speech Studio 500 | Edge TTS DRM (Sec-MS-GEC) blocks cloud IPs | Z.ai gateway engine fallback returns 24kHz WAV |
| Vision "no engine configured" | Cascade only had keyed engines | Key-free gateway vision engine appended |
| Video jobs died at 38% | Free image tier drained (402/503) + no narration fallback | Per-scene gateway image fallback + gateway narration TTS → real MP4 verified |
| Images took 70–120s | Cascade burned minutes on drained free tiers first | Gateway engine leads the cascade in the sandbox (~15–30s)

### 📚 Knowledge Base — powered by the open-source RAG pattern

The new **Knowledge** view implements the signature capability of the most-starred
open-source AI apps (AnythingLLM ⭐45k, Open WebUI ⭐100k, LibreChat ⭐30k):

1. **Upload** — drag & drop PDF / DOCX / TXT / MD / CSV (10MB max) or paste raw text
2. **Chunk** — sentence-aware splitting (~900 chars, 140-char overlap) so ideas are never cut mid-thought
3. **Retrieve** — dependency-free BM25-style scoring (idf + length normalization) over your chunks
4. **Answer** — the LLM must answer ONLY from retrieved passages, with `[n]` citation chips you can click to expand the exact source snippet
5. **Persist** — documents and chunks live in SQLite (`KnowledgeDoc` / `KnowledgeChunk`), scoped privately per user account

## 🔌 27 Live Connectors

**Web & Data**: Web Search · Read Page · Weather · Forecast · Rocket Launches · World News (BBC) · Steam Games
**Knowledge**: Wikipedia · Dictionary · Translator · arXiv · NASA · Recipes · Pokédex · Trivia
**Finance**: Crypto (Coinbase) · Currency Rates
**Developer**: GitHub · Hacker News
**Utility**: Calculator · Time · Geocoder · Image Generation
**Email (real)**: Inbox list · Search · Read · Send — via your own IMAP/SMTP account

## 🏗️ Tech Stack

- **Next.js 16** (App Router) + **TypeScript** — the whole app lives on one route
- **shadcn/ui** semantic design system — Claude-inspired warm ivory theme
- **Prisma + SQLite** — sessions, messages, images, encrypted accounts
- **Real execution**: Bun/CPython sandbox with timeouts, ffmpeg video pipeline
- **Security**: AES-256-GCM encrypted credentials, per-IP rate limiting, zod validation, prompt-injection hardening

## 🚀 Getting Started

```bash
bun install
bun run db:push     # create the SQLite schema
bun run dev         # start on :3000
```

Optional — plug in free AI provider keys in **AI Models** (OpenRouter, Groq, Gemini, Mistral, Cerebras, Together) and connect your email in **Connectors**.

## 📁 Structure

```
src/
├── app/            # API routes (chat, agent, code, video, office, email, tts…) + page.tsx
├── components/omni # 13 ability UIs + design system
└── lib/            # connectors registry, email (IMAP/SMTP), AI providers, sandbox helpers
prisma/             # schema (ChatSession, ChatMessage, GeneratedImage, EmailAccount, AiProvider)
```

---

Built with Z.ai frontier models. Generated content stays local; credentials are encrypted at rest.
