/**
 * Creates all NEXUS AI tables in Supabase.
 * Usage: SUPABASE_DB_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres bun run scripts/create-tables.ts
 */
import postgres from 'postgres'
import { readFileSync } from 'fs'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.log('Set SUPABASE_DB_URL first. Get it from Supabase Dashboard → Settings → Database → Connection string (Transaction pooler).')
  process.exit(1)
}

const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

try {
  await sql`SELECT 1`
  console.log('✓ Connected to Supabase Postgres')
  const schema = readFileSync('supabase-schema.sql', 'utf8')
  await sql.unsafe(schema)
  console.log('✓ All tables, policies, and buckets created!')
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  tables.forEach((t: any) => console.log('  ✓', t.table_name))
} catch (e) {
  console.error('✗', (e as Error).message)
} finally {
  await sql.end()
}
