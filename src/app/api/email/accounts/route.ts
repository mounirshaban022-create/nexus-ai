import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { encryptSecret, verifyAccount, EMAIL_PRESETS } from '@/lib/email'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const accounts = await db.emailAccount.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        email: true,
        imapHost: true,
        smtpHost: true,
        status: true,
        statusMessage: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ accounts, presets: EMAIL_PRESETS })
  } catch (error) {
    console.error('[api/email/accounts] GET error:', error)
    return NextResponse.json({ error: 'Failed to load accounts.' }, { status: 500 })
  }
}

const createSchema = z.object({
  label: z.string().min(1).max(60),
  email: z.string().email().max(200),
  fromName: z.string().max(80).optional().default(''),
  imapHost: z.string().min(3).max(200),
  imapPort: z.number().int().min(1).max(65535).default(993),
  smtpHost: z.string().min(3).max(200),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const limit = rateLimit(`email-add:${clientKey(req)}`, 10, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many attempts. Wait a moment.' }, { status: 429 })
    }

    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please fill all fields correctly.' }, { status: 400 })
    }
    const data = parsed.data

    // Verify IMAP + SMTP before saving
    const verification = await verifyAccount({
      email: data.email,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      username: data.username,
      password: data.password,
    })

    const account = await db.emailAccount.create({
      data: {
        label: data.label,
        email: data.email,
        fromName: data.fromName,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecure: data.smtpSecure,
        username: data.username,
        passwordEnc: encryptSecret(data.password),
        status: verification.ok ? 'connected' : 'error',
        statusMessage: verification.message,
      },
      select: { id: true, label: true, email: true, status: true, statusMessage: true },
    })

    return NextResponse.json({ account, verification })
  } catch (error) {
    console.error('[api/email/accounts] POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to add account.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
