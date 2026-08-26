import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { videoJobs } from '@/lib/video-jobs'
import { agnesGetVideoStatus } from '@/lib/agnes-video'
import { db } from '@/lib/db'
import { supabaseUpsert } from '@/lib/supabase'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`video-status:${clientKey(_req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  const { id } = await context.params
  let job = videoJobs.get(id)

  /* ---- VERCEL FALLBACK: serverless invocations hit different instances,
   * so the in-memory map can miss a job that's actively rendering on the
   * instance that created it. Derive the snapshot from the DB row. ---- */
  if (!job) {
    try {
      const row = await db.generatedVideo.findFirst({ where: { jobId: id } })
      if (!row) {
        return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
      }
      const status = row.status === 'done' ? 'done' : row.status === 'error' ? 'error' : 'rendering'
      return NextResponse.json({
        job: {
          id,
          status,
          progress: status === 'done' ? 100 : status === 'error' ? 0 : 60,
          message:
            status === 'done'
              ? 'Video ready!'
              : status === 'error'
                ? 'Video generation failed on the server.'
                : 'Rendering your video…',
          url: row.url ?? (status === 'done' ? `/api/video/file/${id}` : ''),
          error: status === 'error' ? 'Video generation failed on the server.' : '',
          prompt: row.prompt,
          scenes: null,
        },
      })
    } catch {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }
  }

  /* ---- Agnes poll (only when the job originated there) ----
   * Throttle to one upstream call every 3s to avoid hammering the
   * Agnes API. Updates the in-memory job (and the DB row when done)
   * before returning the snapshot to the client. */
  if (job.agnesJobId) {
    const now = Date.now()
    const lastPoll = job.agnesPolledAt ?? 0
    if (now - lastPoll >= 3000 && job.status !== 'done' && job.status !== 'error') {
      job.agnesPolledAt = now
      try {
        const agnes = await agnesGetVideoStatus(job.agnesJobId)

        if (agnes.status === 'complete' && agnes.videoUrl) {
          job.status = 'done'
          job.progress = 100
          job.message = 'Video ready!'
          // Surface the Agnes-hosted URL directly. The client streams
          // it from Agnes; /api/video/file/[id] is only used by the
          // local ffmpeg pipeline (kept for the sandbox fallback path).
          job.url = agnes.videoUrl

          // Update the DB row (created as a placeholder in the create route).
          try {
            await db.generatedVideo.updateMany({
              where: { jobId: id },
              data: { status: 'done', url: job.url },
            })
            const record = await db.generatedVideo.findFirst({
              where: { jobId: id },
              select: { id: true, userId: true },
            })
            if (record?.userId) {
              void supabaseUpsert(
                'generated_videos',
                {
                  id: record.id,
                  user_id: record.userId,
                  prompt: job.prompt,
                  status: 'done',
                  url: job.url,
                },
                { onConflict: 'id' }
              )
            }
          } catch (e) {
            console.error('[video] agnes status DB update failed:', e)
          }
        } else if (agnes.status === 'failed') {
          job.status = 'error'
          job.error = agnes.error || 'Agnes generation failed.'
          try {
            await db.generatedVideo.updateMany({
              where: { jobId: id },
              data: { status: 'error' },
            })
          } catch (e) {
            console.error('[video] agnes status DB update (error) failed:', e)
          }
        } else {
          // Still queued or rendering — surface progress + message.
          if (typeof agnes.progress === 'number') {
            job.progress = Math.max(job.progress, Math.min(95, agnes.progress))
          }
          job.message =
            agnes.status === 'queued'
              ? 'Agnes AI is queuing your video…'
              : 'Agnes AI is generating the video…'
          if (agnes.error) {
            // Non-fatal warning — keep the job in 'rendering'.
            console.warn(`[agnes] job ${job.agnesJobId} warning: ${agnes.error}`)
          }
        }
      } catch (err) {
        console.error('[video] agnes poll failed:', err)
        // Don't mark the job as failed — the upstream may be temporarily
        // unreachable. Leave the in-memory snapshot as-is so the client
        // can retry on the next poll.
      }
    }
  }

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      url: job.url,
      error: job.error,
      prompt: job.prompt,
      scenes: job.scenes,
    },
  })
}
