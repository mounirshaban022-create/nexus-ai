'use client'

import { useCallback, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Code2,
  Loader2,
  Play,
  Sparkles,
  Terminal,
  Wand2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from './markdown'
import { useToast } from '@/hooks/use-toast'

type Lang = 'javascript' | 'typescript' | 'python'

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  language: string
}

const EXAMPLES: Record<Lang, string> = {
  javascript: `// Welcome to the NEXUS Code Sandbox — real execution!
const fib = (n) => (n <= 1 ? n : fib(n - 1) + fib(n - 2));

const sequence = Array.from({ length: 12 }, (_, i) => fib(i));
console.log("Fibonacci:", sequence.join(", "));

// Fetch is available too (network enabled)
console.log("\\nEdit this code and press Run ▶");`,
  typescript: `// TypeScript runs on Bun — types and all!
interface User { name: string; score: number }

const users: User[] = [
  { name: "Aisha", score: 94 },
  { name: "Omar", score: 87 },
  { name: "Lina", score: 99 },
];

const ranked = [...users].sort((a, b) => b.score - a.score);
ranked.forEach((u, i) => console.log(\`\${i + 1}. \${u.name} — \${u.score}\`));

const avg = users.reduce((s, u) => s + u.score, 0) / users.length;
console.log("Average:", avg.toFixed(1));`,
  python: `# Python runs on real CPython 3 — with standard library
from datetime import datetime, timedelta

print("NEXUS Python sandbox —", datetime.now().strftime("%Y-%m-%d %H:%M"))

primes = []
n = 2
while len(primes) < 15:
    if all(n % p for p in primes if p * p <= n):
        primes.append(n)
    n += 1
print("First 15 primes:", primes)

# File I/O works in the isolated sandbox
with open("note.txt", "w") as f:
    f.write("sandbox works!")
print("Wrote note.txt ✓")`,
}

