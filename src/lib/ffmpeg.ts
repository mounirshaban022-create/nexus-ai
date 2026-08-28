/**
 * FFMPEG RESOLVER — works everywhere with ZERO system installs.
 *
 * The video pipeline needs ffmpeg + ffprobe. In the dev sandbox they live at
 * /usr/bin. On Vercel (and any clean host) they don't exist — so we ship the
 * open-source static builds via npm:
 *   - ffmpeg-static  (https://github.com/eugeneware/ffmpeg-static, LGPL/GPL
 *                     static FFmpeg builds by John Van Sickle)
 *   - ffprobe-static (companion probe binary)
 *
 * These packages download platform binaries at install time and are included
 * in the serverless bundle, so execFile works identically sandbox/Vercel.
 */

import { access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Candidate ffmpeg binaries in priority order. */
async function firstAvailable(candidates: Array<string | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      await access(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  return null
}

let ffmpegPathCache: string | undefined
let ffprobePathCache: string | undefined

export async function ffmpegPath(): Promise<string> {
  if (ffmpegPathCache !== undefined) return ffmpegPathCache
  let fromPkg: string | undefined
  try {
    fromPkg = (await import('ffmpeg-static')).default as string | undefined
  } catch {
    fromPkg = undefined
  }
  ffmpegPathCache =
    (await firstAvailable(['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', fromPkg])) ?? fromPkg ?? 'ffmpeg'
  return ffmpegPathCache
}

export async function ffprobePath(): Promise<string> {
  if (ffprobePathCache !== undefined) return ffprobePathCache
  let fromPkg: string | undefined
  try {
    const mod = (await import('ffprobe-static')) as { path?: string }
    fromPkg = mod.path
  } catch {
    fromPkg = undefined
  }
  ffprobePathCache =
    (await firstAvailable(['/usr/bin/ffprobe', '/usr/local/bin/ffprobe', fromPkg])) ?? fromPkg ?? 'ffprobe'
  return ffprobePathCache
}

export { execFileAsync }
