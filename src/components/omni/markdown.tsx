'use client'

import { memo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
// PrismAsync lazy-loads language grammars on demand — keeps the initial
// bundle small AND avoids re-tokenizing every language on each streaming
// token. (Was: `Prism` from 'react-syntax-highlighter' which bundles all
// grammars synchronously — ~500KB upfront and re-tokenizes per render.)
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from 'next-themes'
import { Check, Copy } from 'lucide-react'

// Memoized CodeBlock — during streaming, `Markdown` re-renders on every
// token. Without memo, every render re-tokenized the code block (expensive
// regex parse + DOM diff). With memo, CodeBlock only re-renders when its
// own `language` or `code` props actually change.
const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  /* Light-mode readability: the block used to hardcode the dark surface +
   * oneDark tokens in BOTH themes. Follow next-themes instead — dark keeps
   * the original look, light gets a warm-gray surface + oneLight tokens
   * (dark zinc-800-ish code text). Undefined (SSR/first paint) → dark. */
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }, [code])

  return (
    <div className="group/code relative">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border/60 bg-secondary/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {language || 'code'}
        </span>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden /> Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: isDark ? 'oklch(0.16 0.015 295)' : 'oklch(0.97 0.003 80)',
          padding: '0.85rem 1rem',
          fontSize: '0.8rem',
          borderRadius: '0 0 0.6rem 0.6rem',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
})

/**
 * Shared Markdown renderer with GFM support, syntax-highlighted code blocks
 * and one-click copy buttons.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="omni-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          code: (props) => {
            const { className, children } = props as {
              className?: string
              children?: React.ReactNode
            }
            const match = /language-(\w+)/.exec(className || '')
            const codeText = String(children ?? '').replace(/\n$/, '')
            if (!match && !codeText.includes('\n')) {
              return <code className={className}>{children}</code>
            }
            return <CodeBlock language={match?.[1] ?? 'text'} code={codeText} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
