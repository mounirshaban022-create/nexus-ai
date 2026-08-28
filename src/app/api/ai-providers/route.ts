import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getVerifiedSession } from '@/lib/auth'
import { ensurePerUserColumns } from '@/lib/schema-guard'
import { encryptSecret } from '@/lib/email'
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_MAP,
  ANONYMOUS_PROVIDER_IDS,
  verifyAiProvider,
} from '@/lib/ai-providers'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    // SECURITY: only the caller's OWN provider configs. Never expose
    // another user's API keys (even masked) or connection status.
    await ensurePerUserColumns()
    const providers = await db.aiProvider.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        providerId: true,
        label: true,
        baseUrl: true,
        defaultModel: true,
        status: true,
        statusMessage: true,
      },
    })
    return NextResponse.json({ providers, presets: AI_PROVIDER_PRESETS })
  } catch (error) {
    console.error('[api/ai-providers] GET error:', error)
    return NextResponse.json({ error: 'Failed to load providers.' }, { status: 500 })
  }
}

// apiKey is optional — anonymous providers (LLM7.io, OVHcloud, Kilo Code)
// require no key. We accept either an explicit key or a sentinel.
const createSchema = z.object({
  providerId: z.string().min(2).max(40),
  apiKey: z.string().max(300).optional(),
  defaultModel: z.string().min(1).max(200).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getVerifiedSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const limit = rateLimit(`ai-provider-add:${clientKey(req)}`, 10, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many attempts. Wait a moment.' }, { status: 429 })
    }

    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provider is required.' }, { status: 400 })
    }

    const preset = AI_PROVIDER_MAP.get(parsed.data.providerId)
    if (!preset) {
      return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 })
    }

    const isAnonymous = ANONYMOUS_PROVIDER_IDS.has(preset.id)
    // Anonymous providers don't need a key — use a sentinel so the DB
    // NOT NULL constraint on apiKeyEnc still holds. Real keys are
    // encrypted; the sentinel is stored as-is (encryptSecret handles it
    // fine, and decryptApiKey will return the sentinel — which is never
    // sent to the upstream because anonymousChatCompletion skips auth).
    const rawKey = parsed.data.apiKey?.trim() || (isAnonymous ? 'anonymous-no-key-required' : '')
    if (!rawKey) {
      return NextResponse.json({ error: 'API key is required for this provider.' }, { status: 400 })
    }

    const defaultModel = parsed.data.defaultModel || preset.defaultModel
    const verification = await verifyAiProvider(
      preset.baseUrl,
      rawKey,
      preset.id
    )

    // SECURITY: per-user upsert — find this user's existing config for the
    // provider, or create a new private row. (No global providerId unique.)
    await ensurePerUserColumns()
    const existing = await db.aiProvider.findFirst({
      where: { providerId: preset.id, userId: session.userId },
    })
    const provider = existing
      ? await db.aiProvider.update({
          where: { id: existing.id },
          data: {
            apiKeyEnc: encryptSecret(rawKey),
            defaultModel,
            status: verification.ok ? 'connected' : 'error',
            statusMessage: verification.message,
          },
          select: {
            id: true,
            providerId: true,
            label: true,
            defaultModel: true,
            status: true,
            statusMessage: true,
          },
        })
      : await db.aiProvider.create({
          data: {
            userId: session.userId,
            providerId: preset.id,
            label: preset.label,
            baseUrl: preset.baseUrl,
            apiKeyEnc: encryptSecret(rawKey),
            defaultModel,
            status: verification.ok ? 'connected' : 'error',
            statusMessage: verification.message,
          },
          select: {
            id: true,
            providerId: true,
            label: true,
            defaultModel: true,
            status: true,
            statusMessage: true,
          },
        })

    return NextResponse.json({ provider, verification })
  } catch (error) {
    console.error('[api/ai-providers] POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to save provider.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
