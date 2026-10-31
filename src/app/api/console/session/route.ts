import { NextRequest, NextResponse } from 'next/server'
import { consoleLogin, consoleLogout, isConsoleAuthed } from '@/lib/console/auth'
import { audit } from '@/lib/console/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/console/session — console admin gate.
 *  POST { password } → sets `nexus-console` cookie (12h)
 *  GET  → { authed: boolean }
 *  DELETE → clears the cookie
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''
    const res = await consoleLogin(req, password)
    if (res.status === 200) {
      await audit('console.login', { ip: req.headers.get('x-forwarded-for') ?? undefined })
    } else {
      await audit('console.login_failed', { ip: req.headers.get('x-forwarded-for') ?? undefined })
    }
    return res
  } catch (error) {
    console.error('[api/console/session] POST error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: await isConsoleAuthed(req) })
}

export async function DELETE(req: NextRequest) {
  await audit('console.logout')
  return consoleLogout()
}
