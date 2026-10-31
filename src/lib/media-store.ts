/**
 * MEDIA STORE — shared persistence for generated images (used by
 * /api/image AND skill-runtime artifacts like charts + QR codes).
 *
 * Bytes are written to disk (local FS or warm Vercel /tmp) AND to the DB
 * (base64) so artifacts survive Vercel's ephemeral filesystem.
 * Served by GET /api/image/file/[id].
 */

import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

const IS_VERCEL = Boolean(process.env.VERCEL)
const IMAGES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images')
  : path.join(process.cwd(), 'generated-images')

export interface StoredImage {
  url: string
  provider: string
}

/** Persist a PNG/JPEG buffer and return its serving URL. */
export async function persistImage(
  buffer: Buffer,
  provider: string,
  meta: { prompt: string; size?: string; userId?: string | null }
): Promise<StoredImage> {
  const filename = randomUUID()
  await mkdir(IMAGES_DIR, { recursive: true }).catch(() => {})
  await writeFile(path.join(IMAGES_DIR, `${filename}.png`), buffer).catch(() => {})

  try {
    await db.generatedImage.create({
      data: {
        prompt: meta.prompt.slice(0, 1900),
        size: meta.size ?? '1024x1024',
        provider,
        url: `/api/image/file/${filename}`,
        data: buffer.toString('base64'),
        userId: meta.userId ?? null,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!/data|column/i.test(msg)) throw err
    // Schema drift: `data` column not migrated yet — metadata-only record
    // (the warm disk copy still serves until the lambda recycles).
    await db.generatedImage.create({
      data: {
        prompt: meta.prompt.slice(0, 1900),
        size: meta.size ?? '1024x1024',
        provider,
        url: `/api/image/file/${filename}`,
        userId: meta.userId ?? null,
      },
    }).catch(() => {})
  }

  return { url: `/api/image/file/${filename}`, provider }
}
