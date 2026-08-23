import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { ImapFlow } from 'imapflow'
import nodemailer, { type Transporter } from 'nodemailer'
import { simpleParser, type ParsedMail } from 'mailparser'
import { db } from '@/lib/db'

/* ------------------------------------------------------------------ */
/* Credential encryption (AES-256-GCM, key from local secret)          */
/* ------------------------------------------------------------------ */

const globalForSecret = globalThis as unknown as { nexusEmailKey?: Buffer }

function getKey(): Buffer {
  if (!globalForSecret.nexusEmailKey) {
    const secret = process.env.NEXUS_EMAIL_SECRET ?? 'nexus-local-email-secret-v1'
    globalForSecret.nexusEmailKey = scryptSync(secret, 'nexus-email-salt-v1', 32)
  }
  return globalForSecret.nexusEmailKey
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/* ------------------------------------------------------------------ */
/* Provider presets                                                    */
/* ------------------------------------------------------------------ */

export interface EmailPreset {
  id: string
  label: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  hint: string
}

export const EMAIL_PRESETS: EmailPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Enable 2FA, then create an App Password at myaccount.google.com/apppasswords',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    hint: 'Use an App Password (account.microsoft.com → Security → App passwords)',
  },
  {
    id: 'yahoo',
    label: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Generate an App Password at account.security.yahoo.com',
  },
  {
    id: 'icloud',
    label: 'iCloud Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    hint: 'Use an App-Specific Password from appleid.apple.com',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Use an App Password from Zoho Mail settings',
  },
  {
    id: 'custom',
    label: 'Custom IMAP/SMTP',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Enter your provider’s IMAP & SMTP details manually',
  },
]

/* ------------------------------------------------------------------ */
/* Account helpers                                                     */
/* ------------------------------------------------------------------ */

export interface ResolvedAccount {
  id: string
  label: string
  email: string
  fromName: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  password: string
}

export async function getPrimaryAccount(): Promise<ResolvedAccount | null> {
  const account = await db.emailAccount.findFirst({
    where: { status: 'connected' },
    orderBy: { createdAt: 'asc' },
  })
  if (!account) return null
  return {
    id: account.id,
    label: account.label,
    email: account.email,
    fromName: account.fromName,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
    username: account.username,
    password: decryptSecret(account.passwordEnc),
  }
}

/* ------------------------------------------------------------------ */
/* Error extraction                                                    */
/* ------------------------------------------------------------------ */

/** imapflow throws generic "Command failed" — extract the real server response. */
function describeImapError(error: unknown): string {
  const err = error as { responseText?: string; serverResponseCode?: string; message?: string }
  const responseText = err?.responseText ?? ''
  const code = err?.serverResponseCode ?? ''

  if (code === 'AUTHENTICATIONFAILED' || /invalid credentials|login failed|authentication/i.test(responseText)) {
    return 'Invalid credentials. Gmail requires an APP PASSWORD (not your regular password): enable 2-Step Verification, then create one at myaccount.google.com/apppasswords. Other providers need app passwords too.'
  }
  if (/UNAVAILABLE|temporarily unavailable/i.test(responseText)) {
    return 'Mail server temporarily unavailable — try again in a minute.'
  }
  if (code || responseText) {
    return `Mail server said: ${responseText || code}`
  }
  if (/timeout|etimedout/i.test(String(error))) {
    return 'Connection timed out — check the host and port.'
  }
  if (/ENOTFOUND|ECONNREFUSED/i.test(String(error))) {
    return 'Could not reach the mail server — check the host address.'
  }
  return error instanceof Error ? error.message : 'IMAP connection failed.'
}

/* ------------------------------------------------------------------ */
/* IMAP + SMTP operations                                              */
/* ------------------------------------------------------------------ */

export interface EmailSummary {
  uid: number
  subject: string
  from: string
  fromName: string
  date: string | null
  snippet: string
}

