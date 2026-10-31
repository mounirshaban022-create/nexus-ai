import { NextRequest, NextResponse } from 'next/server'
import { requireConsole } from '@/lib/console/auth'
import { audit } from '@/lib/console/guard'
import { enginePresence } from '@/lib/console/engines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/console/integrations — the credential vault + live connectivity
 * tests for every external platform the deployment touches.
 *
 * GET  → presence map (never values) + live probes:
 *        • Vercel  — GET /v9/projects + latest deployments via VERCEL_TOKEN
 *        • GitHub  — GET /repos/<owner>/<repo> + recent commits via GITHUB_TOKEN
 *        • Supabase — NEXT_PUBLIC_SUPABASE_URL reachability (REST health)
 * POST { platform, token? } → re-test with an optional operator-supplied
 *        token (stored in nothing, used for the single probe) — audited.
 */

const GITHUB_REPO = process.env.GITHUB_REPO || 'mounirshaban022-create/nexus-ai'

async function probeVercel(token: string): Promise<Record<string, unknown>> {
  if (!token) return { configured: false, ok: false }
  try {
    const res = await fetch('https://api.vercel.com/v9/projects?limit=10', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { configured: true, ok: false, error: `Vercel API ${res.status}` }
    const data = await res.json()
    const projects = (data.projects ?? []).map((p: Record<string, unknown>) => ({
      name: p.name, id: p.id, framework: p.framework, createdAt: p.createdAt,
      latestDeployment: (p.latestDeployments?.[0]?.url) ?? null,
    }))
    return { configured: true, ok: true, projects }
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : 'probe failed' }
  }
}

async function probeVercelDeployments(token: string): Promise<Record<string, unknown>[]> {
  if (!token) return []
  try {
    const res = await fetch('https://api.vercel.com/v6/deployments?limit=6&target=production', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.deployments ?? []).map((d: Record<string, unknown>) => ({
      url: d.url, state: d.state, createdAt: d.createdAt,
      commit: (d.meta as Record<string, string>)?.githubCommitMessage ?? (d.meta as Record<string, string>)?.githubCommitRef ?? '',
      readyState: d.readyState,
    }))
  } catch {
    return []
  }
}

async function probeGitHub(token: string): Promise<Record<string, unknown>> {
  if (!token) return { configured: false, ok: false }
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { configured: true, ok: false, error: `GitHub API ${res.status}` }
    const repo = await res.json()
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=6`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    })
    const commits = commitRes.ok ? await commitRes.json() : []
    return {
      configured: true, ok: true,
      repo: {
        fullName: repo.full_name, branch: repo.default_branch, private: repo.private,
        stars: repo.stargazers_count, openIssues: repo.open_issues_count,
        pushedAt: repo.pushed_at, language: repo.language,
      },
      commits: (Array.isArray(commits) ? commits : []).slice(0, 6).map((c: Record<string, unknown>) => ({
        sha: String(c.sha ?? '').slice(0, 7),
        message: (c.commit as Record<string, string>)?.message?.split('\n')[0] ?? '',
        author: (c.commit as Record<string, { name?: string }>)?.author?.name ?? '',
        date: String(((c.commit as { author?: { date?: string } } | undefined)?.author?.date) ?? ''),
      })),
    }
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : 'probe failed' }
  }
}

async function probeSupabase(): Promise<Record<string, unknown>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return { configured: false, ok: false }
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(10_000) })
    return { configured: true, ok: res.ok, url, status: res.status }
  } catch (err) {
    return { configured: true, ok: false, url, error: err instanceof Error ? err.message : 'probe failed' }
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const vt = process.env.VERCEL_TOKEN ?? ''
    const gt = process.env.GITHUB_TOKEN ?? ''

    const [vercel, deployments, github, supabase] = await Promise.all([
      probeVercel(vt),
      probeVercelDeployments(vt),
      probeGitHub(gt),
      probeSupabase(),
    ])

    return NextResponse.json({
      presence: enginePresence(),
      integrations: { vercel, github, supabase },
      deployments,
      repoEnv: GITHUB_REPO,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[api/console/integrations] error:', error)
    return NextResponse.json({ error: 'Failed to probe integrations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireConsole(req)
  if (denied) return denied
  try {
    const body = await req.json().catch(() => ({}))
    const platform = String(body?.platform ?? '')
    await audit('integrations.retest', { target: platform })
    // Re-probe uses env credentials only; operator can't inject arbitrary
    // tokens into the server (values live exclusively in deployment env).
    const vt = process.env.VERCEL_TOKEN ?? ''
    const gt = process.env.GITHUB_TOKEN ?? ''
    if (platform === 'vercel') return NextResponse.json({ vercel: await probeVercel(vt) })
    if (platform === 'github') return NextResponse.json({ github: await probeGitHub(gt) })
    if (platform === 'supabase') return NextResponse.json({ supabase: await probeSupabase() })
    return NextResponse.json({ error: 'Unknown platform' }, { status: 400 })
  } catch (error) {
    console.error('[api/console/integrations] POST error:', error)
    return NextResponse.json({ error: 'Retest failed' }, { status: 500 })
  }
}
