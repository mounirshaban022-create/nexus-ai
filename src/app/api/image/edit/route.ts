import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession, getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { geminiImageEdit } from '@/lib/premium-image'

export const maxDuration = 120
export const runtime = 'nodejs'

const IS_VERCEL = Boolean(process.env.VERCEL)
const FILES_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-images')
  : path.join(process.cwd(), 'generated-images')

/**
 * PROFESSIONAL PHOTO EDITING — real pixel operations with sharp.
 *
 * The client (chat tool / skills / studio) posts:
 *   { image: dataUrl, operations: [ {op:...}, ... ] }
 * and receives back a URL to the edited image. Operations are applied in
 * order, exactly like a Photoshop action list:
 *
 *   resize {width,height}  crop {left,top,width,height}  rotate {angle}
 *   flipH  flipV  grayscale  sepia  negate  blur {sigma}  sharpen
 *   brightness {0-3}  saturation {0-3}  hue {0-360}  contrast {-1..1}
 *   tint {color}  vignette  watermark {text,...}  format {type,quality}
 */

const opSchema = z.object({
  op: z.enum([
    'resize', 'crop', 'rotate', 'flipH', 'flipV', 'grayscale', 'sepia',
    'negate', 'blur', 'sharpen', 'brightness', 'saturation', 'hue',
    'contrast', 'tint', 'vignette', 'watermark', 'format',
  ]),
  width: z.number().int().positive().max(12000).optional(),
  height: z.number().int().positive().max(12000).optional(),
  left: z.number().int().min(0).optional(),
  top: z.number().int().min(0).optional(),
  angle: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  sigma: z.number().min(0).max(30).optional(),
  value: z.number().min(-1).max(3).optional(),
  degrees: z.number().min(0).max(360).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  text: z.string().max(120).optional(),
  fontSize: z.number().min(8).max(400).optional(),
  opacity: z.number().min(0).max(1).optional(),
  position: z.enum(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  type: z.enum(['jpeg', 'png', 'webp']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
})

const requestSchema = z.object({
  image: z.string().min(64).max(25_000_000), // dataUrl
  operations: z.array(opSchema).max(12).optional().default([]),
  // AI EDIT — natural-language generative instruction (Gemini 2.5 Flash
  // Image, image+text→image): "remove the person on the left", "make it
  // sunset", "turn this into watercolor". Optional; sharp ops still run
  // after it when both are provided.
  instruction: z.string().min(3).max(1200).optional(),
  filename: z.string().max(120).optional(),
})

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  try {
    const limit = rateLimit(`image-edit:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many edits. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: image (dataUrl) + operations array are required.' },
        { status: 400 }
      )
    }
    const { image, operations, instruction } = parsed.data
    if (!operations.length && !instruction?.trim()) {
      return NextResponse.json(
        { error: 'Provide an AI `instruction` and/or at least one pixel `operation`.' },
        { status: 400 }
      )
    }

    const dataUrl = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    let inputBuffer: Buffer = Buffer.from(base64, 'base64')
    if (inputBuffer.length < 64) {
      return NextResponse.json({ error: 'Image is empty or invalid.' }, { status: 400 })
    }

    const applied: string[] = []

    /* ---- 1. AI GENERATIVE EDIT (Gemini image+text→image) ----
     * Real generative editing — remove/add objects, restyle, relight,
     * change backgrounds — the class of edits sharp can never do. Runs
     * FIRST so pixel ops apply on top of the AI result. Gracefully falls
     * back to the sharp pipeline when Gemini is unconfigured or fails. */
    let aiEdited = false
    if (instruction?.trim()) {
      try {
        inputBuffer = await geminiImageEdit(inputBuffer, instruction)
        aiEdited = true
        applied.push(`ai: ${instruction.trim().slice(0, 60)}`)
      } catch (aiErr) {
        console.warn('[api/image/edit] AI edit unavailable, using pixel ops only:', aiErr instanceof Error ? aiErr.message : aiErr)
        if (!operations.length) {
          return NextResponse.json(
            { error: 'AI editing is temporarily unavailable — try a pixel operation instead (crop, brightness, etc.).' },
            { status: 503 }
          )
        }
      }
    }

    let pipeline = sharp(inputBuffer, { failOn: 'none' })
    const meta = await pipeline.metadata()
    const W = meta.width ?? 0
    const H = meta.height ?? 0
    let outFormat = 'png'
    let outQuality = 92
    // Cumulative modulate state — sharp's modulate() needs every field set
    // (undefined saturation throws) and later calls override earlier ones,
    // so we track the running values and re-apply the full state.
    const modState = { brightness: 1, saturation: 1, hue: 0 }

    for (const op of operations) {
      switch (op.op) {
        case 'resize': {
          const width = op.width ?? null
          const height = op.height ?? null
          if (width || height) {
            pipeline = pipeline.resize(width ?? undefined, height ?? undefined, {
              fit: 'inside',
              withoutEnlargement: false,
            })
            applied.push(`resize ${width ?? 'auto'}×${height ?? 'auto'}`)
          }
          break
        }
        case 'crop': {
          const left = Math.max(0, Math.min(op.left ?? 0, Math.max(0, W - 1)))
          const top = Math.max(0, Math.min(op.top ?? 0, Math.max(0, H - 1)))
          const width = Math.max(1, Math.min(op.width ?? W, W - left))
          const height = Math.max(1, Math.min(op.height ?? H, H - top))
          pipeline = pipeline.extract({ left, top, width, height })
          applied.push(`crop ${width}×${height}@(${left},${top})`)
          break
        }
        case 'rotate':
          pipeline = pipeline.rotate(op.angle === 90 ? 90 : op.angle === 180 ? 180 : 270)
          applied.push(`rotate ${op.angle}°`)
          break
        case 'flipH':
          pipeline = pipeline.flop()
          applied.push('flip horizontal')
          break
        case 'flipV':
          pipeline = pipeline.flip()
          applied.push('flip vertical')
          break
        case 'grayscale':
          pipeline = pipeline.grayscale()
          applied.push('grayscale')
          break
        case 'sepia': {
          // True sepia: grayscale + warm tint (sharp has no built-in sepia).
          const { r, g, b } = hexToRgb('#c8a878')
          modState.brightness = 1.05
          pipeline = pipeline.grayscale().modulate({ ...modState }).tint({ r, g, b })
          applied.push('sepia')
          break
        }
        case 'negate':
          pipeline = pipeline.negate({ alpha: false })
          applied.push('invert')
          break
        case 'blur':
          pipeline = pipeline.blur(Math.max(0.3, op.sigma ?? 3))
          applied.push(`blur ${op.sigma ?? 3}`)
          break
        case 'sharpen':
          pipeline = pipeline.sharpen({ sigma: 1.2 })
          applied.push('sharpen')
          break
        case 'brightness':
        case 'saturation':
        case 'hue': {
          if (op.op === 'brightness') modState.brightness = Math.max(0, op.value ?? 1)
          if (op.op === 'saturation') modState.saturation = Math.max(0, op.value ?? 1)
          if (op.op === 'hue') modState.hue = Math.max(0, Math.min(360, op.degrees ?? 0))
          pipeline = pipeline.modulate({ ...modState })
          applied.push(
            `${op.op} ${modState.brightness !== 1 ? modState.brightness : modState.saturation !== 1 ? modState.saturation : modState.hue}`
          )
          break
        }
        case 'contrast': {
          const a = Math.max(-1, Math.min(1, op.value ?? 0.2))
          // linear(): slope > 1 increases contrast around mid-gray.
          pipeline = pipeline.linear(1 + a * 2, -(128 * a * 2) / 2)
          applied.push(`contrast ${a > 0 ? '+' : ''}${a.toFixed(2)}`)
          break
        }
        case 'tint': {
          const { r, g, b } = hexToRgb(op.color ?? '#ff5a5f')
          pipeline = pipeline.tint({ r, g, b })
          applied.push(`tint ${op.color}`)
          break
        }
        case 'vignette': {
          // Radial darkening composite (SVG mask) — classic portrait vignette.
          const size = await pipeline.clone().toBuffer({ resolveWithObject: true })
          const vw = size.info.width || W
          const vh = size.info.height || H
          const svg = Buffer.from(
            `<svg width="${vw}" height="${vh}"><defs><radialGradient id="v" cx="50%" cy="50%" r="72%">` +
              `<stop offset="58%" stop-color="black" stop-opacity="0"/>` +
              `<stop offset="100%" stop-color="black" stop-opacity="0.55"/></radialGradient></defs>` +
              `<rect width="${vw}" height="${vh}" fill="url(#v)"/></svg>`
          )
          pipeline = pipeline.composite([{ input: svg, blend: 'over' }])
          applied.push('vignette')
          break
        }
        case 'watermark': {
          const text = (op.text ?? 'NEXUS').slice(0, 120)
          const fontSize = op.fontSize ?? 48
          const color = op.color ?? '#ffffff'
          const opacity = op.opacity ?? 0.6
          const position = op.position ?? 'bottom-right'
          const wmBuffer = await pipeline.clone().toBuffer({ resolveWithObject: true })
          const vw = wmBuffer.info.width || W
          const vh = wmBuffer.info.height || H
          const padding = Math.round(fontSize * 0.8)
          const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          const anchorX =
            position.includes('left') ? padding : position.includes('right') ? vw - padding : vw / 2
          const anchorY =
            position.startsWith('top') ? padding + fontSize : position === 'center' ? vh / 2 : vh - padding
          const textAnchor = position.includes('left') ? 'start' : position.includes('right') ? 'end' : 'middle'
          const svg = Buffer.from(
            `<svg width="${vw}" height="${vh}"><text x="${anchorX}" y="${anchorY}" fill="${color}" fill-opacity="${opacity}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-weight="bold" font-size="${fontSize}" text-anchor="${textAnchor}">${esc}</text></svg>`
          )
          pipeline = pipeline.composite([{ input: svg, blend: 'over' }])
          applied.push(`watermark "${text}"`)
          break
        }
        case 'format':
          outFormat = op.type ?? 'jpeg'
          outQuality = op.quality ?? 92
          applied.push(`format ${outFormat} q${outQuality}`)
          break
      }
    }

    // Render final buffer with the chosen format. ALWAYS PNG on disk —
    // the file route serves `{id}.png`; a `.jpg`/`.webp` extension used
    // to produce an IMMEDIATELY broken URL (404).
    if (outFormat === 'jpeg') {
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: outQuality })
    } else if (outFormat === 'webp') {
      pipeline = pipeline.webp({ quality: outQuality })
    } else {
      pipeline = pipeline.png()
    }
    const output = await pipeline.toBuffer({ resolveWithObject: true })

    // Persist + serve through the same media route as generated images.
    const id = `edit-${Date.now()}-${randomUUID().slice(0, 8)}`
    await mkdir(FILES_DIR, { recursive: true })
    await writeFile(path.join(FILES_DIR, `${id}.png`), output.data)

    // DB row — the durable copy that survives Vercel's ephemeral /tmp.
    // Edited images previously had NO row at all, so every share link died
    // as soon as the lambda's /tmp was recycled.
    try {
      const user = await getCurrentUser(req)
      await db.generatedImage.create({
        data: {
          prompt: `edit: ${(instruction ?? '').trim() || applied.join(', ')}`.slice(0, 500),
          size: `${output.info.width}x${output.info.height}`,
          provider: aiEdited ? 'gemini-edit' : 'sharp-edit',
          url: `/api/image/file/${id}`,
          data: output.data.toString('base64'),
          userId: user?.id ?? null,
        },
      })
    } catch (persistErr) {
      console.warn('[api/image/edit] DB persist failed (serving from /tmp):', persistErr instanceof Error ? persistErr.message : persistErr)
    }

    return NextResponse.json({
      ok: true,
      image: {
        id,
        url: `/api/image/file/${id}`,
        filename: `${id}.png`,
        width: output.info.width,
        height: output.info.height,
        format: output.info.format,
        size: output.data.length,
        bytes: output.data.toString('base64'), // DB persistence (Vercel /tmp is ephemeral)
        operations: applied,
        aiEdited,
      },
    })
  } catch (error) {
    console.error('[api/image/edit] POST error:', error)
    const message =
      error instanceof Error ? error.message : 'Image edit failed. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
