import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { db as defaultDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/admin/migrate — one-shot Supabase schema provisioning endpoint.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Supabase pooler (Supavisor) returns `tenant/user not found` for some
 * projects when called from outside Supabase's own network. The project's
 * direct-DB hostname `db.<ref>.supabase.co` doesn't resolve in some
 * sandboxes (NXDOMAIN in public DNS). So the only place that can reliably
 * run the DDL is the Vercel runtime — which DOES have working DNS + the
 * direct connection already wired into `DATABASE_URL`.
 *
 * This endpoint runs `supabase-schema.sql` against the live DATABASE_URL.
 * After it succeeds, all 13 tables exist and auth + chat work end-to-end.
 *
 * AUTH
 * ----
 * The token arrives via `Authorization: Bearer <token>` (preferred) or
 * `?token=<T>` (backward compat) and must match ONE of:
 *   - `process.env.ADMIN_MIGRATION_TOKEN` (preferred — set this on Vercel), OR
 *   - `process.env.SUPABASE_SERVICE_ROLE_KEY` (fallback — already set on Vercel
 *     for cloud sync, so the user doesn't need to add a new env var for the
 *     one-shot migration).
 * Either unlocks the endpoint. Both are server-side secrets the caller
 * wouldn't know without privileged access. Comparison is timing-safe
 * (sha256-normalized buffers + crypto.timingSafeEqual). In dev
 * (`NODE_ENV !== 'production'`) the token check is skipped when no secrets
 * are configured; in production at least one secret MUST be set.
 *
 * DB URL OVERRIDE
 * --------------
 * `?db_url=<URL-encoded postgres connection string>` — when provided (and the
 * caller is already authenticated), this endpoint creates a fresh PrismaClient
 * with that datasource URL instead of using the singleton `db` (which reads
 * `process.env.DATABASE_URL`). This lets us run the migration against a
 * corrected/updated DB URL WITHOUT first having to update Vercel env vars +
 * redeploy. Useful when the saved DATABASE_URL has a typo or stale project
 * ref — the caller passes the correct URL inline, the endpoint provisions the
 * schema, and the app's runtime endpoints continue using the env var (which
 * the user can update at leisure via the Vercel dashboard).
 *
 * MODES
 * -----
 * ?dry=1  → don't run DDL, just return connection + current table list.
 * (no dry) → run the SQL, then return the post-migration table list.
 */

const SQL_FILE_NAME = 'supabase-schema.sql'

/** Timing-safe secret comparison: hash both sides with sha256 first so the
 *  buffers always have equal length, then compare with timingSafeEqual. */
function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** Extract the admin token: `Authorization: Bearer <token>` header.
 *  (The old `?token=` query fallback was removed — URLs get logged in
 *  access logs and proxies, which would leak the secret.) */
function extractToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim()
    if (bearer) return bearer
  }
  return ''
}

