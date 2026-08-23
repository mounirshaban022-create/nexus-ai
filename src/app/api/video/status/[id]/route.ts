import { NextRequest, NextResponse } from 'next/server'
import { videoJobs } from '@/lib/video-jobs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
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
