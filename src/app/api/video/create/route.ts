import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import path from 'path'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { videoJobs, pruneVideoJobs, type VideoJob } from '@/lib/video-jobs'
import { agnesConfigured, agnesCreateVideo } from '@/lib/agnes-video'
import { ffmpegPath, ffprobePath, execFileAsync } from '@/lib/ffmpeg'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const maxDuration = 300

/**
 * REAL AI video generation pipeline:
 * 1. LLM plans the scenes (image prompt + narration + caption each)
 * 2. AI generates each scene image (Pollinations — free)
 * 3. Neural TTS narrates each scene (Edge voices — free)
 * 4. ffmpeg animates (Ken Burns zoom), overlays captions, renders MP4
 *
 * Jobs run in the background; poll GET /api/video/status/[id].
 */

const IS_VERCEL = Boolean(process.env.VERCEL)
const VIDEO_DIR = IS_VERCEL
  ? path.join('/tmp', 'generated-videos') // Vercel: writable /tmp (ephemeral)
  : path.join(process.cwd(), 'generated-videos')
// Font bundled in the repo (assets/fonts) — /usr/share fonts don't exist on
// Vercel. Fall back to the system font in the sandbox if missing.
const BUNDLED_FONT = path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans-Bold.ttf')
const SYSTEM_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
let FONT_CACHE: string | null = null
async function fontPath(): Promise<string> {
  if (FONT_CACHE) return FONT_CACHE
  try {
    await readFile(BUNDLED_FONT)
    FONT_CACHE = BUNDLED_FONT
  } catch {
    FONT_CACHE = SYSTEM_FONT
  }
  return FONT_CACHE
}
const W = 1024
const H = 576

const requestSchema = z.object({
  prompt: z.string().min(3).max(1000),
  scenes: z.enum(['2', '3', '4', '5', '6']).optional().default('4'),
  voice: z.string().min(2).max(60).optional().default('en-US-AriaNeural'),
  style: z.enum(['cinematic', 'vibrant', 'minimal', 'documentary']).optional().default('cinematic'),
})



const PLANNER_PROMPT = `You are the video director of NEXUS AI. Plan a short video for the user's request. Respond with ONLY valid JSON:
{"title":"Video title","scenes":[{"image":"detailed image generation prompt, visual scene description","narration":"one sentence spoken aloud (max 20 words)","caption":"short on-screen text (max 6 words)"}]}
Rules: 3-6 scenes, each scene is a distinct visual beat. Style is specified by the user. Write narrations in the SAME LANGUAGE as the request. Images: describe composition, lighting, colors — no text in images.`

async function edgeTtsToFile(text: string, voice: string, outPath: string) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text)
  const chunks: Buffer[] = []
  for await (const chunk of audioStream) chunks.push(chunk as Buffer)
  await writeFile(outPath, Buffer.concat(chunks))
}

async function audioDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(await ffprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ])
    return parseFloat(stdout.trim()) || 0
  } catch {
    return 0
  }
}

