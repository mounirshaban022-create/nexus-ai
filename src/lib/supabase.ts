/**
 * Central Supabase admin client — server-side only.
 *
 * All cloud-sync points import from here. The client activates ONLY when
 * both env vars are set (see .env); otherwise every sync call no-ops and
 * the app runs purely on the local SQLite database — no crashes, no
 * partial states.
 *
 * .env entries needed:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
}

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>

let cached: SupabaseAdmin | null = null

async function createAdminClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Returns the service-role admin client, or null when not configured. */
export async function getSupabaseAdmin(): Promise<SupabaseAdmin | null> {
  if (!supabaseConfigured()) return null
  if (!cached) {
    cached = await createAdminClient()
  }
  return cached
}

/**
 * Fire-and-forget insert/update helper. Every table mirror in the app
 * uses this — failures log but never break the user's request.
 *
 * Mirrors implemented (table → source):
 *   chat_sessions     ← /api/chat (session create)
 *   chat_messages     ← /api/chat (user + assistant messages)
 *   library_items     ← image/video/document generation routes
 *   user_ai_providers ← /api/ai-providers (provider connect)
 */
export async function supabaseUpsert(
  table: string,
  values: Record<string, unknown> | Array<Record<string, unknown>>,
  opts: { onConflict?: string } = {}
): Promise<void> {
  const admin = await getSupabaseAdmin()
  if (!admin) return
  try {
    let query = admin.from(table).upsert(values as never)
    if (opts.onConflict) query = (query as unknown as { onConflict: (c: string) => typeof query }).onConflict(opts.onConflict)
    const { error } = await query
    if (error) throw error
  } catch (err) {
    console.error(`[supabase-sync] ${table} failed:`, err instanceof Error ? err.message : err)
  }
}
