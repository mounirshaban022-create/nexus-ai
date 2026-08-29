import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { z } from 'zod'
import { smartChat } from '@/lib/smart-chat'
import { rateLimit, clientKey } from '@/lib/rate-limit'

const requestSchema = z.object({
  action: z.enum(['explain', 'fix', 'improve', 'generate']),
  language: z.enum(['javascript', 'typescript', 'python']).optional(),
  code: z.string().max(30_000).optional().default(''),
  prompt: z.string().max(2000).optional().default(''),
})

const SYSTEM_PROMPTS: Record<string, string> = {
  explain:
    'You are a senior engineer. Explain the given code clearly and concisely in Markdown: what it does, how it works, edge cases, and complexity. Be practical.',
  fix: 'You are a senior engineer. Find and fix ALL bugs in the given code. Reply with: 1) a short list of bugs found, 2) the complete corrected code in a single code block with the language tag.',
  improve:
    'You are a senior engineer. Improve the given code: readability, performance, edge cases, best practices. Reply with: 1) a short summary of changes, 2) the complete improved code in one code block.',
  generate:
    'You are a senior engineer. Write complete, production-quality, runnable code for the user\'s request. Include brief comments. Reply with ONE complete code block plus 2-3 sentences of explanation.',
}

export async function POST(req: NextRequest) {
  // GUEST LOCKDOWN (owner directive): this capability requires an account.
  const denied = await requireVerifiedSession(req)
  if (denied) return denied

  try {
    const limit = rateLimit(`code-assist:${clientKey(req)}`, 15, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: 'AI assist limit reached. Wait a moment.' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const { action, language, code, prompt } = parsed.data

    if (action === 'generate' && !prompt.trim()) {
      return NextResponse.json({ error: 'Describe what to generate.' }, { status: 400 })
    }
    if (action !== 'generate' && !code.trim()) {
      return NextResponse.json({ error: 'Write some code first.' }, { status: 400 })
    }

    const userContent =
      action === 'generate'
        ? `Language: ${language ?? 'javascript'}\n\nRequest: ${prompt}`
        : `Language: ${language ?? 'javascript'}\n\n\`\`\`\n${code}\n\`\`\``

    const reply = (await smartChat(
      [
        { role: 'assistant', content: SYSTEM_PROMPTS[action] },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 4000, task: 'code' }
    )).trim()

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('[api/code/assist] POST error:', error)
    const message = error instanceof Error ? error.message : 'AI assist failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