function escDrawText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%')
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`video-create:${clientKey(req)}`, 5, 300_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Video limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request. Prompt (3-1000 chars) required; scenes: 2-6.' }, { status: 400 })
    }
    const { prompt, voice, style } = parsed.data
    const sceneCount = parseInt(parsed.data.scenes) || 4

    const user = await getCurrentUser(req)

    const id = randomUUID()
    const job: VideoJob = {
      id,
      status: 'planning',
      progress: 5,
      message: 'Directing your video…',
      prompt,
      startedAt: Date.now(),
    }
    pruneVideoJobs()
    videoJobs.set(id, job)

    // VERCEL-SAFE JOB STATE: serverless invocations may hit different
    // instances — the in-memory map alone makes status polls 404. Persist
    // a placeholder row immediately; stage transitions update it, and the
    // status route falls back to this row when the map misses.
    const persistStage = (status: string, message?: string) =>
      db.generatedVideo
        .upsert({
          where: { jobId: id },
          create: { prompt, scenes: sceneCount, voice, style, url: null, jobId: id, status, userId: user?.id ?? null },
          update: { status, ...(message ? { status } : {}) },
        })
        .catch((e: unknown) => console.error('[video] stage persist failed:', e))
    void persistStage('planning')

    /* ---- AGNES AI path (when configured) ----
     * When AGNES_API_KEY + AGNES_BASE_URL are set, hand off video
     * generation to Agnes and let the status route poll its API.
     * The local ffmpeg pipeline (below) is the sandbox fallback. */
    if (agnesConfigured()) {
      ;(async () => {
        try {
          job.status = 'planning'
          job.progress = 10
          job.message = 'Submitting to Agnes AI…'
          const { jobId: agnesJobId } = await agnesCreateVideo({
            prompt,
            scenes: sceneCount,
            style,
          })
          job.agnesJobId = agnesJobId
          job.agnesPolledAt = Date.now()
          job.status = 'rendering'
          job.progress = 25
          job.message = 'Agnes AI is generating the video…'

          // Persist a placeholder record so the library shows the
          // in-progress job. Updated when the status route sees completion.
          try {
            await db.generatedVideo.create({
              data: {
                prompt,
                scenes: sceneCount,
                voice,
                style,
                url: null,
                jobId: id,
                status: 'rendering',
                userId: user?.id ?? null,
              },
            })
          } catch (e) {
            console.error('[video] agnes db placeholder save failed:', e)
          }
        } catch (err) {
          console.error(`[video job ${id}] agnes submit failed:`, err)
          job.status = 'error'
          job.error = err instanceof Error ? err.message : 'Agnes submission failed.'
          try {
            await db.generatedVideo.create({
              data: {
                prompt,
                scenes: sceneCount,
                voice,
                style,
                url: null,
                jobId: id,
                status: 'error',
                userId: user?.id ?? null,
              },
            })
          } catch (e) {
            console.error('[video] agnes db error-path save failed:', e)
          }
        }
      })()

      return NextResponse.json({ jobId: id })
    }

    // Run the whole pipeline in the background
    ;(async () => {
      const workDir = path.join(VIDEO_DIR, id)
      try {
        await mkdir(workDir, { recursive: true })

        /* ---- 1. Plan scenes ---- */
        job.status = 'planning'
        job.progress = 10
        const raw = await smartChat([
          { role: 'assistant', content: PLANNER_PROMPT },
          { role: 'user', content: `Video request: ${prompt}\nVisual style: ${style}\nScenes: ${sceneCount}` },
        ], { maxTokens: 1500, task: 'fast' })
        const cleaned = raw.replace(/```(?:json)?/g, '').trim()
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        if (start === -1 || end === -1) throw new Error('Could not plan the video scenes.')
        const plan = JSON.parse(cleaned.slice(start, end + 1)) as {
          title?: string
          scenes?: Array<{ image?: string; narration?: string; caption?: string }>
        }
        const scenes = (plan.scenes ?? [])
          .filter((s) => s.image)
          .slice(0, 6)
        if (scenes.length < 2) throw new Error('The video plan was too short. Try again.')
        job.scenes = scenes.map((s) => ({ caption: s.caption ?? '' }))
        job.message = `Planned ${scenes.length} scenes`

        /* ---- 2. Generate images (Pollinations — free) ---- */
        job.status = 'images'
        void persistStage('images')
        for (let i = 0; i < scenes.length; i++) {
          job.progress = 15 + Math.round((i / scenes.length) * 45)
          job.message = `Generating scene ${i + 1} of ${scenes.length}…`
          const styleSuffix: Record<string, string> = {
            cinematic: 'cinematic lighting, film still, dramatic composition',
            vibrant: 'vibrant colors, high saturation, energetic',
            minimal: 'minimalist, clean composition, negative space',
            documentary: 'documentary photography, natural light, realistic',
          }
          const imgPrompt = encodeURIComponent(
            `${scenes[i].image}, ${styleSuffix[style] ?? ''}, high quality, detailed, cinematic lighting, no text, no watermark`
          )
          const imgRes = await fetch(
            `https://image.pollinations.ai/prompt/${imgPrompt}?width=${W}&height=${H}&nologo=true&seed=${Math.floor(Math.random() * 999999)}`,
            { signal: AbortSignal.timeout(90_000) }
          )
          if (!imgRes.ok) throw new Error(`Scene image ${i + 1} failed (HTTP ${imgRes.status}).`)
          const imgBuf = Buffer.from(await imgRes.arrayBuffer())
          if (imgBuf.length < 1000) throw new Error(`Scene image ${i + 1} returned empty.`)
          await writeFile(path.join(workDir, `scene${i}.png`), imgBuf)
        }

        /* ---- 3. Narration (Edge neural TTS — free) ---- */
        job.status = 'narration'
        job.progress = 62
        job.message = 'Recording AI narration…'
        void persistStage('narration')
        const narrations: Array<{ file: string; dur: number }> = []
        for (let i = 0; i < scenes.length; i++) {
          const mp3 = path.join(workDir, `nar${i}.mp3`)
          await edgeTtsToFile(scenes[i].narration ?? scenes[i].caption ?? '', voice, mp3)
          const dur = await audioDuration(mp3)
          narrations.push({ file: mp3, dur })
        }

        /* ---- 4. Render with ffmpeg (Ken Burns + captions) ---- */
        job.status = 'rendering'
        job.progress = 72
        void persistStage('rendering')
        const sceneFiles: string[] = []
        for (let i = 0; i < scenes.length; i++) {
          job.progress = 72 + Math.round((i / scenes.length) * 22)
          job.message = `Rendering scene ${i + 1} of ${scenes.length}…`
          const dur = Math.max(narrations[i].dur + 0.6, 3.2)
          const out = path.join(workDir, `clip${i}.mp4`)
          const caption = scenes[i].caption ? scenes[i].caption.slice(0, 60) : ''
          const FONT = await fontPath()
          // Alternate zoom direction for visual variety
          const zoomIn = i % 2 === 0
          const zoomExpr = zoomIn
            ? "zoompan=z='min(zoom+0.0012,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            : "zoompan=z='if(eq(on,1),1.14,max(zoom-0.0012,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          const vf =
            `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
            `${zoomExpr}:d=${Math.round(dur * 25)}:s=${W}x${H}:fps=25,` +
            `drawbox=y=ih-140:color=black@0.45:width=iw:height=140:t=fill` +
            (caption
              ? `,drawtext=fontfile=${FONT}:text='${escDrawText(caption)}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-100:shadowx=2:shadowy=2:shadowcolor=black@0.7`
              : '') +
            `,fade=t=in:st=0:d=0.5,fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5[v]`

          await execFileAsync(await ffmpegPath(), [
            '-y',
            '-loop', '1',
            '-i', path.join(workDir, `scene${i}.png`),
            '-i', narrations[i].file,
            '-filter_complex', vf,
            '-map', '[v]',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-t', dur.toFixed(2),
            out,
          ])
          sceneFiles.push(out)
        }

        /* ---- 5. Concat ---- */
        job.message = 'Stitching final video…'
        job.progress = 96
        const listFile = path.join(workDir, 'list.txt')
        await writeFile(
          listFile,
          sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
        )
        const finalPath = path.join(VIDEO_DIR, `${id}.mp4`)
        await execFileAsync(await ffmpegPath(), [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c', 'copy',
          '-movflags', '+faststart',
          finalPath,
        ])

        // Verify output
        const finalBuf = await readFile(finalPath)
        if (finalBuf.length < 10000) throw new Error('Rendered video was empty.')

        // Cleanup work dir (keep only final mp4)
        await rm(workDir, { recursive: true, force: true }).catch(() => {})

        job.status = 'done'
        job.progress = 100
        job.message = 'Video ready!'
        job.url = `/api/video/file/${id}`

        // Persist the finished video to the library DB — base64 bytes ride
        // along so the file survives Vercel's ephemeral /tmp across lambdas.
        // UPSERT against the placeholder row (jobId unique) so stage rows
        // never duplicate. If the live DB lacks the `data` column
        // (pre-migration), retry without it so the video still lands.
        const persistDone = async (withData: boolean) =>
          db.generatedVideo.upsert({
            where: { jobId: id },
            create: {
              prompt,
              scenes: sceneCount,
              voice,
              style,
              url: job.url,
              jobId: id,
              status: 'done',
              ...(withData ? { data: finalBuf.toString('base64') } : {}),
              userId: user?.id ?? null,
            },
            update: {
              url: job.url,
              status: 'done',
              ...(withData ? { data: finalBuf.toString('base64') } : {}),
            },
          })
        try {
          const videoRecord = await persistDone(true).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : ''
            if (/data|column/i.test(msg)) return persistDone(false)
            throw e
          })
          // Mirror to Supabase — no-op when unconfigured
          if (videoRecord.userId) {
            void supabaseUpsert('generated_videos', {
              id: videoRecord.id,
              user_id: videoRecord.userId,
              prompt: videoRecord.prompt,
              status: 'done',
              url: videoRecord.url,
            }, { onConflict: 'id' })
          }
        } catch (e) {
          console.error('[video] db save failed:', e)
        }
      } catch (err) {
        console.error(`[video job ${id}] failed:`, err)
        job.status = 'error'
        job.error = err instanceof Error ? err.message : 'Video generation failed.'
        await rm(path.join(VIDEO_DIR, id), { recursive: true, force: true }).catch(() => {})

        // Persist the failed attempt too, so the user sees it in the library with an error badge.
        try {
          await db.generatedVideo.upsert({
            where: { jobId: id },
            create: {
              prompt,
              scenes: sceneCount,
              voice,
              style,
              url: null,
              jobId: id,
              status: 'error',
              userId: user?.id ?? null,
            },
            update: { status: 'error' },
          })
        } catch (e) {
          console.error('[video] db save (error path) failed:', e)
        }
      }
    })()

    return NextResponse.json({ jobId: id })
  } catch (error) {
    console.error('[api/video/create] POST error:', error)
    const message = error instanceof Error ? error.message : 'Video generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
