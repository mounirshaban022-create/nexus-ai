import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { rateLimit, clientKey } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * REAL code execution sandbox.
 * Runs user code in an isolated temp directory with a hard timeout,
 * output size limits, and a clean environment — like z.ai's sandbox.
 */

const requestSchema = z.object({
  language: z.enum(['javascript', 'typescript', 'python']),
  code: z.string().min(1).max(50_000),
  stdin: z.string().max(20_000).optional().default(''),
})

const TIMEOUT_MS = 15_000
const MAX_OUTPUT = 100_000 // 100KB

interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
}

function execWithTimeout(
  command: string,
  args: string[],
  cwd: string,
  stdin: string
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(command, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: cwd,
        LANG: 'en_US.UTF-8',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)

    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += data.toString().slice(0, MAX_OUTPUT - stdout.length)
    })
    child.stderr.on('data', (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += data.toString().slice(0, MAX_OUTPUT - stderr.length)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: stderr + `\nFailed to start: ${err.message}`,
        exitCode: null,
        timedOut,
        durationMs: Date.now() - started,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code, timedOut, durationMs: Date.now() - started })
    })

    if (stdin) {
      child.stdin.write(stdin)
    }
    child.stdin.end()
  })
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`code-run:${clientKey(req)}`, 20, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Sandbox limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Language and code are required.' }, { status: 400 })
    }
    const { language, code, stdin } = parsed.data

    // Isolated temp directory per execution
    const workDir = await mkdtemp(path.join(tmpdir(), `nexus-sandbox-${randomUUID().slice(0, 8)}-`))

    try {
      let result: ExecResult

      if (language === 'python') {
        const file = path.join(workDir, 'main.py')
        await writeFile(file, code, 'utf8')
        result = await execWithTimeout('python3', [file], workDir, stdin)
      } else if (language === 'typescript') {
        const file = path.join(workDir, 'main.ts')
        await writeFile(file, code, 'utf8')
        result = await execWithTimeout('bun', ['run', file], workDir, stdin)
      } else {
        const file = path.join(workDir, 'main.js')
        await writeFile(file, code, 'utf8')
        result = await execWithTimeout('bun', ['run', file], workDir, stdin)
      }

      if (result.timedOut) {
        result.stderr += `\n⏱ Execution timed out after ${TIMEOUT_MS / 1000}s (process killed).`
      }

      return NextResponse.json({
        result: {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          language,
        },
      })
    } finally {
      // Always clean up the sandbox directory
      rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  } catch (error) {
    console.error('[api/code/run] POST error:', error)
    const message = error instanceof Error ? error.message : 'Execution failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
