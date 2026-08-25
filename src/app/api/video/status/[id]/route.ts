import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { videoJobs } from '@/lib/video-jobs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
    // Rate limit: 60 reads per minute per client (prevents scraping/DoS)
    const rl = rateLimit(`video-status:${clientKey(_req)}`, 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

  const { id } = await context.params
  const job = videoJobs.get(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
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
