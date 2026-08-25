import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { encryptSecret } from '@/lib/email'
import {
  getWhatsAppAccount,
  toPublicAccount,
  generateVerifyToken,
  normalizeWaNumber,
} from '@/lib/whatsapp'
import { rateLimit, clientKey } from '@/lib/rate-limit'

/* ------------------------------------------------------------------ */
/* /api/whatsapp/account — the single WhatsApp connection (Phase 1).   */
/*                                                                     */
/* GET    → current config (token masked) + webhook URL for Meta       */
/* POST   → create or replace credentials (validates via Meta API)     */
/* PATCH  → update settings (autoReply, agentPrompt, businessName)     */
/* DELETE → disconnect                                                 */
/* ------------------------------------------------------------------ */

/** Resolve the public origin for webhook URLs. */
function resolveAppUrl(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  const account = await getWhatsAppAccount()
  const appUrl = resolveAppUrl(req)
  return NextResponse.json({
    account: account ? toPublicAccount(account) : null,
    webhookUrl: `${appUrl}/api/whatsapp/webhook`,
    defaultAgentPrompt: '',
  })
}

/* ------------------------------ POST ------------------------------ */

const createSchema = z.object({
  phoneNumberId: z.string().regex(/^\d{5,25}$/, 'Phone Number ID must be numeric.'),
  accessToken: z.string().min(20).max(2000),
  displayPhone: z.string().max(25).optional().default(''),
  businessName: z.string().min(1).max(60).optional().default('NEXUS Assistant'),
  agentPrompt: z.string().max(4000).optional().default(''),
})

export async function POST(req: NextRequest) {
  const limit = rateLimit(`wa-account-save:${clientKey(req)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many attempts. Wait a moment.' }, { status: 429 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }
  const data = parsed.data

  // Validate credentials against Meta BEFORE saving: GET the phone number
  // node — a bad token or phone-number-id returns an auth error here.
  try {
    const probe = await fetch(
      `https://graph.facebook.com/v21.0/${data.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: { Authorization: `Bearer ${data.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!probe.ok) {
      const err = (await probe.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      return NextResponse.json(
        {
          error:
            err.error?.message ||
            'Meta rejected these credentials. Check the Phone Number ID and Access Token.',
        },
        { status: 400 }
      )
    }
    const meta = (await probe.json()) as {
      display_phone_number?: string
      verified_name?: string
    }
    const displayPhone = normalizeWaNumber(data.displayPhone || meta.display_phone_number || '')

    const account = await db.whatsAppAccount.upsert({
      where: { id: (await getWhatsAppAccount())?.id ?? '__none__' },
      update: {
        phoneNumberId: data.phoneNumberId,
        accessTokenEnc: encryptSecret(data.accessToken),
        displayPhone,
        businessName: data.businessName,
        agentPrompt: data.agentPrompt,
        status: 'connected',
        statusMessage: `Verified as “${meta.verified_name ?? 'WhatsApp number'}”`,
        webhookVerified: false,
      },
      create: {
        phoneNumberId: data.phoneNumberId,
        accessTokenEnc: encryptSecret(data.accessToken),
        verifyToken: generateVerifyToken(),
        displayPhone,
        businessName: data.businessName,
        agentPrompt: data.agentPrompt,
        status: 'connected',
        statusMessage: `Verified as “${meta.verified_name ?? 'WhatsApp number'}”`,
      },
    })

    return NextResponse.json({ account: toPublicAccount(account) })
  } catch (error) {
    console.error('[whatsapp-account] POST error:', error)
    return NextResponse.json(
      { error: 'Could not reach Meta to verify credentials. Try again.' },
      { status: 502 }
    )
  }
}

/* ------------------------------ PATCH ------------------------------ */

const patchSchema = z.object({
  autoReply: z.boolean().optional(),
  agentPrompt: z.string().max(4000).optional(),
  businessName: z.string().min(1).max(60).optional(),
  allowList: z.array(z.string().regex(/^\d{5,20}$/)).max(5).optional(),
})

export async function PATCH(req: NextRequest) {
  const account = await getWhatsAppAccount()
  if (!account) {
    return NextResponse.json({ error: 'No WhatsApp account connected yet.' }, { status: 404 })
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 })
  }

  const updated = await db.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      ...(parsed.data.autoReply !== undefined ? { autoReply: parsed.data.autoReply } : {}),
      ...(parsed.data.agentPrompt !== undefined ? { agentPrompt: parsed.data.agentPrompt } : {}),
      ...(parsed.data.businessName !== undefined ? { businessName: parsed.data.businessName } : {}),
      ...(parsed.data.allowList !== undefined
        ? { allowList: JSON.stringify(parsed.data.allowList) }
        : {}),
    },
  })

  return NextResponse.json({ account: toPublicAccount(updated) })
}

/* ------------------------------ DELETE ------------------------------ */

export async function DELETE() {
  await db.whatsAppAccount.deleteMany({})
  return NextResponse.json({ ok: true })
}
