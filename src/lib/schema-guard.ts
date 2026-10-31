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

/* ------------------------------------------------------------------ */
/* PARSED DOCUMENT STORE — durable parsed-document persistence.        */
/*                                                                     */
/* WHY: documents were parsed into an in-memory Map (per-instance). On */
/* Vercel, the upload (POST) and the follow-up read (GET — chat        */
/* attachment context, Studio import, document Q&A) can land on        */
/* DIFFERENT serverless instances → "Document not found" → the chat    */
/* only ever saw a 500-char preview. This table makes parsed docs      */
/* durable (additive, self-healing — same pattern as the columns       */
/* above; no existing table is touched).                               */
/* ------------------------------------------------------------------ */

export interface ParsedDocumentRow {
  id: string
  userId: string | null
  filename: string
  format: string
  title: string
  text: string
  sections: string // JSON
  tables: string // JSON
  metadata: string // JSON
  createdAt?: string
}

const globalForParsedDocGuard = globalThis as unknown as { __nexusParsedDocGuard?: boolean }

/** True when the live datasource is Postgres (Supabase); SQLite in local dev. */
function isPostgres(): boolean {
  const url = process.env.DATABASE_URL ?? ''
  return !url.startsWith('file:')
}

/**
 * Ensures the ParsedDocument table exists. Runs at most once per process,
 * best-effort (a DB hiccup logs but never throws — in-memory store still
 * covers the warm-instance path).
 */
export async function ensureParsedDocumentTable(): Promise<void> {
  if (globalForParsedDocGuard.__nexusParsedDocGuard) return
  globalForParsedDocGuard.__nexusParsedDocGuard = true
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ParsedDocument" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "filename" TEXT NOT NULL,
        "format" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "sections" TEXT NOT NULL DEFAULT '[]',
        "tables" TEXT NOT NULL DEFAULT '[]',
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await db
      .$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "ParsedDocument_userId_createdAt_idx" ON "ParsedDocument"("userId", "createdAt")`
      )
      .catch(() => {
        /* index may already exist — non-fatal */
      })
  } catch (err) {
    console.warn(
      '[schema-guard] ParsedDocument table ensure failed (non-fatal):',
      err instanceof Error ? err.message : err
    )
  }
}

/** Positional placeholder for the live dialect ($1.. Postgres, ?.. SQLite). */
function ph(n: number): string {
  return isPostgres() ? `$${n}` : '?'
}

/** Persist a parsed document (best-effort — never throws). */
export async function persistParsedDocument(row: ParsedDocumentRow): Promise<void> {
  await ensureParsedDocumentTable()
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "ParsedDocument" ("id","userId","filename","format","title","text","sections","tables","metadata")
       VALUES (${ph(1)},${ph(2)},${ph(3)},${ph(4)},${ph(5)},${ph(6)},${ph(7)},${ph(8)},${ph(9)})
       ON CONFLICT ("id") DO NOTHING`,
      row.id,
      row.userId,
      row.filename,
      row.format,
      row.title,
      row.text,
      row.sections,
      row.tables,
      row.metadata
    )
  } catch (err) {
    console.warn(
      '[schema-guard] parsed-document persist failed (non-fatal):',
      err instanceof Error ? err.message : err
    )
  }
}

/** Load a parsed document by id (null when missing / DB unavailable). */
export async function loadParsedDocument(id: string): Promise<ParsedDocumentRow | null> {
  await ensureParsedDocumentTable()
  try {
    const rows = (await db.$queryRawUnsafe<ParsedDocumentRow[]>(
      `SELECT "id","userId","filename","format","title","text","sections","tables","metadata","createdAt"
       FROM "ParsedDocument" WHERE "id" = ${ph(1)} LIMIT 1`,
      id
    )) as ParsedDocumentRow[]
    return rows[0] ?? null
  } catch (err) {
    console.warn(
      '[schema-guard] parsed-document load failed (non-fatal):',
      err instanceof Error ? err.message : err
    )
    return null
  }
}
