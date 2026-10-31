/**
 * Seeds local dev DB with representative data + runs the console E2E smoke test.
 * Usage: node scripts/console-smoke.mjs (expects dev server on :3111)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function seed() {
  const existing = await db.user.count()
  if (existing > 0) return console.log('seed skipped —', existing, 'users exist')
  const bcrypt = await import('bcryptjs')
  const hash = await bcrypt.hash('demo-password-1', 10)
  const u = await db.user.create({
    data: { email: 'demo@nexus.app', name: 'Demo User', passwordHash: hash, emailVerified: true, lastActiveAt: new Date() },
  })
  const s1 = await db.chatSession.create({ data: { title: 'Plan a Dubai product launch', userId: u.id } })
  await db.chatMessage.createMany({
    data: [
      { sessionId: s1.id, role: 'user', content: 'Help me plan a product launch in Dubai next quarter.' },
      { sessionId: s1.id, role: 'assistant', content: 'Great goal! Start with a venue like DIFC, target Gulf tech media, and schedule around GITEX for maximum coverage.', thinking: 'User wants launch planning; suggest venue, PR, timing.' },
      { sessionId: s1.id, role: 'user', content: 'What about budget?' },
      { sessionId: s1.id, role: 'assistant', content: 'A realistic floor for a credible launch event is 40-60k AED including venue, catering and media outreach.' },
    ],
  })
  await db.chatSession.create({ data: { title: 'Guest: recipe idea' } }) // guest session
  await db.generatedImage.create({
    data: { prompt: 'smoke test gradient art', size: '1024x1024', provider: 'pollinations', url: '', data: Buffer.from('png-bytes-smoke-test').toString('base64'), userId: u.id },
  })
  await db.generatedDocument.create({
    data: { filename: 'smoke-report.docx', format: 'docx', title: 'Smoke Report', summary: 'test', downloadUrl: '', size: 2048, data: Buffer.from('docx-bytes').toString('base64'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', userId: u.id },
  })
  console.log('seeded 1 user, 2 sessions, 4 messages, 1 image, 1 document')
  await db.$disconnect()
}

const BASE = 'http://localhost:3111/api/console'
let cookie = ''

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

const results = []
function check(name, cond, extra) {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

async function main() {
  await seed()

  // login with correct password
  let r = await call('POST', '/session', { password: 'test-console-pw' })
  check('console login', r.status === 200 && !!cookie)

  // overview
  r = await call('GET', '/overview')
  check('overview', r.status === 200 && r.json?.users?.total >= 1 && r.json?.conversations?.messages >= 4,
    `users=${r.json?.users?.total} msgs=${r.json?.conversations?.messages} dbLatency=${r.json?.platform?.dbLatencyMs}ms`)
  check('overview engines (zai disabled, pollinations live)',
    r.json?.engines?.zai === false && r.json?.engines?.pollinations === true)

  // users
  r = await call('GET', '/users')
  const demo = r.json?.users?.find(u => u.email === 'demo@nexus.app')
  check('users list + stats', r.status === 200 && demo?.stats?.messages >= 4, `demo msgs=${demo?.stats?.messages}`)

  // suspend → unsuspend
  r = await call('PATCH', `/users/${demo.id}`, { action: 'suspend' })
  check('suspend user', r.json?.suspended === true)
  r = await call('PATCH', `/users/${demo.id}`, { action: 'unsuspend' })
  check('unsuspend user', r.json?.suspended === false)

  // conversations + transcript
  r = await call('GET', '/conversations')
  const sess = r.json?.sessions?.find(s => s.messageCount > 0)
  check('conversations list', r.status === 200 && r.json?.sessions?.length >= 2, `total=${r.json?.total}`)
  r = await call('GET', `/conversations/${sess.id}`)
  check('full transcript', r.status === 200 && r.json?.messages?.length >= 4 && r.json?.messages?.some(m => m.thinking),
    `msgs=${r.json?.messages?.length} thinking=${r.json?.stats?.withThinking}`)

  // generations
  r = await call('GET', '/generations?type=images')
  check('generations images', r.status === 200 && r.json?.items?.length >= 1)
  const imgId = r.json?.items?.[0]?.id
  r = await call('GET', `/generations/file/images/${imgId}`)
  check('image bytes serve', r.status === 200)

  // documents studio
  r = await call('GET', '/documents')
  check('documents GET (templates+docs)', r.status === 200 && r.json?.templates?.length >= 5)
  r = await call('POST', '/documents', {
    template: 'invoice',
    fields: { from: 'Nexus Labs', billTo: 'Acme FZ-LLC', invoiceNo: 'INV-001', items: 'Design system | 1 | 4000\nConsulting | 10 | 150', taxRate: '5' },
  })
  check('document generate (real docx)', r.status === 200 && r.json?.document?.size > 1000, `${r.json?.document?.size} bytes`)
  if (r.json?.document?.id) {
    const res = await fetch(`http://localhost:3111/api/console/generations/file/documents/${r.json.document.id}`, { headers: { Cookie: cookie } })
    check('document download', res.status === 200 && (res.headers.get('content-disposition') ?? '').includes('.docx'))
  }

  // studio
  r = await call('GET', '/studio')
  check('studio engines inventory', r.status === 200 && r.json?.engines?.chat?.length >= 2)
  r = await call('POST', '/studio', { test: 'chat', prompt: 'Reply with exactly: CONSOLE-OK' })
  check('studio chat test (no keys locally → graceful)', r.status === 200 || r.status === 502, `status=${r.status}`)

  // integrations
  r = await call('GET', '/integrations')
  check('integrations probe', r.status === 200 && 'presence' in r.json,
    `github=${r.json?.integrations?.github?.ok} vercel=${r.json?.integrations?.vercel?.ok} deployments=${r.json?.deployments?.length ?? 0}`)

  // unauth guard
  const noCookie = await fetch(BASE + '/overview')
  check('auth guard (401 without cookie)', noCookie.status === 401)

  // audit
  r = await call('GET', '/overview')
  check('audit trail populated', r.json?.auditTrail?.length >= 1, `${r.json?.auditTrail?.length} entries`)

  console.log('\n=== CONSOLE SMOKE RESULTS ===')
  for (const line of results) console.log(line)
  const fails = results.filter(x => x.startsWith('FAIL')).length
  console.log(`\n${results.length - fails}/${results.length} passed`)
  process.exit(fails ? 1 : 0)
}

main().catch(e => { console.error('smoke error:', e); process.exit(1) })
