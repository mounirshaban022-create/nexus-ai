import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/admin/migrate — one-shot Supabase schema provisioning endpoint.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Supabase pooler (Supavisor) returns `tenant/user not found` for this
 * project when called from outside Supabase's own network. The project's
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
 * `?token=<ADMIN_MIGRATION_TOKEN>` must match `process.env.ADMIN_MIGRATION_TOKEN`.
 * If the env var is unset, the endpoint allows access ONLY when
 * `NODE_ENV !== 'production'` (so dev/staging can use it without a token,
 * but prod (Vercel) requires the token).
 *
 * MODES
 * -----
 * ?dry=1  → don't run DDL, just return connection + current table list.
 * (no dry) → run the SQL, then return the post-migration table list.
 */

const SQL_FILE_NAME = 'supabase-schema.sql'

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

async function listTables(): Promise<string[]> {
  const rows = await db.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `
  return rows.map((r) => r.tablename)
}

async function dbInfo(): Promise<{ database: string; version: string }> {
  const rows = await db.$queryRaw<VersionRow[]>`
    SELECT current_database() AS current_database, version() AS version
  `
  const row = (rows[0] ?? {}) as { current_database?: string; version?: string }
  return {
    database: row.current_database ?? 'unknown',
    version: row.version ? row.version.split('(')[0].trim() : 'unknown',
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const expected = process.env.ADMIN_MIGRATION_TOKEN ?? ''
  const isProd = process.env.NODE_ENV === 'production'
  const dry = url.searchParams.get('dry') === '1'

  // Auth gate.
  if (isProd) {
    if (!expected) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ADMIN_MIGRATION_TOKEN is not set in production. Set it in Vercel env vars and redeploy.',
        },
        { status: 500 }
      )
    }
    if (!token || token !== expected) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing token.' },
        { status: 401 }
      )
    }
  } else {
    // Dev: still prefer a token, but allow it if unset (for local convenience).
    if (expected && token !== expected) {
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

  // Connection probe — this is where the DB-unreachable error would surface.
  let info: { database: string; version: string } | null = null
  let preTables: string[] | null = null
  let connectionError: string | null = null
  try {
    info = await dbInfo()
    preTables = await listTables()
  } catch (err) {
    connectionError = err instanceof Error ? err.message : String(err)
  }

  // Dry mode: stop here with diagnostics only.
  if (dry) {
    return NextResponse.json({
      ok: connectionError === null,
      mode: 'dry-run',
      sqlFile: sqlPath,
      sqlFound: sqlText !== null,
      sqlStatementCount: sqlText ? parseSqlStatements(sqlText).length : 0,
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
          'NOT the pooler). The pooler returns `tenant not found` for this project.',
        details: connectionError,
      },
      { status: 502 }
    )
  }

  // Execute statements sequentially. The SQL file uses
  // DROP ... CASCADE + CREATE TABLE + ALTER TABLE ADD CONSTRAINT — all DDL,
  // idempotent (safe to re-run), and best run one statement at a time so we
  // can pinpoint the first failure if any.
  const statements = parseSqlStatements(sqlText)
  const executed: string[] = []
  const failed: { index: number; sql: string; error: string }[] = []
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const head = stmt.replace(/\s+/g, ' ').slice(0, 80)
    try {
      // $executeRawUnsafe is fine for DDL with no user input.
      await db.$executeRawUnsafe(stmt)
      executed.push(head)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failed.push({ index: i, sql: head, error: msg })
      // Continue — many failures (e.g., "table doesn't exist" on a
      // redundant DROP) are non-fatal. We report all of them.
    }
  }

  // Re-list tables after migration.
  let postTables: string[] = []
  try {
    postTables = await listTables()
  } catch {
    // ignore — the diagnostic info from pre-flight is enough
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
    failed,
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
