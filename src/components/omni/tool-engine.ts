'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { safeJsonFetch } from '@/lib/safe-fetch'

/**
 * Unified tool dispatcher for the Nexus composer.
 *
 * When a tool is "pending" (user clicked a tool in the + menu),
 * the next message gets routed to that tool's API instead of /api/chat.
 *
 * Tool results come back as `ChatAttachment` objects that the existing
 * <AttachmentCard> component renders inline in the conversation.
 */

export type ToolId =
  | 'image'
  | 'video'
  | 'code'
  | 'vision'
  | 'upload'
  | 'search'
  | 'office'
  | 'documents'
  | 'agent'
  | 'connectors'
  | 'email'

export interface ToolDef {
  id: ToolId
  label: string
  category: 'Create' | 'Understand' | 'Think' | 'Work' | 'Connect'
  placeholder: string
  /** If true, this tool requires a file upload before the prompt is sent */
  needsFile?: boolean
  fileAccept?: string
}

export const TOOLS: Record<ToolId, ToolDef> = {
  image:      { id: 'image',      label: 'Image',            category: 'Create',    placeholder: 'Describe the image to generate...' },
  video:      { id: 'video',      label: 'Video',            category: 'Create',    placeholder: 'Describe the video to create...' },
  office:     { id: 'office',     label: 'Writing',         category: 'Create',    placeholder: 'What should I write? (memo, email, blog...)' },
  upload:     { id: 'upload',     label: 'Upload file',      category: 'Understand',placeholder: 'Ask a question about this file...', needsFile: true, fileAccept: '.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv' },
  vision:     { id: 'vision',     label: 'Vision',           category: 'Understand',placeholder: 'What do you want to know about this image?', needsFile: true, fileAccept: 'image/*' },
  documents:  { id: 'documents',  label: 'Document analysis',category: 'Understand',placeholder: 'Ask anything about the uploaded document...', needsFile: true, fileAccept: '.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv' },
  search:     { id: 'search',     label: 'Deep research',   category: 'Think',     placeholder: 'What should I research on the web?' },
  agent:      { id: 'agent',      label: 'Reasoning',        category: 'Think',     placeholder: 'What hard problem should I solve?' },
  code:       { id: 'code',       label: 'Code',            category: 'Work',      placeholder: 'Paste code to run, or describe what to build...' },
  connectors: { id: 'connectors', label: 'Connected apps',   category: 'Connect',   placeholder: 'Describe the integration task...' },
  email:      { id: 'email',      label: 'Email',           category: 'Connect',   placeholder: 'What email should I draft?' },
}

interface FileData {
  name: string
  type: string
  /** base64 data URL */
  dataUrl: string
  size: number
}

interface ToolExecutionResult {
  content: string          // assistant text shown before the attachment
  attachments?: any[]      // ChatAttachment[] shape from ./modes
}

/**
 * The tool engine — manages pending tool, file upload, and routing.
 * Returns the state + a single `execute(prompt)` callback that the
 * composer calls when the user hits send.
 */
