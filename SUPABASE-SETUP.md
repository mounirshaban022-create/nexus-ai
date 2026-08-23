# NEXUS AI — Supabase Setup (5 minutes)

Supabase fixes: multi-user accounts, cross-device sync, hosted Postgres, file storage, realtime.

## Steps

1. **Create project**: Go to [supabase.com](https://supabase.com) → New Project (free tier)
   - Choose any name (e.g., "nexus-ai")
   - Set a database password (save it)
   - Pick a region close to you

2. **Get credentials**: Project Settings → API
   - Copy the **Project URL** (`https://xxx.supabase.co`)
   - Copy the **anon public key**

3. **Add to .env**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

4. **Create tables**: In Supabase Dashboard → SQL Editor → New Query
   (OR run from terminal: bun run scripts/create-tables.ts after setting SUPABASE_DB_URL)
   - Paste the entire contents of `supabase-schema.sql`
   - Click Run
   - All tables, security policies, and storage buckets are created

5. **Enable Google OAuth** (optional):
   - Authentication → Providers → Google
   - Add your Google OAuth client ID/secret
   - Add your app URL to redirect URLs

6. **Restart the app**: Sign-in button appears in the sidebar!

## What you get

| Feature | How |
|---|---|
| User accounts | Email/password + Google OAuth |
| Cross-device sync | Realtime Postgres (data follows the user) |
| File storage | Documents, images, videos in Supabase Storage |
| Security | Row-Level Security (users only see their data) |
| Scalability | Hosted Postgres — no data loss, no SQLite limits |
