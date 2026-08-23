import { NextResponse } from 'next/server'
import { CONNECTORS } from '@/lib/connectors'

export async function GET() {
  return NextResponse.json({
    connectors: CONNECTORS.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      params: c.params,
      sampleArgs: c.sampleArgs,
      requiresAccount: c.requiresAccount ?? false,
    })),
  })
}
