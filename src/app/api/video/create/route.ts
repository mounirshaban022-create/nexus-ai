import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import path from 'path'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { pollinationsSequence } from '@/lib/pollinations'
import { videoJobs, pruneVideoJobs, type VideoJob } from '@/lib/video-jobs'
import { agnesConfigured, agnesCreateVideo } from '@/lib/agnes-video'
import { veoConfigured, veoAvailable, veoGenerateClip } from '@/lib/veo-video'
import { ffmpegPath, ffprobePath, execFileAsync } from '@/lib/ffmpeg'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'
import { requireVerifiedSession, getCurrentUser } from '@/lib/auth'

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
// QUALITY UPGRADE: true 720p @ 24fps — 24 fps is the cinematic film
// standard AND renders ~20% faster than 30 (more headroom inside the
// serverless time budget). ffmpeg encodes crf 21 + aac 160k stereo.
const W = 1280
const H = 720
const FPS = 24
// Supersample 1.5x for smooth Ken Burns motion (2x was 4× the pixels —
// the single biggest render-time sink; 1.5x keeps motion butter-smooth
// at roughly half the encode cost).
const SS_W = 1920
const SS_H = 1080

const requestSchema = z.object({
  prompt: z.string().min(3).max(1000),
  scenes: z.enum(['2', '3', '4', '5', '6']).optional().default('4'),
  voice: z.string().min(2).max(60).optional().default('en-US-AriaNeural'),
  style: z.enum(['cinematic', 'vibrant', 'minimal', 'documentary']).optional().default('cinematic'),
})



const PLANNER_PROMPT = `You are the video director of NEXUS AI. Plan a short video for the user's request. Respond with ONLY valid JSON:
{"title":"Video title","scenes":[{"image":"detailed image generation prompt, visual scene description","narration":"one sentence spoken aloud (max 20 words)","caption":"short on-screen text (max 6 words)"}]}
Rules: 3-6 scenes, each scene is a distinct visual beat with smooth visual continuity from the previous scene (same setting/world, progressing action). Style is specified by the user. Write narrations in the SAME LANGUAGE as the request. Image prompts: cinematic camera language (shot type, lens, lighting, color palette), describe composition precisely — no text in images.`

