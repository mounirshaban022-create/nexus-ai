import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/email'
import { SOCIAL_PLATFORMS, isSocialPlatform, getPlatformCredentials, PlatformCredentials } from '@/lib/social'

export const maxDuration = 30

/* ------------------------------------------------------------------ */
/* /api/social/credentials — the in-app Connect wizard's backend.      */
/*                                                                     */
/* Platforms require the ACCOUNT OWNER to create a developer app once  */
/* (identity-bound — no one else can do it). This endpoint makes that  */
/* single human step feel like any modern app's settings screen:       */
/*   GET  ?platform=linkedin → { configured, source, redirectUri }     */
/*        (no secrets ever leave the server)                           */
/*   POST { platform, clientId, clientSecret } → encrypted upsert.     */
/*        The platform's official connection switches ON instantly —   */
/*        no redeploy, no env vars, no chat.                           */
/*   DELETE ?platform=x       → remove the stored credentials.         */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const platform = new URL(req.url).searchParams.get('platform') ?? ''
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const origin = proto && host ? `${proto}://${host}` : req.nextUrl.origin

  const creds: PlatformCredentials | null = await getPlatformCredentials(platform)
  return NextResponse.json({
    configured: Boolean(creds),
    source: creds?.source ?? null,
    label: SOCIAL_PLATFORMS[platform].label,
    // The one URL the owner pastes into the platform's app settings.
    redirectUri: `${origin}/api/social/oauth/callback`,
  })
}

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    platform?: string
    clientId?: string
    clientSecret?: string
  }
  const platform = body.platform ?? ''
  const clientId = (body.clientId ?? '').trim()
  const clientSecret = (body.clientSecret ?? '').trim()

  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Both the ID and the secret are needed.' }, { status: 400 })
  }

  await db.platformCredential.upsert({
    where: { platform },
    update: { clientIdEnc: encryptSecret(clientId), clientSecretEnc: encryptSecret(clientSecret) },
    create: { platform, clientIdEnc: encryptSecret(clientId), clientSecretEnc: encryptSecret(clientSecret) },
  })

  return NextResponse.json({
    ok: true,
    label: SOCIAL_PLATFORMS[platform].label,
    message: `${SOCIAL_PLATFORMS[platform].label} connection is switched on. Tap connect and sign in — done.`,
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const platform = new URL(req.url).searchParams.get('platform') ?? ''
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  // Never return the secret — only confirm removal. (A masked peek exists
  // for the wizard's "already configured?" state via GET /configured.)
  try {
    await db.platformCredential.delete({ where: { platform } })
  } catch {
    /* nothing stored — fine */
  }
  return NextResponse.json({ ok: true })
}

/* Small helper for the wizard: show only a masked fingerprint. */
export async function PUT(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { platform?: string }
  const platform = body.platform ?? ''
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  try {
    const row = await db.platformCredential.findUnique({ where: { platform } })
    if (!row) return NextResponse.json({ configured: false })
    const id = decryptSecret(row.clientIdEnc)
    return NextResponse.json({ configured: true, clientIdMasked: `${id.slice(0, 3)}•••${id.slice(-3)}` })
  } catch {
    return NextResponse.json({ configured: false })
  }
}
