# NEXUS AI — Vercel Deployment Guide

Everything you need to ship NEXUS AI to Vercel: keys, database, build settings, and verification. This guide assumes you already have the accounts (GitHub, Vercel, Supabase, OpenRouter, Agnes AI).

---

## 0. What changed in this revision

- **NEW: automated migration endpoint** at `/api/admin/migrate` — provisions the Supabase schema from the Vercel runtime (no manual SQL paste, no local psql install needed). See §2 option B.
- **Default OpenRouter model** is now `stealth/ox-alpha` ("Ox Alpha"), the free coding/reasoning model the user requested.
- The `supabase-schema.sql` was regenerated from `prisma/schema.prisma` — all 13 PascalCase tables including `User`.
- Direct DB connection (`db.<ref>.supabase.co:5432`) is recommended over the pooler for this project (the pooler rejects the tenant).
- Reasoning-model support added to OpenRouter parsers (non-streaming + streaming) so Ox Alpha works without falling through to the fallback chain.

- **OpenRouter is now the primary LLM** (replaces Z.ai, which only works in the sandbox). Set `OPENROUTER_API_KEY` and chat works on Vercel.
- **Agnes AI is the video backend** when `AGNES_API_KEY` is set.
- **Z.ai SDK is optional** — the app builds and runs on Vercel without `z-ai-web-dev-sdk`.
- **Email connector fixed** — a missing `export` on `getZAI()` broke 9 API routes (including `/api/email/accounts`); the connector now works with correct Gmail/Outlook/Yahoo App Passwords.
- **Light mode toggle** — sun/moon icon in the sidebar + Appearance picker in Settings.
- **Supabase sync** activates automatically when the three `SUPABASE_*` env vars are set (chat messages, sessions, generated docs, AI providers all mirror to the cloud).
- **Default model is now `stealth/ox-alpha`** ("Ox Alpha") — a FREE coding/reasoning model on OpenRouter with 1M token context + multimodal input, built for sustained agentic work. Set in `.env.local` / `.env.vercel.local` / `.env.example` + the OpenRouter client fallback. Users can still switch models in Settings → AI Models.

---

## 1. Push the code to GitHub

Your repo is already initialized at `github.com/mounirshaban022-create/nexus-ai.git` with a full commit history. The latest commit (`feat: OpenRouter LLM + Agnes video + email fix + light mode toggle`) contains all the work.

**Note:** the GitHub token you shared returned `401 Bad credentials` — it's expired, revoked, or was mistyped. Refresh it:

1. Go to <https://github.com/settings/tokens> → **Generate new token (classic)**
2. Scope: tick **`repo`** (full repo access for private) — nothing else needed
3. Copy the new `ghp_...` token
4. Push from your machine:
   ```bash
   cd /home/z/my-project
   git push https://<NEW_TOKEN>@github.com/mounirshaban022-create/nexus-ai.git main
   ```
   Or set the remote once (token stored in `.git/config`, not committed):
   ```bash
   git remote set-url origin https://<NEW_TOKEN>@github.com/mounirshaban022-create/nexus-ai.git
   git push origin main
   ```

**Secrets safety:** `.env.local` (your real keys) is gitignored — it will NEVER be pushed. Only `.env.example` (placeholder template) is committed.

---

## 2. Set up Supabase Postgres (the Vercel database)

The sandbox uses SQLite; Vercel needs a real Postgres. Supabase gives you one free.

1. **Supabase Dashboard → your project** (`wopzantzdnobajjlzwzl`)
2. **Use the DIRECT connection** (recommended for this project):
   - `postgresql://postgres:<DB-PASSWORD-ROTATED-SEE-SECURITY-NOTE>@db.wopzantzdnobajjlzwzl.supabase.co:5432/postgres`
   - Why direct (not the pooler): the Supavisor transaction pooler returned `tenant/user postgres.wopzantzdnobajjlzwzl not found` for this project — the pooler doesn't recognize the tenant. The direct connection bypasses the pooler and uses native Postgres auth (user `postgres`, no tenant lookup). For low-to-medium traffic this is fine on Vercel.
   - (If you later enable the pooler in Dashboard → Database → Connection pooling, you can switch to `postgresql://postgres.wopzantzdnobajjlzwzl:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`.)