async function edgeTtsToFile(text: string, voice: string, outPath: string) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  // 96kbps (was 48kbps mono) — doubles narration clarity, half the cost of
  // the upscale in ffmpeg bitrate that used to mask the thin source audio.
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
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

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

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

    /* ---- AGNES AI path (explicit opt-in only) ----
     * The FREE local pipeline (FLUX scenes + Edge TTS + ffmpeg) is the
     * default everywhere — it works in the sandbox AND on Vercel with the
     * bundled static ffmpeg. Agnes (a paid 3rd-party API) is only used
     * when the operator explicitly sets USE_AGNES=true; previously any
     * AGNES_* env pair silently hijacked video generation and failed. */
    if (agnesConfigured() && process.env.USE_AGNES === 'true') {
      const agnesTask = async (): Promise<void> => {
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
            await db.generatedVideo.upsert({
              where: { jobId: id },
              create: {
                prompt,
                scenes: sceneCount,
                voice,
                style,
                url: null,
                jobId: id,
                status: 'rendering',
                userId: user?.id ?? null,
              },
              update: { status: 'rendering' },
            })
          } catch (e) {
            console.error('[video] agnes db placeholder save failed:', e)
          }
        } catch (err) {
          console.error(`[video job ${id}] agnes submit failed:`, err)
          job.status = 'error'
          job.error = err instanceof Error ? err.message : 'Agnes submission failed.'
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
            console.error('[video] agnes db error-path save failed:', e)
          }
        }
      }
      await persistStage('planning')
      after(() => agnesTask())

      return NextResponse.json({ jobId: id })
    }

    /* ---- GOOGLE VEO 3 path (opt-in: USE_VEO=true) ----
     * TRUE generative video with native audio — the Sora/Veo class of
     * output. Requires a Veo-capable Gemini key (paid tier); the cached
     * preflight falls back to the slideshow pipeline instantly when the
     * key lacks access. */
    if (veoConfigured() && (await veoAvailable())) {
      await persistStage('planning')
      after(async () => {
        try {
          job.status = 'rendering'
          job.progress = 20
          job.message = 'Veo 3 is generating your video (real AI video with audio)…'
          const clip = await veoGenerateClip(prompt, {
            pollTimeoutMs: 240_000,
            negativePrompt: 'blurry, low quality, distorted, watermark, text overlay, ugly',
          })
          await mkdir(VIDEO_DIR, { recursive: true })
          await writeFile(path.join(VIDEO_DIR, `${id}.mp4`), clip)
          job.status = 'done'
          job.progress = 100
          job.message = 'Video ready!'
          job.url = `/api/video/file/${id}`
          try {
            await db.generatedVideo.upsert({
              where: { jobId: id },
              create: {
                prompt,
                scenes: 1,
                voice,
                style,
                url: job.url,
                jobId: id,
                status: 'done',
                data: clip.toString('base64'),
                userId: user?.id ?? null,
              },
              update: { url: job.url, status: 'done', data: clip.toString('base64') },
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : ''
            if (/data|column/i.test(msg)) {
              await db.generatedVideo
                .upsert({
                  where: { jobId: id },
                  create: { prompt, scenes: 1, voice, style, url: job.url, jobId: id, status: 'done', userId: user?.id ?? null },
                  update: { url: job.url, status: 'done' },
                })
                .catch((e2: unknown) => console.error('[video] veo db save (no-data) failed:', e2))
            } else {
              console.error('[video] veo db save failed:', e)
            }
          }
        } catch (err) {
          console.error(`[video job ${id}] veo failed, falling back to slideshow:`, err)
          // FALLBACK: run the standard slideshow pipeline rather than
          // failing the job outright.
          job.status = 'planning'
          job.progress = 5
          job.message = 'Directing your video…'
          videoJobs.set(id, job)
          await runSlideshowPipeline()
        }
      })
      return NextResponse.json({ jobId: id })
    }

    // Run the whole pipeline AFTER the response — `after()` maps to Vercel's
    // waitUntil, which keeps the serverless function alive until the render
    // finishes (a plain fire-and-forget promise is frozen/killed the moment
    // the response is sent on serverless). Falls back to a floating promise
    // when `after` is unavailable (older runtimes).
    // Declared as a hoisted function so the Veo path above can also call it
    // as a graceful fallback when Veo generation fails mid-flight.
    async function runSlideshowPipeline(): Promise<void> {
      const workDir = path.join(VIDEO_DIR, id)
      try {
        await mkdir(workDir, { recursive: true })

        /* ---- 1. Plan scenes (with JSON repair + retry) ----
         * The planner LLM sometimes returns truncated / fenced / trailing-
         * comma JSON (free-pool models) — a raw JSON.parse crashed the job
         * ("JSON Parse error: Expected '}'"). parseJsonLoose() repairs the
         * common LLM malformations, and the planner retries once with a
         * different task route before giving up. */
        const parseJsonLoose = (text: string): Record<string, unknown> | null => {
          let t = text.replace(/```(?:json)?/gi, '').trim()
          const start = t.indexOf('{')
          if (start === -1) return null
          t = t.slice(start)
          // Keep only the outermost object body (cut anything after the
          // final '}' — trailing chatty text from small models).
          const lastBrace = t.lastIndexOf('}')
          if (lastBrace !== -1) t = t.slice(0, lastBrace + 1)
          const attempts = [
            t,
            t.replace(/,\s*([}\]])/g, '$1'), // trailing commas
            t.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' '),
          ]
          // Auto-close unbalanced braces/brackets (truncated completions).
          const closers = attempts.map((s) => {
            const stack: string[] = []
            let inStr = false
            let esc = false
            for (const ch of s) {
              if (esc) { esc = false; continue }
              if (ch === '\\') { esc = true; continue }
              if (ch === '"') inStr = !inStr
              if (inStr) continue
              if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
              else if (ch === '}' || ch === ']') stack.pop()
            }
            return s + (inStr ? '"' : '') + stack.reverse().join('')
          })
          for (const candidate of [...attempts, ...closers]) {
            try {
              return JSON.parse(candidate) as Record<string, unknown>
            } catch {
              /* try next repair */
            }
          }
          return null
        }
        job.status = 'planning'
        job.progress = 10
        // Planner quality drives EVERYTHING downstream (scene prompts,
        // narration, captions) — route it to the smart chat models (was
        // task:'fast', which could land on a 2.6B free model).
        const plannerMessages = [
          { role: 'assistant', content: PLANNER_PROMPT },
          { role: 'user', content: `Video request: ${prompt}\nVisual style: ${style}\nScenes: ${sceneCount}` },
        ]
        type VideoPlan = { title?: string; scenes?: Array<{ image?: string; narration?: string; caption?: string }> }
        let plan: VideoPlan | null = null
        for (const task of ['chat', 'reasoning', 'documents'] as const) {
          const raw = await smartChat(plannerMessages, { maxTokens: 2000, task, timeoutMs: 75_000 })
          const parsed = parseJsonLoose(raw)
          const candidateScenes = ((parsed?.scenes as Array<{ image?: string; narration?: string; caption?: string }> | undefined) ?? [])
            .filter((s): s is { image: string; narration?: string; caption?: string } => Boolean(s?.image))
          if (candidateScenes.length >= 2) {
            plan = parsed as VideoPlan
            break
          }
          job.message = 'The director model rambled — re-planning…'
        }
        const scenes = (plan?.scenes ?? [])
          .filter((s) => s.image)
          .slice(0, 6)
        if (scenes.length < 2) throw new Error('Could not plan the video scenes — the director model was unavailable. Try again.')
        job.scenes = scenes.map((s) => ({ caption: s.caption ?? '' }))
        job.message = `Planned ${scenes.length} scenes`

        /* ---- 2. Generate scene art (Pollinations FLUX — SEQUENTIAL + 429-safe) ----
         * The anonymous Pollinations tier allows roughly one image request
         * every few seconds — firing ALL scenes in parallel got instant
         * HTTP 429s and killed the whole job ("Scene image 1 failed").
         * pollinationsSequence() renders one scene at a time with internal
         * 429 retry/backoff, streams each finished image to the live film
         * strip (thumbnail), and starts TTS for that scene as soon as its
         * art is ready so the pipeline overlaps where it safely can. */
        job.status = 'images'
        void persistStage('images')
        const styleSuffix: Record<string, string> = {
          cinematic: 'cinematic film still, dramatic lighting, shallow depth of field, anamorphic, movie scene',
          vibrant: 'vibrant colors, high saturation, energetic, bold graphic composition',
          minimal: 'minimalist, clean composition, negative space, elegant simplicity',
          documentary: 'documentary photography, natural light, realistic, photojournalistic',
        }
        job.totalScenes = scenes.length
        job.activeScene = -1
        const sharp = (await import('sharp')).default
        await pollinationsSequence(
          scenes.map((s) => `${s.image}, ${styleSuffix[style] ?? ''}, ultra detailed, professional color grading, no text, no watermark`),
          `${W}x${H}`,
          {
            timeoutMs: 110_000,
            gapMs: 2_000,
            onRetry: (sceneIdx, attempt, delayMs, reason) => {
              job.message = `Scene ${sceneIdx + 1} is busy (${reason.split('responded ')[1] ?? 'rate limit'}) — retrying in ${Math.round(delayMs / 1000)}s…`
            },
            onScene: async (i, imgBuf) => {
              await writeFile(path.join(workDir, `scene${i}.png`), imgBuf)
              // 320px live thumbnail for the chat film strip.
              try {
                const thumb = await sharp(imgBuf)
                  .resize(320, Math.round((320 * H) / W), { fit: 'cover' })
                  .jpeg({ quality: 62 })
                  .toBuffer()
                job.sceneThumbs = [...(job.sceneThumbs ?? []), thumb.toString('base64')]
              } catch {
                /* thumbnails are cosmetic — never fail the pipeline */
              }
              job.activeScene = i < scenes.length - 1 ? i + 1 : -1
              job.progress = Math.max(job.progress, 15 + Math.round(((i + 1) / scenes.length) * 45))
              job.message = `Painted scene ${i + 1} of ${scenes.length}…`
            },
          }
        )

        /* ---- 3. Narration (Edge neural TTS — PARALLEL) ---- */
        job.status = 'narration'
        job.progress = 62
        job.message = 'Recording AI narration…'
        void persistStage('narration')
        const narrations: Array<{ file: string; dur: number }> = await Promise.all(
          scenes.map(async (scene, i) => {
            const mp3 = path.join(workDir, `nar${i}.mp3`)
            await edgeTtsToFile(scene.narration ?? scene.caption ?? '', voice, mp3)
            const dur = await audioDuration(mp3)
            return { file: mp3, dur }
          })
        )

        /* ---- 4. Render with ffmpeg (Ken Burns + sharp-burned captions) ---- */
        job.status = 'rendering'
        job.progress = 72
        void persistStage('rendering')
        const sceneFiles: string[] = []

        /** Burns the caption band into the scene PNG with sharp.
         *  (ffmpeg-static ships WITHOUT libfreetype → no drawtext filter —
         *  sharp renders the same caption style portably everywhere.) */
        const burnCaption = async (idx: number, text: string): Promise<string> => {
          if (!text) return path.join(workDir, `scene${idx}.png`)
          const src = path.join(workDir, `scene${idx}.png`)
          const dst = path.join(workDir, `cap${idx}.png`)
          const safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${H - 132}" width="${W}" height="132" fill="black" opacity="0.5"/>
  <text x="50%" y="${H - 66}" text-anchor="middle" dominant-baseline="middle"
        font-family="DejaVu Sans, Verdana, sans-serif" font-weight="bold"
        font-size="46" fill="#ffffff" stroke="#000000" stroke-width="1.4"
        paint-order="stroke">${safe}</text>
</svg>`
          const sharp = (await import('sharp')).default
          await sharp(src)
            .resize(W, H, { fit: 'cover' })
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .png()
            .toFile(dst)
          return dst
        }

        for (let i = 0; i < scenes.length; i++) {
          job.progress = 72 + Math.round((i / scenes.length) * 22)
          job.message = `Rendering scene ${i + 1} of ${scenes.length}…`
          const dur = Math.max(narrations[i]?.dur ?? 3, 3.2)
          const out = path.join(workDir, `clip${i}.mp4`)
          const caption = scenes[i]?.caption?.slice(0, 40) ?? ''
          const inputPng = await burnCaption(i, caption)
          // Alternate zoom direction for visual variety
          const zoomIn = i % 2 === 0
          const zoomExpr = zoomIn
            ? "zoompan=z='min(zoom+0.0009,1.13)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            : "zoompan=z='if(eq(on,1),1.13,max(zoom-0.0009,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          const vf =
            `[0:v]scale=${SS_W}:${SS_H}:force_original_aspect_ratio=increase,crop=${SS_W}:${SS_H},` +
            `${zoomExpr}:d=${Math.round(dur * FPS)}:s=${W}x${H}:fps=${FPS},` +
            `fade=t=in:st=0:d=0.4,fade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4[v]`

          await execFileAsync(await ffmpegPath(), [
            '-y',
            '-loop', '1',
            '-i', inputPng,
            '-i', narrations[i].file,
            '-filter_complex', vf,
            '-map', '[v]',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '160k',
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
              error: job.error?.slice(0, 500),
              userId: user?.id ?? null,
            },
            update: { status: 'error', error: job.error?.slice(0, 500) },
          })
        } catch (e) {
          console.error('[video] db save (error path) failed:', e)
        }
      }
    }

    // Schedule the pipeline: `after()` keeps the lambda alive on Vercel
    // (waitUntil). The placeholder row is awaited FIRST so a status poll
    // on ANY instance can already resolve the job from the DB.
    await persistStage('planning')
    after(() => runSlideshowPipeline())
    return NextResponse.json({ jobId: id })
  } catch (error) {
    console.error('[api/video/create] POST error:', error)
    const message = error instanceof Error ? error.message : 'Video generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