export async function listEmails(
  account: ResolvedAccount,
  opts: { folder?: string; limit?: number } = {}
): Promise<{ folder: string; total: number; emails: EmailSummary[] }> {
  const folder = opts.folder ?? 'INBOX'
  const limit = Math.min(opts.limit ?? 10, 25)

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.username, pass: account.password },
    logger: false,
  })
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      const exists = client.mailbox?.exists ?? 0
      if (exists === 0) return { folder, total: 0, emails: [] }

      const start = Math.max(1, exists - limit + 1)
      const emails: EmailSummary[] = []
      for await (const msg of client.fetch(`${start}:*`, {
        envelope: true,
        uid: true,
        bodyStructure: false,
        headers: false,
      })) {
        // Snippet: fetch first text part cheaply
        let snippet = ''
        emails.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? '(no subject)',
          from: msg.envelope?.from?.[0]?.address ?? 'unknown',
          fromName: msg.envelope?.from?.[0]?.name ?? '',
          date: msg.envelope?.date?.toISOString() ?? null,
          snippet,
        })
      }
      emails.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      return { folder, total: exists, emails }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

export async function searchEmails(
  account: ResolvedAccount,
  query: string,
  opts: { folder?: string; limit?: number } = {}
): Promise<{ query: string; folder: string; matches: EmailSummary[] }> {
  const folder = opts.folder ?? 'INBOX'
  const limit = Math.min(opts.limit ?? 10, 25)

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.username, pass: account.password },
    logger: false,
  })
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      let uids: number[] = []
      try {
        uids = await client.search({ subject: query })
      } catch {
        uids = []
      }
      let fromUids: number[] = []
      try {
        fromUids = await client.search({ from: query })
      } catch {
        fromUids = []
      }
      const all = [...new Set([...uids, ...fromUids])].slice(-limit)
      const matches: EmailSummary[] = []
      for (const uid of all) {
        const msg = await client.fetchOne(String(uid), { envelope: true, uid: true }, { uid: true })
        if (msg) {
          matches.push({
            uid: msg.uid,
            subject: msg.envelope?.subject ?? '(no subject)',
            from: msg.envelope?.from?.[0]?.address ?? 'unknown',
            fromName: msg.envelope?.from?.[0]?.name ?? '',
            date: msg.envelope?.date?.toISOString() ?? null,
            snippet: '',
          })
        }
      }
      matches.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      return { query, folder, matches }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

export async function readEmail(
  account: ResolvedAccount,
  uid: number,
  folder = 'INBOX'
): Promise<{ uid: number; subject: string; from: string; to: string; date: string | null; text: string }> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.username, pass: account.password },
    logger: false,
  })
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      const raw = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true })
      const source = (raw as { source?: Buffer } | null)?.source
      if (!source) throw new Error(`Email #${uid} not found in ${folder}.`)
      const parsed: ParsedMail = await simpleParser(source)
      return {
        uid,
        subject: parsed.subject ?? '(no subject)',
        from: parsed.from?.text ?? 'unknown',
        to: parsed.to?.text ?? '',
        date: parsed.date?.toISOString() ?? null,
        text: (parsed.text ?? '').slice(0, 5000),
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

export async function sendEmail(
  account: ResolvedAccount,
  opts: { to: string; subject: string; body: string }
): Promise<{ messageId: string; previewUrl: string | null }> {
  const transporter: Transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: { user: account.username, pass: account.password },
  })
  const from = account.fromName
    ? `"${account.fromName}" <${account.email}>`
    : account.email
  const info = await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  })
  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) ?? null,
  }
}

/** Verifies IMAP + SMTP connectivity for an account. */
export async function verifyAccount(
  account: Omit<ResolvedAccount, 'id' | 'label' | 'fromName'> & { id?: string }
): Promise<{ ok: boolean; message: string }> {
  // IMAP check
  try {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: true,
      auth: { user: account.username, pass: account.password },
      logger: false,
    })
    await client.connect()
    await client.logout().catch(() => client.close())
  } catch (error) {
    return { ok: false, message: `IMAP failed: ${describeImapError(error)}` }
  }

  // SMTP check
  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: { user: account.username, pass: account.password },
    })
    await transporter.verify()
    return { ok: true, message: 'IMAP and SMTP both connected successfully.' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'cannot connect'
    if (/auth|credential|535|login/i.test(msg)) {
      return {
        ok: false,
        message:
          'SMTP failed: Invalid credentials. You need an APP PASSWORD (not your regular password). For Gmail: myaccount.google.com/apppasswords',
      }
    }
    return { ok: false, message: `SMTP failed: ${msg}` }
  }
}
