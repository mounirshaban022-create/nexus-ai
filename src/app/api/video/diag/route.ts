import { NextResponse } from 'next/server'
import { ffmpegPath, ffprobePath, execFileAsync } from '@/lib/ffmpeg'
import { readFile } from 'fs/promises'

export const dynamic = 'force-dynamic'

/** TEMP diagnostic — verifies ffmpeg/ffprobe availability inside the lambda. */
export async function GET() {
  const out: Record<string, unknown> = {}
  try {
    const ff = await ffmpegPath()
    out.ffmpegPath = ff
    try {
      const { stdout } = await execFileAsync(ff, ['-version'])
      out.ffmpegVersion = stdout.split('\n')[0]
    } catch (e) {
      out.ffmpegRunError = e instanceof Error ? e.message.slice(0, 300) : String(e)
    }
  } catch (e) {
    out.ffmpegResolveError = e instanceof Error ? e.message : String(e)
  }
  try {
    const fp = await ffprobePath()
    out.ffprobePath = fp
    try {
      const { stdout } = await execFileAsync(fp, ['-version'])
      out.ffprobeVersion = stdout.split('\n')[0]
    } catch (e) {
      out.ffprobeRunError = e instanceof Error ? e.message.slice(0, 300) : String(e)
    }
  } catch (e) {
    out.ffprobeResolveError = e instanceof Error ? e.message : String(e)
  }
  try {
    const mod = (await import('ffmpeg-static')).default
    out.ffmpegStaticModulePath = mod
    try {
      await readFile(mod)
      out.ffmpegStaticBinaryExists = true
    } catch {
      out.ffmpegStaticBinaryExists = false
    }
  } catch (e) {
    out.ffmpegStaticImportError = e instanceof Error ? e.message.slice(0, 300) : String(e)
  }
  out.cwd = process.cwd()
  out.isVercel = Boolean(process.env.VERCEL)
  return NextResponse.json(out)
}
