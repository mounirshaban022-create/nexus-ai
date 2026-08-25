import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

const IS_VERCEL = Boolean(process.env.VERCEL)
const AVATARS_DIR = IS_VERCEL
  ? path.join('/tmp', 'avatars') // Vercel: writable /tmp
  : path.join(process.cwd(), 'public', 'avatars')

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

function safeFilename(ext: string): string {
  // Best-effort collision-resistant token: base36 timestamp + 8 hex random bytes.
  const stamp = Date.now().toString(36)
  const rand = randomBytes(4).toString('hex')
  return `${stamp}-${rand}.${ext}`
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 avatar uploads per minute per client.
  const rl = rateLimit(`avatar-upload:${clientKey(req)}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Wait a minute.' },
      { status: 429 }
    )
  }

  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Only PNG, JPEG, or WebP images are allowed.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Image must be under 2MB.' },
      { status: 413 }
    )
  }

  // Ensure the destination dir exists.
  try {
    fs.mkdirSync(AVATARS_DIR, { recursive: true })
  } catch {
    // Directory may already exist; mkdirSync(recursive) is idempotent anyway.
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const filename = safeFilename(ext)
  const filePath = path.join(AVATARS_DIR, filename)

  try {
    fs.writeFileSync(filePath, buffer)
  } catch {
    return NextResponse.json(
      { error: 'Failed to save image.' },
      { status: 500 }
    )
  }

  const avatarUrl = `/avatars/${filename}`

  // Best-effort cleanup of the previous avatar — only if it lived under
  // /avatars (one of OUR uploads), never for an external URL.
  const previous = await db.user
    .findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    })
    .catch(() => null)

  if (previous?.avatarUrl?.startsWith('/avatars/')) {
    const oldPath = path.join(
      AVATARS_DIR,
      path.basename(previous.avatarUrl)
    )
    try {
      fs.unlink(oldPath, () => {
        /* swallow — cleanup is best-effort */
      })
    } catch {
      // ignore
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { avatarUrl },
  })

  return NextResponse.json({ avatarUrl })
}
