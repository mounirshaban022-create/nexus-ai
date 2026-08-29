import { db } from '@/lib/db'

/* ------------------------------------------------------------------ */
/* CONSOLE SCHEMA GUARD — self-healing console tables                  */
/*                                                                     */
/* The admin console lives INSIDE the NEXUS app (this deployment) and  */
/* needs three auxiliary tables that do not belong in the main app     */
/* schema: an audit log, per-user control flags, and console settings. */
/*                                                                     */
/* Mirrors the exact self-healing pattern of src/lib/schema-guard.ts:  */
/* idempotent `CREATE TABLE IF NOT EXISTS` DDL, run at most once per   */
/* process, best-effort (logged, never thrown). Postgres accepts       */
/* IF NOT EXISTS natively; SQLite (local dev) reports "table already   */
/* exists" which we swallow. No existing app table is ever touched.    */
/* ------------------------------------------------------------------ */

const globalForConsoleGuard = globalThis as unknown as { __nexusConsoleGuard?: boolean }

const CONSOLE_DDL = [
  `CREATE TABLE IF NOT EXISTS "ConsoleAudit" (
     "id" TEXT PRIMARY KEY,
     "action" TEXT NOT NULL,
     "target" TEXT,
     "detail" TEXT,
     "ip" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS "ConsoleUserFlag" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL,
     "suspended" BOOLEAN NOT NULL DEFAULT false,
     "note" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS "ConsoleSetting" (
     "key" TEXT PRIMARY KEY,
     "value" TEXT NOT NULL,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ConsoleAudit_createdAt_idx" ON "ConsoleAudit"("createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ConsoleUserFlag_userId_key" ON "ConsoleUserFlag"("userId")`,
]

export async function ensureConsoleTables(): Promise<void> {
  if (globalForConsoleGuard.__nexusConsoleGuard) return
  globalForConsoleGuard.__nexusConsoleGuard = true
  try {
    for (const ddl of CONSOLE_DDL) {
      try {
        await db.$executeRawUnsafe(ddl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/already exists|duplicate/i.test(msg)) {
          console.warn('[console/guard] DDL skipped:', ddl.slice(0, 60), '→', msg.slice(0, 120))
        }
      }
    }
  } catch (err) {
    console.warn('[console/guard] ensure failed (best-effort):', err instanceof Error ? err.message : err)
  }
}

/** Append one audit row. Fire-and-forget — never throws. */
export async function audit(action: string, opts?: { target?: string; detail?: string; ip?: string }): Promise<void> {
  try {
    await ensureConsoleTables()
    const id = `ca_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await db.$executeRawUnsafe(
      `INSERT INTO "ConsoleAudit" ("id","action","target","detail","ip","createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
      id, action, opts?.target ?? null, opts?.detail ?? null, opts?.ip ?? null
    )
  } catch (err) {
    console.warn('[console/audit] append failed:', err instanceof Error ? err.message : err)
  }
}

/** Read the last N audit rows (newest first). */
export async function recentAudit(limit = 50): Promise<{ id: string; action: string; target: string | null; detail: string | null; ip: string | null; createdAt: string }[]> {
  try {
    await ensureConsoleTables()
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id","action","target","detail","ip","createdAt" FROM "ConsoleAudit" ORDER BY "createdAt" DESC LIMIT ${Math.min(limit, 200)}`
    )
    return rows.map(r => ({
      id: String(r.id), action: String(r.action),
      target: r.target ? String(r.target) : null,
      detail: r.detail ? String(r.detail) : null,
      ip: r.ip ? String(r.ip) : null,
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt))).toISOString(),
    }))
  } catch {
    return []
  }
}

/** Get a per-user control flag row (or null). */
export async function getUserFlag(userId: string): Promise<{ suspended: boolean; note: string | null } | null> {
  try {
    await ensureConsoleTables()
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "suspended","note" FROM "ConsoleUserFlag" WHERE "userId" = $1 LIMIT 1`, userId
    )
    if (!rows.length) return null
    return { suspended: Boolean(rows[0].suspended), note: rows[0].note ? String(rows[0].note) : null }
  } catch {
    return null
  }
}

/** Set (or clear) the suspension flag for a user. */
export async function setUserSuspended(userId: string, suspended: boolean, note?: string): Promise<void> {
  await ensureConsoleTables()
  await db.$executeRawUnsafe(
    `INSERT INTO "ConsoleUserFlag" ("id","userId","suspended","note","updatedAt")
     VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
     ON CONFLICT ("userId")
     DO UPDATE SET "suspended" = EXCLUDED."suspended", "note" = EXCLUDED."note", "updatedAt" = CURRENT_TIMESTAMP`,
    `cuf_${userId.slice(0, 12)}${Date.now().toString(36)}`, userId, suspended, note ?? null
  )
}
