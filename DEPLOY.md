# Deploying NEXUS AI — Supabase + Vercel (2 services only)

You already have Supabase. You only need Vercel for hosting.
**No Neon. No Railway. Just these two.**

---

## What You Already Have

✅ **Supabase** — your database (Postgres), auth, and cloud storage
✅ **GitHub repo** — your code at `mounirshaban022-create/nexus-ai`

## What You Need

1. A **Vercel account** (free) — [vercel.com/signup](https://vercel.com/signup)

---

## Step 1: Get Your Supabase Database Password (1 min)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Open your project (`wpzantzdnobajjlzwzl`)
3. Go to **Settings → Database**
4. Find **Connection string (URI)** — it looks like:
   ```
   postgresql://postgres.wpzantzdnobajjlzwzl:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. Click to reveal/copy it. **If you don't know your database password:**
   - Settings → Database → **Reset database password** (creates a new one)
   - Copy the new password and substitute it into the connection string

## Step 2: Create the Database Tables (2 min)

Run the Prisma schema against your Supabase database:

```bash
# From your project folder:
DATABASE_URL="your-supabase-connection-string" npx prisma db push
```

This creates all the tables (users, chat_sessions, messages, images, etc.) in your Supabase Postgres.

**Alternative (if you prefer the UI):**
1. Supabase Dashboard → **SQL Editor**
2. Paste the contents of `supabase-schema.sql` from the repo
3. Click **Run**

## Step 3: Import to Vercel (2 min)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your repo: `mounirshaban022-create/nexus-ai`
3. Vercel detects Next.js automatically
4. **Before deploying, add environment variables** (below)

## Step 4: Set Environment Variables (2 min)

In Vercel → your project → **Settings → Environment Variables**:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Step 1 connection string |
| `AUTH_SECRET` | Run `openssl rand -base64 32` in terminal |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wpzantzdnobajjlzwzl.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key |

## Step 5: Deploy (2 min)

Click **Deploy** in Vercel → wait 2-3 minutes → done.

Your app is live at: `https://nexus-ai.vercel.app` (or whatever name Vercel assigns)

---

## Architecture After Deployment

```
┌─────────────────────────────────────────┐
│              VERCEL (hosting)           │
│  ┌───────────────────────────────────┐  │
│  │   Next.js app (your code)         │  │
│  │   - Chat UI, Studio, Auth UI      │  │
│  │   - API routes (/api/chat etc.)   │  │
│  │   - Multi-AI pool (LLM7/Kilo/OVH)│  │
│  └───────────────────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│           SUPABASE (database)           │
│  ┌───────────────────────────────────┐  │
│  │   Postgres database               │  │
│  │   - Users, sessions, messages     │  │
│  │   - Generated files metadata      │  │
│  │   - Profiles                      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Two services. That's it.**

---

## What Works After Deployment

| Feature | Status |
|---------|--------|
| AI Chat (multi-AI pool — 120B model) | ✅ Full |
| Document attachments (clipper) | ✅ Full |
| Studio (documents, canvas, templates) | ✅ Full |
| Web Search (Brave/DuckDuckGo) | ✅ Full |
| Authentication (sign up/in/out) | ✅ Full |
| Profile + settings | ✅ Full |
| Excel/spreadsheet creation | ✅ Full |
| Word document creation | ✅ Full |
| Image Generation | ⚠️ Needs `ZAI_API_KEY` (optional) |
| Voice (TTS/ASR) | ⚠️ Needs `ZAI_API_KEY` (optional) |
| Video Generation | ⚠️ Needs `ZAI_API_KEY` (optional) |
| PDF Tools (Stirling) | ❌ Needs a JVM host (optional, skip for now) |

**Everything important works with just Vercel + Supabase.**

---

## Troubleshooting

**Build fails with Prisma errors:**
- Make sure `DATABASE_URL` points to your Supabase Postgres (starts with `postgresql://`)
- The connection string should use port `6543` (pooler) for Vercel

**App loads but "Cannot reach server" errors:**
- Check all 5 environment variables are set in Vercel (Production environment)

**Auth doesn't work:**
- Make sure `AUTH_SECRET` is set to any long random string

**Database tables missing:**
- Run Step 2 (`prisma db push`) — this creates the tables

---

## Quick Checklist

- [ ] Got Supabase database connection string (Settings → Database)
- [ ] Ran `prisma db push` against Supabase
- [ ] Imported repo to Vercel
- [ ] Set 5 environment variables in Vercel
- [ ] Deployed
- [ ] Tested the live URL
