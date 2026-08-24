import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  decryptApiKey,
  verifyAiProvider,
  ANONYMOUS_PROVIDER_IDS,
} from '@/lib/ai-providers'
import { rateLimit, clientKey } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/ai-providers/:id/test — re-verify a connected provider.
 * For anonymous zero-key providers this always returns ok (they have
 * nothing to verify). For keyed providers it lists /models with the
 * stored (decrypted) key.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const rl = rateLimit(`provider-test:${clientKey(req)}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    const { id } = await context.params
    const provider = await db.aiProvider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found.' }, { status: 404 })
    }

    const apiKey = ANONYMOUS_PROVIDER_IDS.has(provider.providerId)
      ? 'anonymous'
      : decryptApiKey(provider.apiKeyEnc)
    const verification = await verifyAiProvider(
      provider.baseUrl,
      apiKey,
      provider.providerId
    )

    const updated = await db.aiProvider.update({
      where: { id },
      data: {
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

    return NextResponse.json({ provider: updated, verification })
  } catch (error) {
    console.error('[api/ai-providers/test] POST error:', error)
    const message = error instanceof Error ? error.message : 'Test failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
