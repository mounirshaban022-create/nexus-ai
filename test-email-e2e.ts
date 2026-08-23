import nodemailer from 'nodemailer'

async function main() {
  // 1. Create a real test account
  const acct = await nodemailer.createTestAccount()

  // 2. Add account via app API (gets verified via IMAP+SMTP)
  const addRes = await fetch('http://localhost:3000/api/email/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Test Mailbox',
      email: acct.user,
      fromName: 'NEXUS Test',
      imapHost: 'imap.ethereal.email',
      imapPort: 993,
      smtpHost: acct.smtp.host,
      smtpPort: acct.smtp.port,
      smtpSecure: acct.smtp.secure,
      username: acct.user,
      password: acct.pass,
    }),
  })
  const added = await addRes.json()
  console.log('ADD ACCOUNT:', addRes.status, JSON.stringify(added.account ?? added))

  if (!added.account?.id) return

  // 3. Seed inbox: send 2 emails to the account
  const t = nodemailer.createTransport({
    host: acct.smtp.host, port: acct.smtp.port, secure: acct.smtp.secure,
    auth: { user: acct.user, pass: acct.pass },
  })
  await t.sendMail({ from: '"Alice" <alice@example.com>', to: acct.user, subject: 'Q4 budget review', text: 'Please review the Q4 budget before Friday.' })
  await t.sendMail({ from: '"Bob" <bob@example.com>', to: acct.user, subject: 'Flight confirmation DXB-LHR', text: 'Your flight EK001 departs 09:30.' })

  // 4. email_list connector
  const listRes = await fetch('http://localhost:3000/api/connectors/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'email_list', args: { limit: '5' } }),
  })
  const list = await listRes.json()
  console.log('EMAIL_LIST:', JSON.stringify(list.result).slice(0, 400))

  // 5. email_search connector
  const searchRes = await fetch('http://localhost:3000/api/connectors/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'email_search', args: { query: 'budget' } }),
  })
  const search = await searchRes.json()
  console.log('EMAIL_SEARCH "budget":', JSON.stringify(search.result).slice(0, 250))

  // 6. email_read connector
  const readRes = await fetch('http://localhost:3000/api/connectors/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'email_read', args: { uid: '2' } }),
  })
  const read = await readRes.json()
  console.log('EMAIL_READ uid=2:', JSON.stringify(read.result).slice(0, 300))

  // 7. email_send connector (real send with preview URL)
  const sendRes = await fetch('http://localhost:3000/api/connectors/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'email_send',
      args: { to: acct.user, subject: 'NEXUS Agent report', body: 'This email was sent by the NEXUS AI agent through your real account.' },
    }),
  })
  const send = await sendRes.json()
  console.log('EMAIL_SEND:', JSON.stringify(send.result).slice(0, 350))
}

main()
