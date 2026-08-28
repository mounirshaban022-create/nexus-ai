import { db } from '@/lib/db'

/* ------------------------------------------------------------------ */
/* SCHEMA GUARD — self-healing per-user columns + durable file bytes.  */
/*                                                                     */
/* WHY THIS EXISTS: the security + media fixes added `userId` columns  */
/* to EmailAccount / AiProvider / WhatsAppAccount and `data`/`mimeType`*/
/* to GeneratedDocument. The production Supabase DB may NOT have these */
/* columns yet (the one-shot /api/admin/migrate endpoint requires a    */
/* token the deploy can't always supply). Without them, every scoped    */
/* query (`where: { userId }`) crashes with `column "userId" does not  */
/* exist`, breaking email/WhatsApp/AI-provider routes entirely.        */
/*                                                                     */
/* This guard runs the idempotent `ALTER TABLE ... ADD COLUMN IF NOT   */
/* EXISTS` DDL ONCE per process (guarded by a global flag) the first   */
/* time a sensitive route loads. Postgres supports IF NOT EXISTS       */
/* (always succeeds, never duplicates). SQLite (local dev, already      */
/* migrated by `prisma db push`) reports "duplicate column" which we    */
/* catch + ignore. Either way the column exists after the call.        */
/*                                                                     */
/* The guard is best-effort: a failure logs but never throws, so a DB   */
/* hiccup can't take the route down. Correctness comes from the column */
/* existing — once it does, every subsequent request is normal.        */
/* ------------------------------------------------------------------ */

const globalForGuard = globalThis as unknown as { __nexusSchemaGuard?: boolean }

const GUARD_DDL = [
  // Per-user private accounts (security fix)
  `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `ALTER TABLE "AiProvider" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  // Durable file bytes (media fix — office docs + edited docs survive /tmp)
  `ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "data" TEXT`,
  `ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT`,
]

/**
 * Ensures the per-user + durable-bytes columns exist on the live DB.
 * Runs at most once per process (the global flag is set after the first
 * pass, success or fail). Safe to call from every sensitive route — the
 * first call does the DDL, the rest are a no-op.
 */
export async function ensurePerUserColumns(): Promise<void> {
  if (globalForGuard.__nexusSchemaGuard) return
  globalForGuard.__nexusSchemaGuard = true
  try {
    for (const ddl of GUARD_DDL) {
      try {
        await db.$executeRawUnsafe(ddl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Postgres: IF NOT EXISTS → never errors here.
        // SQLite (already migrated): "duplicate column name" is benign.
        // Any other error is logged but never fatal.
        if (!/duplicate column|already exists/i.test(msg)) {
          console.warn('[schema-guard] DDL skipped:', ddl.slice(0, 60), '→', msg.slice(0, 120))
        }
      }
    }
    // Best-effort indexes (speed up the scoped queries). Postgres only;
    // SQLite CREATE INDEX IF NOT EXISTS works too.
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "EmailAccount_userId_createdAt_idx" ON "EmailAccount"("userId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "AiProvider_userId_createdAt_idx" ON "AiProvider"("userId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "WhatsAppAccount_userId_createdAt_idx" ON "WhatsAppAccount"("userId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "GeneratedDocument_userId_createdAt_idx" ON "GeneratedDocument"("userId", "createdAt")`,
    ]
    for (const idx of indexes) {
      try {
        await db.$executeRawUnsafe(idx)
      } catch {
        /* index may already exist or name-collide — ignore */
      }
    }
  } catch (err) {
    console.warn('[schema-guard] overall failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}
