'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

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
          const res = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Image generation failed.')
          result = {
            content: `Here's the image I generated for: "${prompt}"`,
            attachments: [{
              type: 'image',
              url: data.image.url,
              title: prompt,
            }],
          }
          break
        }
        case 'video': {
          // Kick off async job and poll
          const startRes = await fetch('/api/video/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, scenes: '4' }),
          })
          const startData = await startRes.json()
          if (!startRes.ok) throw new Error(startData.error || 'Video creation failed.')
          const jobId = startData.jobId
          // Poll until done (max ~5 minutes)
          let job: any = { status: 'planning', progress: 5, message: 'Planning…' }
          for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 3000))
            const s = await fetch(`/api/video/status/${jobId}`)
            if (!s.ok) continue
            job = await s.json()
            onToolRunning(true, `Video · ${job.message ?? 'working…'} ${job.progress ?? 0}%`)
            if (job.status === 'done' || job.status === 'error') break
          }
          if (job.status === 'error') throw new Error(job.error || 'Video rendering failed.')
          result = {
            content: `Here's the video I created for: "${prompt}"`,
            attachments: [{
              type: 'image', // reuse image attachment for video preview
              url: job.url,
              title: `Video: ${prompt.slice(0, 60)}`,
            }],
          }
          break
        }
        case 'code': {
          const res = await fetch('/api/code/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: detectLanguage(prompt),
              code: prompt,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Code execution failed.')
          const r = data.result
          result = {
            content: `I ran your ${r.language} code in the sandbox:`,
            attachments: [{
              type: 'code',
              language: r.language,
              stdout: r.stdout,
              stderr: r.stderr,
              exitCode: r.exitCode,
            }],
          }
          break
        }
        case 'vision': {
          if (!pendingFile) throw new Error('Please attach an image first.')
          const res = await fetch('/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: pendingFile.dataUrl, prompt }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Vision analysis failed.')
          result = {
            content: data.analysis,
            attachments: [],
          }
          break
        }
        case 'upload':
        case 'documents': {
          if (!pendingFile) throw new Error('Please attach a file first.')
          // Step 1: upload + parse
          const upRes = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: pendingFile.dataUrl,
              filename: pendingFile.name,
              format: detectFormat(pendingFile.name),
            }),
          })
          const upData = await upRes.json()
          if (!upRes.ok) throw new Error(upData.error || 'Upload failed.')
          const doc = upData.document
          // Step 2: if user has a question, ask it
          if (prompt.trim()) {
            const qRes = await fetch(`/api/documents?id=${encodeURIComponent(doc.id)}&q=${encodeURIComponent(prompt)}`)
            const qData = await qRes.json()
            if (!qRes.ok) throw new Error(qData.error || 'Document query failed.')
            result = {
              content: qData.answer || 'Document processed.',
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
          // Use the existing search route
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: prompt }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Search failed.')
          const results = (data.results || []).slice(0, 6).map((r: any) => ({
            title: r.title || r.name || 'Untitled',
            url: r.url || r.link || '#',
            snippet: r.snippet || r.description || '',
          }))
          result = {
            content: `Here's what I found on the web for: "${prompt}"`,
            attachments: results.length > 0 ? [{ type: 'search', results }] : [],
          }
          break
        }
        case 'office': {
          // Plan first
          const planRes = await fetch('/api/office/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          })
          const planData = await planRes.json()
          if (!planRes.ok) throw new Error(planData.error || 'Planning failed.')
          // Then create
          const createRes = await fetch('/api/office/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, plan: planData.plan }),
          })
          const createData = await createRes.json()
          if (!createRes.ok) throw new Error(createData.error || 'Document creation failed.')
          const a = createData.attachment
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
        default:
          // agent, connectors, email — fall back to plain chat routing
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
