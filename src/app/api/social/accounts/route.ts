import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { encryptSecret } from '@/lib/email'
import {
  SOCIAL_PLATFORMS,
  isSocialPlatform,
  listSocialAccounts,
  getSocialAccount,
  toPublicAccount,
  toRecord,
  verifyAccount,
  logActivity,
} from '@/lib/social'

export const maxDuration = 60

/* ------------------------------------------------------------------ */
/* GET — list the caller's connected accounts (tokens masked)          */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  try {
    const accounts = await listSocialAccounts(session.userId)
    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('[api/social/accounts] GET error:', error)
    return NextResponse.json({ error: 'Could not load accounts.' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* POST — connect a new account (verified against the real API)        */
/* ------------------------------------------------------------------ */

const connectSchema = z.object({
  platform: z.string().min(2),
  displayName: z.string().max(80).optional().default(''),
  // rehearsal: save WITHOUT live verification — the full agent pipeline
  // runs, but every publish is simulated until a real token is added.
  rehearsal: z.boolean().optional().default(false),
  credentials: z.object({
    accessToken: z.string().max(2000).optional().default(''),
    externalId: z.string().max(300).optional().default(''),
    authorUrn: z.string().max(300).optional().default(''),
  }),
})

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-connect:${clientKey(req)}`, 10, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts — wait a moment.' }, { status: 429 })

  const parsed = connectSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid connection payload.' }, { status: 400 })
  const { platform, displayName, credentials } = parsed.data
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })

  const token = credentials.accessToken.trim()
  const externalId = (platform === 'linkedin' ? credentials.authorUrn || '' : credentials.externalId.trim())

  const verify = parsed.data.rehearsal
    ? { mode: 'unreachable' as const, handle: '', avatarUrl: '', externalId: externalId || 'rehearsal', message: 'Rehearsal mode — the agent pipeline runs end-to-end with simulated publishing.' }
    : await verifyAccount(platform, token, externalId, credentials.authorUrn)
  if (verify.mode === 'invalid') {
    return NextResponse.json({ error: verify.message || 'The platform rejected these credentials.' }, { status: 400 })
  }

  const status = verify.mode === 'verified' ? 'connected' : 'pending'
  const statusMessage =
    verify.mode === 'verified' ? verify.message : `${verify.message} Saved for rehearsal mode — publishing will run in simulation until the platform is reachable.`

  try {
    const row = await db.socialAccount.create({
      data: {
        userId: session.userId,
        platform,
        displayName: displayName || verify.handle || SOCIAL_PLATFORMS[platform].label,
        externalId: verify.externalId || externalId,
        accessTokenEnc: token ? encryptSecret(token) : '',
        meta: JSON.stringify({ handle: verify.handle, avatarUrl: verify.avatarUrl }),
        status,
        statusMessage,
      },
    })
    await logActivity(session.userId, row.id, 'connected', `Connected ${SOCIAL_PLATFORMS[platform].label}: ${statusMessage}`)
    const rec = toRecord(row)
    return NextResponse.json({ account: toPublicAccount(rec, token) })
  } catch (error) {
    console.error('[api/social/accounts] POST error:', error)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* PATCH — autopilot settings / rename / re-verify                     */
/* ------------------------------------------------------------------ */

const patchSchema = z.object({
  id: z.string().min(4),
  displayName: z.string().max(80).optional(),
  autopilot: z.boolean().optional(),
  autopilotTopic: z.string().max(400).optional(),
  autopilotCadenceMinutes: z.coerce.number().int().min(15).max(20160).optional(),
  // engagement
  autoReply: z.boolean().optional(),
  // page brain quick-edit
  pageNiche: z.string().max(600).optional(),
  pageAudience: z.string().max(600).optional(),
  pageTone: z.string().max(300).optional(),
  pageGoal: z.string().max(300).optional(),
  pageLanguage: z.string().max(40).optional(),
  recheck: z.boolean().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const limit = rateLimit(`social-patch:${clientKey(req)}`, 20, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests — wait a moment.' }, { status: 429 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid update payload.' }, { status: 400 })
  const { id, recheck, ...fields } = parsed.data

  const got = await getSocialAccount(session.userId, id)
  if (!got) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  const { rec, token } = got

  let status = rec.status
  let statusMessage = rec.statusMessage

  if (recheck) {
    const verify = await verifyAccount(rec.platform, token, rec.externalId)
    status = verify.mode === 'verified' ? 'connected' : verify.mode === 'invalid' ? 'error' : 'pending'
    statusMessage = verify.message
  }

  try {
    const row = await db.socialAccount.update({
      where: { id },
      data: {
        ...(fields.displayName !== undefined ? { displayName: fields.displayName } : {}),
        ...(fields.autopilot !== undefined ? { autopilot: fields.autopilot } : {}),
        ...(fields.autopilotTopic !== undefined ? { autopilotTopic: fields.autopilotTopic } : {}),
        ...(fields.autopilotCadenceMinutes !== undefined ? { autopilotCadenceMinutes: fields.autopilotCadenceMinutes } : {}),
        ...(fields.autoReply !== undefined ? { autoReply: fields.autoReply } : {}),
        ...(fields.pageNiche !== undefined ? { pageNiche: fields.pageNiche } : {}),
        ...(fields.pageAudience !== undefined ? { pageAudience: fields.pageAudience } : {}),
        ...(fields.pageTone !== undefined ? { pageTone: fields.pageTone } : {}),
        ...(fields.pageGoal !== undefined ? { pageGoal: fields.pageGoal } : {}),
        ...(fields.pageLanguage !== undefined ? { pageLanguage: fields.pageLanguage } : {}),
        status,
        statusMessage,
      },
    })
    if (fields.autopilot === true) {
      await logActivity(session.userId, id, 'autopilot_on', `Autopilot ENABLED — the agent will post to ${SOCIAL_PLATFORMS[rec.platform].label} every ${row.autopilotCadenceMinutes} minutes about "${row.autopilotTopic || 'brand updates'}"`)
    } else if (fields.autopilot === false) {
      await logActivity(session.userId, id, 'autopilot_off', 'Autopilot disabled')
    }
    if (fields.autoReply === true) {
      await logActivity(session.userId, id, 'reply', `💬 Auto-reply ENABLED — the agent will answer comments on ${SOCIAL_PLATFORMS[rec.platform].label} hands-free`)
    } else if (fields.autoReply === false) {
      await logActivity(session.userId, id, 'reply', 'Auto-reply disabled')
    }
    return NextResponse.json({ account: toPublicAccount(toRecord(row), token) })
  } catch (error) {
    console.error('[api/social/accounts] PATCH error:', error)
    return NextResponse.json({ error: 'Could not update the account.' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* DELETE — disconnect (?id=...)                                       */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 })

  const got = await getSocialAccount(session.userId, id)
  if (!got) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  try {
    await db.socialAccount.delete({ where: { id } })
    await logActivity(session.userId, id, 'disconnected', `Disconnected ${SOCIAL_PLATFORMS[got.rec.platform].label}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/social/accounts] DELETE error:', error)
    return NextResponse.json({ error: 'Could not disconnect the account.' }, { status: 500 })
  }
}
