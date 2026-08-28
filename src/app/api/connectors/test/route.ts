import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CONNECTOR_MAP, validateConnectorArgs } from '@/lib/connectors'
import { getVerifiedSession } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  id: z.string().min(1).max(40),
  args: z.record(z.string(), z.unknown()).default({}),
})

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`connectors-test:${clientKey(req)}`, 30, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const connector = CONNECTOR_MAP.get(parsed.data.id)
    if (!connector) {
      return NextResponse.json({ error: 'Unknown connector.' }, { status: 404 })
    }

    const validated = validateConnectorArgs(connector, parsed.data.args)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    // SECURITY: resolve the caller's verified userId so email connectors
    // only ever read the caller's own mailbox (never another user's).
    const session = await getVerifiedSession(req)
    const result = await connector.execute(validated.args, { userId: session?.userId ?? null })
    const text = JSON.stringify(result)
    return NextResponse.json({
      result: text.length > 6000 ? { truncated: true, preview: text.slice(0, 6000) } : result,
    })
  } catch (error) {
    console.error('[api/connectors/test] POST error:', error)
    const message = error instanceof Error ? error.message : 'Connector failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
