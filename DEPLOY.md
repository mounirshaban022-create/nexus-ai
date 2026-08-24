# Deploying NEXUS AI to Vercel

This guide takes you from zero to a live URL in ~15 minutes.

## Prerequisites

- A GitHub account (your code is already at `mounirshaban022-create/nexus-ai`)
- A Vercel account (free) — [vercel.com/signup](https://vercel.com/signup) (sign up with GitHub)
- A Neon database account (free) — [neon.tech](https://neon.tech)

---

## Step 1: Create the Database (Neon — free Postgres)

Vercel's serverless filesystem is read-only, so SQLite (the local dev database) won't work. You need a hosted Postgres.

1. Go to [neon.tech](https://neon.tech) → **Sign Up** (free, no credit card)
2. Click **Create Project** → name it `nexus-ai` → pick the region closest to your users
3. Once created, you'll see a **Connection String** that looks like:
   ```
   postgresql://neondb_owner:xxxxxxxxx@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy this string** — you'll paste it into Vercel in Step 3

## Step 2: Import the Project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** → find `mounirshaban022-create/nexus-ai`
3. Vercel auto-detects Next.js. **Don't click Deploy yet** — first set environment variables (below)

## Step 3: Set Environment Variables

In the Vercel project settings → **Environment Variables**, add these (for Production, Preview, and Development):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | *(paste your Neon connection string from Step 1)* |
| `AUTH_SECRET` | *(generate with: `openssl rand -base64 32`)* |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wpzantzdnobajjlzwzl.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(from Supabase Dashboard → Settings → API)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase Dashboard → Settings → API)* |
| `STIRLING_URL` | *(optional — leave empty for now)* |

## Step 4: Switch Prisma to Postgres

**Important:** The schema currently uses `sqlite`. You need to change it to `postgresql` before deploying.

1. Open `prisma/schema.prisma` in the repo
2. Change line 6 from:
   ```prisma
   provider = "sqlite"
   ```
   to:
   ```prisma
   provider = "postgresql"
   ```
3. Commit this change to GitHub (or edit directly on github.com)

> **Note:** After the first deploy, run `npx prisma db push` from your terminal (with `DATABASE_URL` set to your Neon string) to create the tables in your new database.

## Step 5: Deploy

Back in Vercel:
1. Click **Deploy**
2. Wait ~2-3 minutes for the build to complete
3. You'll get a live URL like `https://nexus-ai.vercel.app`

## Step 6: Push the Database Schema

From your local terminal:
```bash
cd your-project
DATABASE_URL="your-neon-connection-string" npx prisma db push
```

This creates all the tables (users, chat_sessions, messages, etc.) in your Neon database.

## Step 7: Run the Supabase Schema (for cloud sync)

1. Open [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Paste the contents of `supabase-schema.sql` (from the repo)
5. Click **Run**

This creates the `profiles`, `chat_sessions`, `chat_messages`, `generated_images`, `generated_videos`, `generated_documents` tables for cloud sync.

---

## What Works After Deployment

| Feature | Status |
|---------|--------|
| AI Chat (multi-AI pool) | ✅ Full |
| Documents & PDF editing | ✅ Full |
| Studio (docs, canvas) | ✅ Full |
| Web Search | ✅ Full |
| Authentication | ✅ Full |
| Image Generation | ⚠️ Needs Z.ai key (set `ZAI_API_KEY`) |
| Voice (TTS/ASR) | ⚠️ Needs Z.ai key |
| Video Generation | ⚠️ Needs Z.ai key |
| PDF Tools (Stirling) | ❌ Needs separate Stirling deployment |

---

## Optional: Enable PDF Tools (Stirling-PDF)

Stirling-PDF requires a JVM and can't run inside Vercel's serverless functions. To enable it:

1. Go to [railway.app](https://railway.app) (free tier)
2. Create a new project → **Deploy from Docker Hub**
3. Image: `frooodle/s-pdf:latest`
4. Railway will give you a URL like `https://your-app.up.railway.app`
5. Set `STIRLING_URL` in your Vercel env vars to that URL

---

## Optional: Enable Image/Voice/Video Generation

These features use the Z.ai SDK which requires credentials:

1. Set `ZAI_API_KEY` in your Vercel env vars
2. The SDK will auto-configure on first use

Alternatively, connect a provider from the app's **Profile → AI Models** section (OpenRouter, Groq, etc. — all have free tiers).

---

## Troubleshooting

**Build fails with Prisma errors:**
- Make sure `DATABASE_URL` is set and points to Postgres (not SQLite)
- Make sure you changed `provider = "postgresql"` in `prisma/schema.prisma`

**App loads but auth doesn't work:**
- Check `AUTH_SECRET` is set (any long random string)

**"Cannot reach the server" errors:**
- Check all environment variables are set for the correct environment (Production)

**Database tables missing:**
- Run `npx prisma db push` with your Neon connection string

---

## Quick Deploy Checklist

- [ ] Neon database created + connection string copied
- [ ] Vercel project imported from GitHub
- [ ] All 5 environment variables set in Vercel
- [ ] `prisma/schema.prisma` changed to `postgresql`
- [ ] Deployed to Vercel
- [ ] `prisma db push` run against Neon
- [ ] `supabase-schema.sql` executed in Supabase
- [ ] Tested the live URL
