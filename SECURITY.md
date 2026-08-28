# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.
Contact the repository owner directly, or open a private security advisory
via GitHub (Repository → Security → Report a vulnerability).

## Handling secrets (read this first)

This project has had incidents where credentials leaked into the working
tree. Before you commit anything:

1. **Never commit `.env` files, session cookies, database URLs with
   passwords, or API keys.** `.gitignore` covers `.env*`, screenshots, and
   generated output — don't bypass it with `git add -f`.
2. **If a secret ever lands in a commit, rotate it immediately.** Deleting
   the file in a later commit does NOT remove it from git history.
   Consider `git filter-repo` / BFG for history, but rotation is the
   critical step.
3. Required production secrets (see `.env.example` for the full list):
   - `AUTH_SECRET` — JWT session signing. Rotating it invalidates all
     sessions (the right move after any suspected leak).
   - `NEXUS_EMAIL_SECRET` — AES-256-GCM key material for stored email
     credentials and AI provider keys. Both `src/lib/email.ts` and
     `src/lib/ai-providers.ts` **fail fast in production** when this is
     missing — there is deliberately no fallback.
   - `WHATSAPP_APP_SECRET` — the Meta webhook rejects unsigned events in
     production.
4. Rotating `DATABASE_URL` (Supabase): Dashboard → Database → Reset
   database password, then update the env var everywhere.

## Known accepted risks (documented, not forgotten)

- The chat `run_command` tool and `/api/code/run` execute real shell /
  scripts in a per-request temp dir with env allow-listing and process-group
  kills, but they are **not** container-isolated. Secrets files are denied
  by pattern and guests cannot run commands, but a full fix requires
  gVisor/Firecracker/Docker sandboxing. Track this as the #1 hardening item
  before exposing the app to untrusted public traffic.
- Generated-file routes (`/api/image/file/[id]`, video/documents/office)
  serve by unguessable capability URL without per-user auth.
- Rate limiting is in-memory per server instance — durable limits need
  Upstash or similar.

## Supported versions

Only the latest `main` branch is supported.