3. **Create the 13 tables** — pick ONE:
   - **Option A — manual SQL paste (works anywhere):** Supabase Dashboard → SQL Editor → New Query → paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql) → Run.
   - **Option B — automated endpoint (recommended, no copy-paste):** Add `ADMIN_MIGRATION_TOKEN` (any random 32+ char string) to Vercel env vars + redeploy. Then visit:
     ```
     https://<your-vercel-domain>.vercel.app/api/admin/migrate?token=<ADMIN_MIGRATION_TOKEN>
     ```
     The Vercel runtime reads `supabase-schema.sql` from the repo + runs every statement against the connected `DATABASE_URL`. Returns a JSON report: `{ ok: true, executedCount: N, tablesAfter: [...], missingTables: [] }`. Safe to re-run (the SQL uses `DROP ... CASCADE` first).
     - Why this exists: the sandbox and many CI environments can't reach Supabase directly (the pooler rejects the tenant; the direct host's DNS doesn't always resolve). The Vercel runtime CAN reach Supabase, so we proxy the migration through it.
     - To dry-run first (no changes, just diagnostic): add `&dry=1`.
   - Tables created (auto-generated from `prisma/schema.prisma`): `User`, `ChatSession`, `ChatMessage`, `GeneratedImage`, `GeneratedVideo`, `GeneratedDocument`, `EmailAccount`, `AiProvider`, `UserMemory`, `Project`, `ProjectFile`, `WhatsAppAccount`, `WhatsAppMessage`.
   - Uses PascalCase names (matches Prisma exactly — no `@@map`), TEXT `cuid()` IDs, no references to `auth.users` (this app has its own `User` table + custom JWT auth, not Supabase's built-in auth).
4. **Settings → API** → confirm:
   - Project URL: `https://wopzantzdnobajjlzwzl.supabase.co`
   - `anon` public key + `service_role` key (both already in your `.env.local`)

The build script (`package.json` → `build`) auto-switches Prisma from `sqlite` to `postgresql` when `DATABASE_URL` starts with `postgres`, then runs `prisma generate`. Nothing to change.

---

## 3. Import to Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pick `mounirshaban022-create/nexus-ai`
2. Framework preset: **Next.js** (auto-detected)
3. Build settings (leave defaults):
   - Build Command: `bun run build` (or the default `next build` — the `build` script handles the Prisma provider switch)
   - Output: `.next` (auto)
   - Install Command: `bun install` (or `npm install`)
4. **DO NOT click Deploy yet** — first add the environment variables (next section).

---

## 4. Environment variables (Vercel → Project → Settings → Environment Variables)

Add EACH of these for **Production + Preview + Development** environments (or at least Production). A ready-to-paste copy lives in `.env.vercel.local` (gitignored — your personal copy with real values).

| Key | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | `postgresql://postgres.wopzantzdnobajjlzwzl:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres` | From Supabase → Database → Connection string (Transaction pooler). **Critical:** must start with `postgres` so the build switches the Prisma provider. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wopzantzdnobajjlzwzl.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` (anon JWT) | Safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIs...` (service_role JWT) | **Server only** — used for cloud sync inserts |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Your OpenRouter key |
| `OPENROUTER_DEFAULT_MODEL` | `anthropic/claude-3.7-sonnet` | Premium quality; change in `.env` or in-app Settings anytime. Free alt: `nvidia/nemotron-3-super-120b-a12b:free` |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_SITE_URL` | `https://<your-vercel-domain>.vercel.app` | Shows in OpenRouter rankings |
| `OPENROUTER_APP_NAME` | `NEXUS AI` | |
| `AGNES_API_KEY` | `sk-i9TG...` | Agnes AI video generation |
| `AGNES_BASE_URL` | `https://api.agnes.ai/v1` | Update if Agnes uses a different host |
| `NEXUS_EMAIL_SECRET` | (any random 32-char string) | Used to AES-encrypt stored email passwords. **Must match across deploys** — if you change it later, saved email accounts must be re-connected. Generate with `openssl rand -hex 32` |
| `AUTH_SECRET` | (any random 32-char string) | Signs the session cookie. **Required in production** — without it a hardcoded dev fallback is used. Generate with `openssl rand -hex 32` |
| `HF_TOKEN` | `hf_...` (free at huggingface.co/settings/tokens) | **Voice input in production.** Powers server-side Whisper transcription (`/api/asr`, `/api/voice/turn`). Without it, voice mode falls back to the Z.ai SDK (unreachable on Vercel) and then to a ~45 MB in-browser model — the "voice doesn't hear me" failure on deployments. Set it and voice hears users instantly in every browser. |
| `ADMIN_MIGRATION_TOKEN` | (any random 32+ char string) | Required to hit `/api/admin/migrate` in production (Vercel). Used to provision the Supabase schema from the Vercel runtime — no manual SQL paste needed. Generate with `openssl rand -hex 24`. Already set in your `.env.vercel.local`. |
| `APP_URL` | `https://<your-vercel-domain>.vercel.app` | |
| `PORT` | `3000` | |

After adding all vars, click **Deploy**. First build takes ~2-3 min.

---

## 5. Postgres + Prisma on Vercel

The first deploy runs `prisma generate` (via the `postinstall` hook). Creating the actual tables is NOT automatic. After the first successful deploy:

1. **Provision the schema — pick ONE:**
   - **Recommended: the automated endpoint.** Visit `https://<your-vercel-domain>.vercel.app/api/admin/migrate?token=<ADMIN_MIGRATION_TOKEN>` in your browser. The Vercel runtime reads `supabase-schema.sql` from the repo and runs every statement against the connected `DATABASE_URL`. Returns JSON `{ ok: true, executedCount: 60, tablesAfter: [...13 tables...], missingTables: [] }`. Safe to re-run.
   - **Or: run the SQL manually** in Supabase Dashboard → SQL Editor → paste [`supabase-schema.sql`](./supabase-schema.sql) → Run.
   - **Or: run `prisma db push` locally** with the Supabase `DATABASE_URL` (requires the direct connection — the pooler rejects this project as a tenant):
     ```bash
     DATABASE_URL="postgresql://postgres:<DB-PASSWORD-ROTATED-SEE-SECURITY-NOTE>@db.wopzantzdnobajjlzwzl.supabase.co:5432/postgres" bun run db:push
     ```
     (The provider swap is handled by the `build` script on Vercel; for a local push you can pass `--schema=prisma/schema.prisma` after temporarily switching the provider to `postgresql`.)
2. Confirm in Supabase → Table Editor → you see `ChatSession`, `ChatMessage`, `User`, `EmailAccount`, etc. (or just look at the JSON `tablesAfter` from the endpoint).

---

## 6. Verify the deploy

After Vercel shows "Ready", visit your `https://<project>.vercel.app`:

| Check | Expected |
|-------|----------|
| Landing page loads | Marketing page with "Get started" / "Explore as guest" |
| Sign up + sign in | Cookie session works; survives reload |
| Send a chat message | Streams word-by-word; dev.log-equivalent shows `[smartChat] served by OpenRouter` |
| Attach a document + ask about it | AI quotes the document content (Author/Date lines included) |
| Click the sun/moon icon (sidebar bottom-left) | Shell switches between dark and light |
| Settings → Connect → Gmail | Enter your Gmail + 16-char App Password → "Connected successfully" |
| Generate an image | Returns an inline image card |
| Generate a video | Returns a job id; status polls until the MP4 is ready (Agnes AI) |
| Supabase → Table Editor → `chat_messages` | New rows appear as you chat (cloud sync working) |

---

## 7. Model choice for OpenRouter

The default is **`stealth/ox-alpha`** ("Ox Alpha") — a FREE coding/reasoning model with **1M token context**, multimodal input (text + image + video), built for sustained agentic work and production workloads. No credits needed on your OpenRouter account. This is the model the user picked for coding tasks.

Alternatives you can set in `OPENROUTER_DEFAULT_MODEL` or pick in **Settings → AI Models**:

- `stealth/ox-alpha` — **default**, free, coding/reasoning, 1M context (recommended)
- `openai/gpt-4o-mini` — cheap, fast, great for general chat
- `openai/gpt-4o` — premium OpenAI
- `anthropic/claude-sonnet-4.5` — premium Anthropic (requires credits)
- `google/gemini-flash-2.0` — fast + multimodal
- `deepseek/deepseek-chat` — strong coding, low cost

See <https://openrouter.ai/models> for the full catalog (418+ models).

---

## 8. "Alpha Ox" = the default coding model

"Alpha Ox" (the name you used) maps to the OpenRouter model **`stealth/ox-alpha`** (display name "Ox Alpha"). It is already configured as the default:

- `.env.local` → `OPENROUTER_DEFAULT_MODEL=stealth/ox-alpha` (sandbox)
- `.env.vercel.local` → `OPENROUTER_DEFAULT_MODEL=stealth/ox-alpha` (paste into Vercel)
- `.env.example` → `OPENROUTER_DEFAULT_MODEL=stealth/ox-alpha` (committed template)
- `src/lib/openrouter.ts` fallback → `'stealth/ox-alpha'` (used if the env var is unset)

**Why this model:** free ($0 prompt / $0 completion), 1,048,576-token context window, accepts text + image + video input, 131K max completion tokens, designed for coding + long-horizon agentic work. No renaming of the app or UI was needed — it's just the model slug powering the chat.

---

## 9. Local dev (sandbox)

For local development, `.env.local` (gitignored) is already configured with all keys + SQLite. The dev server uses:
- Layer 0: OpenRouter (when key is set)
- Layer 0b: Z.ai (sandbox gateway, fast fallback)
- Layer 1: user DB-configured provider
- Layer 2: free AI pool (LLM7, OVH, Kilo)

```bash
bun run dev      # start on :3000
bun run lint     # 0 errors expected
bun run db:push  # apply schema changes to local SQLite
```

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `prisma.chatSession.create()` → `FATAL: tenant/user postgres.<ref> not found` | The Supavisor pooler doesn't recognize the project. Switch `DATABASE_URL` to the **direct connection**: `postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres` (note: user is just `postgres`, no `.<ref>`, no `?pgbouncer=true`). See DEPLOYMENT.md §2. |
| Auth (sign up / sign in) fails on Vercel | The `User` table is missing from Supabase. **Easiest fix:** visit `https://<your-vercel-domain>.vercel.app/api/admin/migrate?token=<ADMIN_MIGRATION_TOKEN>` to provision all 13 tables from the Vercel runtime. **Or:** run [`supabase-schema.sql`](./supabase-schema.sql) in Supabase SQL Editor. |
| Build fails on Prisma | Ensure `DATABASE_URL` is set in Vercel AND starts with `postgres`. The `build` script auto-switches the provider. |
| Chat returns "All AI engines are busy" | `OPENROUTER_API_KEY` not set or invalid. Check Vercel env vars. |
| Email connect "failed" with correct creds | You're on an old deploy. The `getZAI` export fix is in commit `9f61998`. Redeploy. |
| Videos never complete | `AGNES_API_KEY` / `AGNES_BASE_URL` wrong. Check the Agnes API docs for the correct base URL. |
| Supabase tables empty after chat | `SUPABASE_SERVICE_ROLE_KEY` not set or wrong. Sync is fire-and-forget — check Vercel logs for `[supabase-sync] ... failed`. |
| Light mode toggle does nothing | Hard-refresh (Ctrl+Shift+R) — next-themes needs the client bundle. |
| **Voice mode doesn't hear the user** (deployed) | `HF_TOKEN` not set → server Whisper + Z.ai ASR are both unavailable. Set `HF_TOKEN` (free) in Vercel env vars and redeploy. Check with `GET /api/asr/status` → `{"serverAsr": true}`. Without it users depend on a ~45 MB in-browser model that some networks block. |
| Skills produce nothing / "sign in required" in chat | Old behavior: skills tried to pip-install desktop CLIs on the server (impossible). New behavior routes every skill to its cloud engine via `run_skill_action` — redeploy to get it. Shell `run_command` remains signed-in-only by design. |

---

**Repo:** <https://github.com/mounirshaban022-create/nexus-ai> · **Commit:** `9f61998` · **Author:** Mounir Shaaban