export function CodeMode() {
  const { toast } = useToast()
  const [language, setLanguage] = useState<Lang>('javascript')
  const [code, setCode] = useState(EXAMPLES.javascript)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  // AI assist
  const [assistLoading, setAssistLoading] = useState<string | null>(null)
  const [assistReply, setAssistReply] = useState('')
  const [genPrompt, setGenPrompt] = useState('')

  const run = useCallback(async () => {
    if (!code.trim() || running) return
    setRunning(true)
    setResult(null)
    setAssistReply('')
    try {
      const res = await fetch('/api/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Execution failed.')
      setResult(data.result)
    } catch (error) {
      toast({
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRunning(false)
    }
  }, [code, language, running, toast])

  const assist = useCallback(
    async (action: 'explain' | 'fix' | 'improve' | 'generate') => {
      if (assistLoading) return
      if (action === 'generate' && !genPrompt.trim()) {
        toast({ title: 'Describe what to generate first.' })
        return
      }
      setAssistLoading(action)
      setAssistReply('')
      try {
        const res = await fetch('/api/code/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, language, code, prompt: genPrompt }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'AI assist failed.')
        setAssistReply(data.reply)

        // For fix/improve/generate: offer to apply the returned code
        if (action !== 'explain') {
          const match = data.reply.match(/```(?:javascript|typescript|python|js|ts|py)?\n([\s\S]*?)```/)
          if (match?.[1]) {
            setCode(match[1].trim())
            toast({ title: 'Code applied to editor ✨' })
          }
        }
      } catch (error) {
        toast({
          title: 'AI assist failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setAssistLoading(null)
      }
    },
    [assistLoading, language, code, genPrompt, toast]
  )

  const extensions =
    language === 'python' ? [python()] : [javascript({ typescript: language === 'typescript' })]

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Code2 className="h-5 w-5 text-primary" aria-hidden /> Code Studio
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Write code with AI help and run it in a real sandbox — JavaScript, TypeScript &amp;
              Python, live output.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-secondary/50 p-1" role="group" aria-label="Language">
            {(['javascript', 'typescript', 'python'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLanguage(l)
                  setCode(EXAMPLES[l])
                  setResult(null)
                  setAssistReply('')
                }}
                aria-pressed={language === l}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition ${
                  language === l ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {l === 'javascript' ? 'JavaScript' : l === 'typescript' ? 'TypeScript' : 'Python'}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Editor */}
          <div className="overflow-hidden rounded-2xl border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 bg-secondary/30 px-4 py-2">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                {language === 'python' ? 'main.py' : `main.${language === 'typescript' ? 'ts' : 'js'}`}
              </span>
              <Button
                onClick={run}
                disabled={!code.trim() || running}
                size="sm"
                className="h-7 gap-1.5 rounded-full bg-primary px-4 text-[11px] text-primary-foreground hover:brightness-110 disabled:opacity-40"
              >
                {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                {running ? 'Running…' : 'Run'}
              </Button>
            </div>
            <CodeMirror
              value={code}
              onChange={setCode}
              extensions={extensions}
              theme={oneDark}
              height="420px"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
                autocompletion: true,
              }}
              aria-label="Code editor"
            />
          </div>

          {/* Output */}
          <div className="flex flex-col gap-4">
            <div className="min-h-[200px] flex-1 overflow-hidden rounded-2xl border border-border/60">
              <div className="flex items-center justify-between border-b border-border/60 bg-secondary/30 px-4 py-2">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" aria-hidden /> Output
                </span>
                {result && (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-medium ${
                      result.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {result.exitCode === 0 ? (
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                    ) : (
                      <XCircle className="h-3 w-3" aria-hidden />
                    )}
                    exit {result.exitCode ?? 'killed'} · {result.durationMs}ms
                  </span>
                )}
              </div>
              <pre className="omni-scroll h-[360px] overflow-auto bg-[oklch(0.2_0.005_70)] p-4 text-[12.5px] leading-relaxed">
                {running ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing in sandbox…
                  </span>
                ) : result ? (
                  <>
                    {result.stdout && <span className="text-foreground/90">{result.stdout}</span>}
                    {result.stderr && (
                      <span className="whitespace-pre-wrap text-red-400">{result.stderr}</span>
                    )}
                    {!result.stdout && !result.stderr && (
                      <span className="text-muted-foreground">(no output)</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Press Run ▶ to execute — real process, real output.
                  </span>
                )}
              </pre>
            </div>
          </div>
        </div>

        {/* AI assist bar */}
        <section className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-4" aria-label="AI assistance">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> AI assist
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => assist('explain')}
                disabled={!!assistLoading || !code.trim()}
                className="h-8 rounded-full px-3.5 text-xs"
              >
                {assistLoading === 'explain' ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Explain
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => assist('fix')}
                disabled={!!assistLoading || !code.trim()}
                className="h-8 rounded-full px-3.5 text-xs"
              >
                {assistLoading === 'fix' ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Find bugs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => assist('improve')}
                disabled={!!assistLoading || !code.trim()}
                className="h-8 rounded-full px-3.5 text-xs"
              >
                {assistLoading === 'improve' ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Improve
              </Button>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Textarea
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="Or describe code to generate — e.g. 'a REST API client with retry logic'…"
              rows={1}
              className="min-h-10 resize-none rounded-full border-border/60 bg-background/60 px-4 py-2.5 text-sm focus-visible:ring-primary/40"
            />
            <Button
              onClick={() => assist('generate')}
              disabled={!!assistLoading || !genPrompt.trim()}
              className="h-10 shrink-0 gap-1.5 rounded-full bg-primary px-4 text-xs text-primary-foreground hover:brightness-110 disabled:opacity-40"
            >
              {assistLoading === 'generate' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          </div>

          {assistReply && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="omni-scroll mt-4 max-h-80 overflow-y-auto rounded-xl border border-border/50 bg-background/60 p-4"
            >
              <Markdown content={assistReply} />
            </motion.div>
          )}
        </section>
      </div>
    </div>
  )
}
