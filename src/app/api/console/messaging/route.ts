import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireConsole } from '@/lib/console/auth'
import { audit } from '@/lib/console/guard'
import { decryptSecret } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/console/messaging — email + WhatsApp command center.
 *
 * GET  → every connected EmailAccount + WhatsAppAccount (credentials
 *        masked to status only) + recent WhatsApp conversations grouped
 *        by contact, with live delivery statuses.
 *
 * POST { channel: 'email', emailAccountId, to, subject, text }
 *        → sends a REAL email through the account's SMTP via nodemailer.
 * POST { channel: 'whatsapp', accountId, to, text }
 *        → sends a REAL WhatsApp message through the Meta Cloud API using
 *          the stored (encrypted) access token, recording the row in
 *          WhatsAppMessage so the app's inbox stays consistent.
 *
 * These are operator actions (support / outreach / testing) and are audited.
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const emailAccounts = await db.emailAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, userId: true, label: true, email: true, fromName: true,
        imapHost: true, imapPort: true, smtpHost: true, smtpPort: true, smtpSecure: true,
        status: true, statusMessage: true, createdAt: true, updatedAt: true,
        user: { select: { email: true, name: true } },
      },
    })

    const waAccounts = await db.whatsAppAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, userId: true, label: true, businessName: true, displayPhone: true,
        status: true, statusMessage: true, autoReply: true, agentPrompt: true,
        allowList: true, webhookVerified: true, verifyToken: true, createdAt: true, updatedAt: true,
        user: { select: { email: true, name: true } },
      },
    })

    // Recent WhatsApp traffic grouped per contact (last 50 messages).
    const waMessages = await db.whatsAppMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { account: { select: { label: true, displayPhone: true } } },
    })

    return NextResponse.json({
      email: { accounts: emailAccounts, configured: Boolean(process.env.NEXUS_EMAIL_SECRET) },
      whatsapp: {
        accounts: waAccounts.map(a => ({ ...a, verifyToken: a.webhookVerified ? '•••verified•••' : a.verifyToken })),
        messages: waMessages,
        threads: (() => {
          const byContact = new Map<string, typeof waMessages>()
          for (const m of waMessages) {
            const contact = m.direction === 'in' ? m.fromNumber : m.toNumber
            if (!byContact.has(contact)) byContact.set(contact, [] as typeof waMessages)
            byContact.get(contact)!.push(m)
          }
          return Array.from(byContact.entries()).map(([contact, msgs]) => ({
            contact, count: msgs.length, last: msgs[0],
          }))
        })(),
      },
    })
  } catch (error) {
    console.error('[api/console/messaging] GET error:', error)
    return NextResponse.json({ error: 'Failed to load messaging' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({}))
    const channel = String(body?.channel ?? '')

    if (channel === 'email') {
      const { emailAccountId, to, subject, text } = body
      const account = await db.emailAccount.findUnique({ where: { id: String(emailAccountId) } })
      if (!account) return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
      if (!to || !subject || !text) return NextResponse.json({ error: 'to, subject and text are required' }, { status: 400 })

      const nodemailer = await import('nodemailer')
      const password = decryptSecret(account.passwordEnc)
      const transport = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        auth: { user: account.username, pass: password },
      })
      const info = await transport.sendMail({
        from: account.fromName ? `"${account.fromName}" <${account.email}>` : account.email,
        to: String(to),
        subject: String(subject),
        text: String(text),
      })
      await audit('messaging.email_sent', { target: String(to), detail: `via ${account.email} (${info.messageId})` })
      return NextResponse.json({ ok: true, messageId: info.messageId })
    }

    if (channel === 'whatsapp') {
      const { accountId, to, text } = body
      const account = await db.whatsAppAccount.findUnique({ where: { id: String(accountId) } })
      if (!account) return NextResponse.json({ error: 'WhatsApp account not found' }, { status: 404 })
      if (!to || !text) return NextResponse.json({ error: 'to and text are required' }, { status: 400 })

      const token = decryptSecret(account.accessTokenEnc)
      const phoneId = account.phoneNumberId
      const apiVersion = 'v21.0'
      const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: String(to).replace(/[^\d]/g, ''),
          type: 'text',
          text: { preview_url: false, body: String(text) },
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg = result?.error?.message ?? `Graph API ${res.status}`
        await audit('messaging.whatsapp_failed', { target: String(to), detail: errMsg })
        return NextResponse.json({ error: errMsg }, { status: 502 })
      }

      const waMessageId: string | undefined = result?.messages?.[0]?.id
      await db.whatsAppMessage.create({
        data: {
          accountId: account.id,
          fromNumber: account.displayPhone || phoneId,
          toNumber: String(to).replace(/[^\d]/g, ''),
          direction: 'out',
          body: String(text),
          waMessageId: waMessageId ?? null,
          status: 'sent',
        },
      }).catch(async () => {
        // Legacy DB without unique-compatible shape — record minimal row.
        await db.whatsAppMessage.create({
          data: { accountId: account.id, fromNumber: account.displayPhone || phoneId, toNumber: String(to).replace(/[^\d]/g, ''), direction: 'out', body: String(text) },
        })
      })
      await audit('messaging.whatsapp_sent', { target: String(to), detail: waMessageId ?? undefined })
      return NextResponse.json({ ok: true, waMessageId })
    }

    return NextResponse.json({ error: `Unknown channel: ${channel}` }, { status: 400 })
  } catch (error) {
    console.error('[api/console/messaging] POST error:', error)
    const msg = error instanceof Error ? error.message : 'Send failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
