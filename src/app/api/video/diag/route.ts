import { NextResponse } from 'next/server'
import { ffmpegPath, ffprobePath, execFileAsync } from '@/lib/ffmpeg'
import { readFile } from 'fs/promises'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** TEMP diagnostic — runs a MINI render exactly like the video pipeline
 * (loop png + mp3 + zoompan/drawbox/drawtext/fade) to capture the true
 * ffmpeg stderr inside the Vercel lambda. */
export async function GET() {
  const out: Record<string, unknown> = {}

  // 1×1 black PNG (base64) + silent 0.3s mp3 header — tiny stand-ins.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
  const dir = path.join('/tmp', 'video-diag')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 's.png'), png)
  } catch (e) {
    out.setupError = e instanceof Error ? e.message : String(e)
  }

  // Generate a 0.5s silent mp3 via ffmpeg itself (anullsrc).
  const ff = await ffmpegPath()
  try {
    await execFileAsync(ff, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.5', '-c:a', 'libmp3lame', path.join(dir, 'a.mp3')])
    out.mp3Gen = 'ok'
  } catch (e) {
    out.mp3GenError = e instanceof Error ? e.message.slice(0, 500) : String(e)
  }

  // Mini render with the SAME filter shape as the pipeline.
  const FONT = path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans-Bold.ttf')
  try {
    await readFile(FONT)
    out.fontExists = true
  } catch {
    out.fontExists = false
  }

  const vf =
    `[0:v]scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,` +
    `zoompan=z='min(zoom+0.0012,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=12:s=1024x576:fps=25,` +
    `drawbox=y=ih-140:color=black@0.45:width=iw:height=140:t=fill` +
    (out.fontExists
      ? `,drawtext=fontfile=${FONT}:text='Test Caption':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-100:shadowx=2:shadowy=2:shadowcolor=black@0.7`
      : '') +
    `,fade=t=in:st=0:d=0.2,fade=t=out:st=0.3:d=0.2[v]`

  try {
    const { stderr } = await execFileAsync(ff, [
      '-y', '-loop', '1', '-i', path.join(dir, 's.png'), '-i', path.join(dir, 'a.mp3'),
      '-filter_complex', vf, '-map', '[v]', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-t', '0.5',
      path.join(dir, 'out.mp4'),
    ])
    out.renderStderrTail = stderr.slice(-600)
    out.render = 'ok'
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    out.render = 'failed'
    out.renderErrorTail = (err.stderr || err.message || '').slice(-900)
  }

  // Probe check.
  try {
    const fp = await ffprobePath()
    const { stdout } = await execFileAsync(fp, ['-version'])
    out.ffprobe = stdout.split('\n')[0]
  } catch (e) {
    out.ffprobeError = e instanceof Error ? e.message.slice(0, 300) : String(e)
  }

  return NextResponse.json(out)
}
