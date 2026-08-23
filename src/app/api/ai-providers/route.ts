import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { encryptSecret } from '@/lib/email'
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_MAP,
  verifyAiProvider,
} from '@/lib/ai-providers'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export async function GET() {
  try {
    const providers = await db.aiProvider.findMany({
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

const createSchema = z.object({
  providerId: z.string().min(2).max(40),
  apiKey: z.string().min(8).max(300),
  defaultModel: z.string().min(1).max(200).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`ai-provider-add:${clientKey(req)}`, 10, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many attempts. Wait a moment.' }, { status: 429 })
    }

    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provider and API key are required.' }, { status: 400 })
    }

    const preset = AI_PROVIDER_MAP.get(parsed.data.providerId)
    if (!preset) {
      return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 })
    }

    const defaultModel = parsed.data.defaultModel || preset.defaultModel
    const verification = await verifyAiProvider(
      preset.baseUrl,
      parsed.data.apiKey,
      preset.id
    )

    // Upsert (one config per provider)
    const provider = await db.aiProvider.upsert({
      where: { providerId: preset.id },
      update: {
        apiKeyEnc: encryptSecret(parsed.data.apiKey),
        defaultModel,
        status: verification.ok ? 'connected' : 'error',
        statusMessage: verification.message,
      },
      create: {
        providerId: preset.id,
        label: preset.label,
        baseUrl: preset.baseUrl,
        apiKeyEnc: encryptSecret(parsed.data.apiKey),
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