/** Strip line comments + split a SQL file into individual statements. */
function parseSqlStatements(rawSql: string): string[] {
  const withoutComments = rawSql
    .split('\n')
    .map((line) => {
      // Strip `-- ...` line comments. We assume no `--` inside string
      // literals in our DDL (this is true for the auto-generated file).
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join('\n')
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

type TableRow = { tablename: string }
type VersionRow = { version: string } | { current_database: string }

async function listTables(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `
  return rows.map((r) => r.tablename)
}

async function dbInfo(client: PrismaClient): Promise<{ database: string; version: string }> {
  const rows = await client.$queryRaw<VersionRow[]>`
    SELECT current_database() AS current_database, version() AS version
  `
  const row = (rows[0] ?? {}) as { current_database?: string; version?: string }
  return {
    database: row.current_database ?? 'unknown',
    version: row.version ? row.version.split('(')[0].trim() : 'unknown',
  }
}

/** Build the Prisma client: override URL if provided, else use the singleton. */
function getClient(overrideUrl?: string): { client: PrismaClient; isOverride: boolean } {
  if (overrideUrl) {
    return {
      client: new PrismaClient({
        // datasourceUrl overrides process.env.DATABASE_URL for this instance.
        datasourceUrl: overrideUrl,
        log: ['error', 'warn'],
      }),
      isOverride: true,
    }
  }
  return { client: defaultDb, isOverride: false }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = extractToken(req)
  const expectedAdmin = process.env.ADMIN_MIGRATION_TOKEN ?? ''
  const expectedServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const isProd = process.env.NODE_ENV === 'production'
  const dry = url.searchParams.get('dry') === '1'
  // Optional DB URL override. URL-encoded postgres connection string.
  const dbUrlOverride = url.searchParams.get('db_url') ?? ''

  // Auth gate. Two acceptable secrets: ADMIN_MIGRATION_TOKEN (preferred)
  // OR SUPABASE_SERVICE_ROLE_KEY (fallback — already on Vercel for cloud
  // sync). Timing-safe comparison on both.
  const matchesAdmin = tokenMatches(token, expectedAdmin)
  const matchesServiceRole = tokenMatches(token, expectedServiceRole)

  if (isProd) {
    if (!expectedAdmin && !expectedServiceRole) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Neither ADMIN_MIGRATION_TOKEN nor SUPABASE_SERVICE_ROLE_KEY is set in production. Set at least one in Vercel env vars and redeploy.',
        },
        { status: 500 }
      )
    }
    if (!matchesAdmin && !matchesServiceRole) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing token.' },
        { status: 401 }
      )
    }
  } else {
    // Dev: still prefer a token, but allow it if unset (for local
    // convenience). Never reachable in production — the isProd branch
    // above is the only other path.
    if ((expectedAdmin || expectedServiceRole) && !matchesAdmin && !matchesServiceRole) {
      return NextResponse.json(
        { ok: false, error: 'Invalid token.' },
        { status: 401 }
      )
    }
  }

  // Locate the SQL file. Vercel deploys the project root, so this resolves to
  // `<repo>/supabase-schema.sql`. Fall back to a couple of common locations.
  const candidates = [
    join(process.cwd(), SQL_FILE_NAME),
    join(process.cwd(), 'public', SQL_FILE_NAME),
    join(process.cwd(), 'src', 'app', 'api', 'admin', 'migrate', SQL_FILE_NAME),
  ]
  let sqlText: string | null = null
  let sqlPath: string | null = null
  for (const p of candidates) {
    try {
      sqlText = readFileSync(p, 'utf8')
      sqlPath = p
      break
    } catch {
      // try next
    }
  }

  // Acquire the Prisma client (override or default singleton).
  const { client, isOverride } = getClient(dbUrlOverride || undefined)

  // Connection probe — this is where the DB-unreachable error would surface.
  let info: { database: string; version: string } | null = null
  let preTables: string[] | null = null
  let connectionError: string | null = null
  try {
    info = await dbInfo(client)
    preTables = await listTables(client)
  } catch (err) {
    connectionError = err instanceof Error ? err.message : String(err)
  } finally {
    // Release override client immediately — we'll re-acquire for the DDL pass
    // (cheap; avoids holding a connection open during the long DDL loop).
    if (isOverride) {
      try {
        await client.$disconnect()
      } catch {
        // ignore
      }
    }
  }

  // Dry mode: stop here with diagnostics only.
  if (dry) {
    return NextResponse.json({
      ok: connectionError === null,
      mode: 'dry-run',
      sqlFile: sqlPath,
      sqlFound: sqlText !== null,
      sqlStatementCount: sqlText ? parseSqlStatements(sqlText).length : 0,
      dbUrlOverride: dbUrlOverride ? '(override active)' : '(using process.env.DATABASE_URL)',
      database: info,
      tablesBefore: preTables,
      connectionError,
    })
  }

  // Require the SQL file for actual migration.
  if (!sqlText || !sqlPath) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not find ${SQL_FILE_NAME}. Tried: ${candidates.join(', ')}`,
        database: info,
        tablesBefore: preTables,
        connectionError,
      },
      { status: 500 }
    )
  }

  if (connectionError) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Database is unreachable from this runtime. ' +
          'Check DATABASE_URL (must be the DIRECT connection ' +
          '`postgresql://postgres:<PWD>@db.<ref>.supabase.co:5432/postgres`, ' +
          'NOT the pooler). The pooler returns `tenant not found` for some projects. ' +
          'You can also pass ?db_url=<URL-encoded postgres URL> to override.',
        details: connectionError,
      },
      { status: 502 }
    )
  }

  // Execute statements sequentially. Re-acquire the override client for the
  // DDL pass (we released it after the probe above). Use a fresh local var.
  const ddlClient = isOverride
    ? new PrismaClient({ datasourceUrl: dbUrlOverride, log: ['error', 'warn'] })
    : defaultDb

  const statements = parseSqlStatements(sqlText)
  const executed: string[] = []
  const skipped: string[] = []
  const failed: { index: number; sql: string; error: string }[] = []
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const head = stmt.replace(/\s+/g, ' ').slice(0, 80)
      try {
        // $executeRawUnsafe is fine for DDL with no user input.
        await ddlClient.$executeRawUnsafe(stmt)
        executed.push(head)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // The schema file is idempotent (IF NOT EXISTS everywhere), but
        // Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — a re-run reports
        // "already exists" for constraints. That is a benign skip, not a
        // failure: the object is present either way.
        if (/already exists/i.test(msg)) {
          skipped.push(head)
        } else {
          failed.push({ index: i, sql: head, error: msg })
        }
        // Continue — failures are reported, never fatal.
      }
    }
  } finally {
    if (isOverride) {
      try {
        await ddlClient.$disconnect()
      } catch {
        // ignore
      }
    }
  }

  // Re-list tables after migration (re-acquire override client once more).
  let postTables: string[] = []
  const listClient = isOverride
    ? new PrismaClient({ datasourceUrl: dbUrlOverride, log: ['error'] })
    : defaultDb
  try {
    postTables = await listTables(listClient)
  } catch {
    // ignore — the diagnostic info from pre-flight is enough
  } finally {
    if (isOverride) {
      try {
        await listClient.$disconnect()
      } catch {
        // ignore
      }
    }
  }

  const expectedTables = [
    'AiProvider',
    'ChatMessage',
    'ChatSession',
    'EmailAccount',
    'GeneratedDocument',
    'GeneratedImage',
    'GeneratedVideo',
    'Project',
    'ProjectFile',
    'User',
    'UserMemory',
    'WhatsAppAccount',
    'WhatsAppMessage',
  ]
  const missing = expectedTables.filter((t) => !postTables.includes(t))

  return NextResponse.json({
    ok: failed.length === 0 && missing.length === 0,
    mode: 'migrate',
    sqlFile: sqlPath,
    sqlStatements: statements.length,
    executedCount: executed.length,
    skippedAlreadyExists: skipped.length,
    failed,
    dbUrlOverride: dbUrlOverride ? '(override active)' : '(using process.env.DATABASE_URL)',
    database: info,
    tablesBefore: preTables,
    tablesAfter: postTables,
    expectedTables,
    missingTables: missing,
    nextSteps:
      missing.length === 0
        ? 'All 13 tables exist. Auth + chat will work — try signing up.'
        : `Migration incomplete. ${missing.length} table(s) still missing: ${missing.join(', ')}`,
  })
}
