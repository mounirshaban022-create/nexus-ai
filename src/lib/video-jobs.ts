/** Shared in-memory video job tracker (background pipeline progress). */

export interface VideoJob {
  id: string
  status: 'planning' | 'images' | 'narration' | 'rendering' | 'done' | 'error'
  progress: number
  message: string
  prompt: string
  url?: string
  error?: string
  startedAt: number
  scenes?: Array<{ caption: string }>
  /** LIVE PREVIEW: small base64 JPEG thumbnails (320px) pushed as each
   *  scene image finishes painting — the chat video card shows a film
   *  strip building up in real time. In-memory only (the DB row keeps
   *  metadata + final bytes; thumbs are transient UI sugar). */
  sceneThumbs?: string[]
  /** How many scenes the plan produced — lets the UI show "3 / 4 painted". */
  totalScenes?: number
  /** Which scene index is currently being painted (0-based; -1 = none). */
  activeScene?: number
  /** When set, the job was submitted to Agnes AI and the status route
   *  must poll Agnes (agnesGetVideoStatus) on every read. */
  agnesJobId?: string
  /** Timestamp of the most recent Agnes poll — used to throttle polls. */
  agnesPolledAt?: number
}

const globalForJobs = globalThis as unknown as { videoJobs?: Map<string, VideoJob> }

export const videoJobs: Map<string, VideoJob> =
  globalForJobs.videoJobs ?? (globalForJobs.videoJobs = new Map<string, VideoJob>())

/** Prunes finished jobs older than 30 minutes (prevents unbounded memory growth). */
export function pruneVideoJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, job] of videoJobs) {
    if (job.startedAt < cutoff && (job.status === 'done' || job.status === 'error')) {
      videoJobs.delete(id)
    }
  }
}