export function useToolEngine(
  onAssistant: (msg: { content: string; attachments?: any[] }) => void,
  onToolRunning: (running: boolean, label?: string) => void,
) {
  const [pendingTool, setPendingTool] = useState<ToolId | null>(null)
  const [pendingFile, setPendingFile] = useState<FileData | null>(null)
  const [toolError, setToolError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pickFile = useCallback((accept: string) => {
    if (!fileInputRef.current) return
    fileInputRef.current.accept = accept
    fileInputRef.current.click()
  }, [])

  const onFilePicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset for same-file re-pick
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPendingFile({
        name: file.name,
        type: file.type,
        dataUrl: reader.result as string,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  }, [])

  const clear = useCallback(() => {
    setPendingTool(null)
    setPendingFile(null)
    setToolError(null)
  }, [])

  const execute = useCallback(async (prompt: string) => {
    if (!pendingTool) return false
    const tool = TOOLS[pendingTool]
    setToolError(null)
    onToolRunning(true, tool.label)

    try {
      let result: ToolExecutionResult | null = null

      switch (pendingTool) {
        case 'image': {
          // Image generation can take 30-90s; allow generous timeout.
          const r = await safeJsonFetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          }, { timeoutMs: 150_000, label: 'Image generation' })
          if (!r.ok || !r.data?.image?.url) throw new Error(r.error || 'Image generation failed. Please try again.')
          result = {
            content: `Here's the image I generated for: "${prompt}"`,
            attachments: [{
              type: 'image',
              url: r.data.image.url,
              title: prompt,
            }],
          }
          break
        }
        case 'video': {
          // Kick off async job and poll
          const startRes = await safeJsonFetch<{ jobId?: string }>(
            '/api/video/create',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, scenes: '4' }),
            },
            { timeoutMs: 60_000, label: 'Video creation' }
          )
          if (!startRes.ok || !startRes.data?.jobId) throw new Error(startRes.error || 'Video creation failed. Please try again.')
          const jobId = startRes.data.jobId
          // Poll until done (max ~5 minutes)
          let job: any = { status: 'planning', progress: 5, message: 'Planning…' }
          for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 3000))
            const s = await safeJsonFetch<any>(`/api/video/status/${jobId}`, {}, { timeoutMs: 20_000, label: 'Video status' })
            if (!s.ok || !s.data) continue
            job = s.data
            onToolRunning(true, `Video · ${job.message ?? 'working…'} ${job.progress ?? 0}%`)
            if (job.status === 'done' || job.status === 'error') break
          }
          if (job.status === 'error') throw new Error(job.error || 'Video rendering failed.')
          if (!job.url) throw new Error('Video is still rendering — check your Library shortly.')
          result = {
            content: `Here's the video I created for: "${prompt}"`,
            attachments: [{
              type: 'video',
              url: job.url,
              title: `Video: ${prompt.slice(0, 60)}`,
            }],
          }
          break
        }
        case 'code': {
          const r = await safeJsonFetch<any>('/api/code/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: detectLanguage(prompt),
              code: prompt,
            }),
          }, { timeoutMs: 60_000, label: 'Code execution' })
          if (!r.ok || !r.data?.result) throw new Error(r.error || 'Code execution failed.')
          const res = r.data.result
          result = {
            content: `I ran your ${res.language} code in the sandbox:`,
            attachments: [{
              type: 'code',
              language: res.language,
              stdout: res.stdout,
              stderr: res.stderr,
              exitCode: res.exitCode,
            }],
          }
          break
        }
        case 'vision': {
          if (!pendingFile) throw new Error('Please attach an image first.')
          const r = await safeJsonFetch<any>('/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: pendingFile.dataUrl, prompt }),
          }, { timeoutMs: 90_000, label: 'Vision analysis' })
          if (!r.ok || !r.data?.analysis) throw new Error(r.error || 'Vision analysis failed.')
          result = {
            content: r.data.analysis,
            attachments: [],
          }
          break
        }
        case 'upload':
        case 'documents': {
          if (!pendingFile) throw new Error('Please attach a file first.')
          // Step 1: upload + parse
          const upRes = await safeJsonFetch<any>('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: pendingFile.dataUrl,
              filename: pendingFile.name,
              format: detectFormat(pendingFile.name),
            }),
          }, { timeoutMs: 120_000, label: 'Document upload' })
          if (!upRes.ok || !upRes.data?.document) throw new Error(upRes.error || 'Could not read that file. Please try a different file.')
          const doc = upRes.data.document
          // Step 2: if user has a question, ask it
          if (prompt.trim()) {
            const qRes = await safeJsonFetch<any>(
              `/api/documents?id=${encodeURIComponent(doc.id)}&q=${encodeURIComponent(prompt)}`,
              {},
              { timeoutMs: 60_000, label: 'Document analysis' }
            )
            if (!qRes.ok || !qRes.data?.answer) throw new Error(qRes.error || 'Could not answer that about the document.')
            result = {
              content: qRes.data.answer,
              attachments: [],
            }
          } else {
            result = {
              content: `I've read **${doc.filename}**. Here's a summary:\n\n${doc.summary || 'Document processed successfully.'}`,
              attachments: [],
            }
          }
          break
        }
        case 'search': {
          // Perplexity-style answer engine — stream NDJSON events from /api/answer
          // and build a single 'answer' attachment with plan + sources + cited answer + follow-ups.
          const res = await fetch('/api/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: prompt, mode: 'pro', includeEmail: true }),
          })
          const ct = res.headers.get('content-type') ?? ''
          if (!res.ok || ct.includes('text/html') || ct.includes('text/plain')) {
            // Read body for error context, then surface a friendly message
            const txt = await res.text().catch(() => '')
            const msg = res.status === 429
              ? 'You are searching a bit too fast. Please wait a moment and try again.'
              : res.status >= 500
                ? 'The answer engine is busy right now. Please try again.'
                : (txt.slice(0, 200) || 'Search failed. Please try again.')
            throw new Error(msg)
          }
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          const steps: Array<{ id: string; query: string; reason: string }> = []
          let sources: Array<{ n: number; title: string; url: string; host: string; snippet?: string; favicon?: string; date?: string }> = []
          const emailMatches: Array<{ subject: string; from: string; date: string | null; snippet: string }> = []
          let answer = ''
          let followUps: string[] = []
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const e = JSON.parse(line)
                switch (e.type) {
                  case 'plan':
                    steps.push(...(e.steps || []))
                    onToolRunning(true, `Answer · planned ${steps.length || 'a few'} searches`)
                    break
                  case 'search_start':
                    onToolRunning(true, `Answer · searching the web…`)
                    break
                  case 'search_done':
                    // results are accumulated server-side; we get the final list in 'sources'
                    break
                  case 'read_start':
                    try { onToolRunning(true, `Answer · reading ${new URL(e.url).hostname}`) } catch { /* */ }
                    break
                  case 'email_search_done':
                    emailMatches.push(...(e.matches || []))
                    break
                  case 'email_skipped':
                    break
                  case 'synthesize_start':
                    onToolRunning(true, 'Answer · synthesizing cited answer…')
                    break
                  case 'answer':
                    answer = e.content || ''
                    break
                  case 'sources':
                    if (Array.isArray(e.sources)) sources = e.sources
                    break
                  case 'followups':
                    followUps = e.questions || []
                    break
                  case 'error':
                    throw new Error(e.message || 'The answer engine ran into a problem.')
                    break
                }
              } catch {
                /* ignore individual line parse errors */
              }
            }
          }
          result = {
            content: answer
              ? `Here's a researched answer for: "${prompt}"`
              : `I searched but couldn't synthesize an answer for "${prompt}". Try rephrasing.`,
            attachments: [{
              type: 'answer',
              query: prompt,
              steps,
              sources,
              answer,
              followUps,
              emailMatches,
            }],
          }
          break
        }
        case 'office': {
          // Plan first
          const planRes = await safeJsonFetch<any>('/api/office/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          }, { timeoutMs: 60_000, label: 'Document planning' })
          if (!planRes.ok || !planRes.data?.plan) throw new Error(planRes.error || 'Planning failed.')
          // Then create
          const createRes = await safeJsonFetch<any>('/api/office/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, plan: planRes.data.plan }),
          }, { timeoutMs: 120_000, label: 'Document creation' })
          if (!createRes.ok || !createRes.data?.attachment) throw new Error(createRes.error || 'Document creation failed.')
          const a = createRes.data.attachment
          result = {
            content: `I drafted a ${a?.format?.toUpperCase() || 'document'} for you. Download below:`,
            attachments: [{
              type: 'document',
              url: a?.downloadUrl || a?.url,
              title: a?.title || 'Document',
              format: a?.format || 'docx',
              size: a?.size,
            }],
          }
          break
        }
        case 'email': {
          // Step 1: Draft the email via /api/chat with a strict JSON-only instruction.
          const draftInstruction =
            'You are Nexus\'s email drafting assistant. Based on the user\'s request, draft a professional email. ' +
            'Respond with ONLY a JSON object (no markdown fences, no prose before or after) in EXACTLY this shape:\n' +
            '{"to": "<recipient email address, or empty string if the user did not specify one>", ' +
            '"subject": "<a concise, professional subject line>", ' +
            '"body": "<the email body, professional tone, well-structured, signed with your name>"}\n\n' +
            'Rules:\n' +
            '- If the user did not specify a recipient, set "to" to "" (empty string).\n' +
            '- Never invent a recipient email address.\n' +
            '- The body should be 2-6 short paragraphs as one string with \\n line breaks.\n' +
            '- Sign off as "Best regards,\\nNexus" unless the user specified a sender name.\n\n' +
            'User request: ' + prompt

          onToolRunning(true, 'Email · drafting…')
          const draftRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: draftInstruction }),
          })
          const draftCt = draftRes.headers.get('content-type') ?? ''
          if (!draftRes.ok || draftCt.includes('text/html')) {
            throw new Error('Could not draft the email. Please try again.')
          }
          // Collect streamed NDJSON assistant content
          const dReader = draftRes.body!.getReader()
          const dDecoder = new TextDecoder()
          let dBuf = ''
          let draftText = ''
          for (;;) {
            const { done, value } = await dReader.read()
            if (done) break
            dBuf += dDecoder.decode(value, { stream: true })
            const lines = dBuf.split('\n')
            dBuf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const e = JSON.parse(line)
                if (e.type === 'assistant' && typeof e.content === 'string') {
                  draftText += e.content
                }
                if (e.type === 'error') throw new Error(e.message || 'Drafting failed.')
              } catch (pe: any) {
                // A parse error on one line shouldn't kill the whole stream —
                // but if it's our own thrown error, re-throw it.
                if (pe.message && /Drafting failed|failed/i.test(pe.message)) throw pe
              }
            }
          }
          // Extract the JSON object from the drafted text (brace-matching, string-aware)
          const jsonStr = extractJsonObject(draftText)
          if (!jsonStr) {
            result = {
              content: `I couldn't draft a valid email from that request. Try: "Send an email to jane@example.com about tomorrow's meeting at 3pm."`,
              attachments: [],
            }
            break
          }
          let draft: { to?: string; subject?: string; body?: string }
          try {
            draft = JSON.parse(jsonStr)
          } catch {
            result = {
              content: `The drafted email wasn't valid JSON. Please try rephrasing your request.`,
              attachments: [],
            }
            break
          }

          // Step 2: If no recipient, ask the user to provide one.
          if (!draft.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.to)) {
            result = {
              content: `I drafted your email${draft.subject ? ` "${draft.subject}"` : ''}, but you didn't tell me who to send it to. Reply with the recipient's email address and I'll send it right away.`,
              attachments: [{
                type: 'email',
                subject: draft.subject || '',
                body: draft.body || '',
                needsConnect: false,
              }],
            }
            break
          }

          // Step 3: Send via /api/email/send
          onToolRunning(true, `Email · sending to ${draft.to}…`)
          const sendRes = await safeJsonFetch<any>('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: draft.to,
              subject: draft.subject || '(no subject)',
              body: draft.body || '',
            }),
          }, { timeoutMs: 45_000, label: 'Email send' })

          if (!sendRes.ok) {
            // Check if it's the "needs connect" case (status 400 + needsConnect)
            if (sendRes.status === 400 && /no email account/i.test(sendRes.error || '')) {
              result = {
                content: `I drafted your email to ${draft.to}, but no email account is connected yet. Connect your email to send it.`,
                attachments: [{
                  type: 'email',
                  to: draft.to,
                  subject: draft.subject || '',
                  body: draft.body || '',
                  needsConnect: true,
                }],
              }
            } else {
              throw new Error(sendRes.error || 'Could not send the email. Please try again.')
            }
            break
          }

          result = {
            content: `I've sent your email to **${draft.to}**. ✉️`,
            attachments: [{
              type: 'email',
              to: draft.to,
              subject: draft.subject || '',
              body: draft.body || '',
              messageId: sendRes.data?.messageId,
              needsConnect: false,
            }],
          }
          break
        }
        default:
          // agent, connectors — fall back to plain chat routing
          // (connectors is intercepted by page.tsx and opens the ConnectPanel)
          return false
      }

      if (result) {
        onAssistant({ content: result.content, attachments: result.attachments })
      }
      // Clear the pending tool after execution
      setPendingTool(null)
      setPendingFile(null)
      return true
    } catch (err: any) {
      setToolError(err.message || 'Tool execution failed.')
      onAssistant({ content: `⚠️ ${err.message || 'Tool execution failed.'}` })
      return true
    } finally {
      onToolRunning(false)
    }
  }, [pendingTool, pendingFile, onAssistant, onToolRunning])

  return {
    pendingTool,
    pendingFile,
    toolError,
    fileInputRef,
    setPendingTool: (id: ToolId | null) => {
      setToolError(null)
      setPendingTool(id)
      setPendingFile(null)
      const def = TOOLS[id]
      if (def?.needsFile) {
        pickFile(def.fileAccept || '*')
      }
    },
    clearPendingFile: () => setPendingFile(null),
    onFilePicked,
    clear,
    execute,
  }
}

function detectLanguage(code: string): 'javascript' | 'typescript' | 'python' {
  if (/^\s*(def |import |from |print\(|lambda )/m.test(code) || /\bprint\(/.test(code)) return 'python'
  if (/(interface|type|:\s*(string|number|boolean)\b|import\s+\{)/.test(code)) return 'typescript'
  return 'javascript'
}

function detectFormat(filename: string): 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md' | 'csv' {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'md') return 'md'
  if (ext === 'csv') return 'csv'
  return 'txt'
}

/**
 * Balanced-brace JSON extraction (string-aware). Finds the first complete
 * top-level {...} object in `text` and returns it as a string. Returns
 * null if no valid object is found. Used to extract the drafted email JSON
 * from an LLM response that may contain surrounding prose/markdown fences.
 */
function extractJsonObject(text: string): string | null {
  // Strip markdown code fences first
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}
