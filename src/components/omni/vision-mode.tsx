'use client'

import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ScanEye, UploadCloud, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from './markdown'
import { useToast } from '@/hooks/use-toast'

const QUICK_QUESTIONS = [
  'Describe this image in detail',
  'Extract all text visible in this image',
  'What objects are in this picture? List them.',
  'Write a creative story inspired by this image',
]

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB

export function VisionMode() {
  const { toast } = useToast()
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [question, setQuestion] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Unsupported file', description: 'Please choose an image file.', variant: 'destructive' })
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        toast({ title: 'Image too large', description: 'Please use an image under 8MB.', variant: 'destructive' })
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        setImageData(reader.result as string)
        setImageName(file.name)
        setAnalysis('')
      }
      reader.onerror = () => toast({ title: 'Could not read that file.', variant: 'destructive' })
      reader.readAsDataURL(file)
    },
    [toast]
  )

  const analyze = useCallback(
    async (text?: string) => {
      if (!imageData || analyzing) return
      const q = (text ?? question).trim()
      setAnalyzing(true)
      setAnalysis('')
      try {
        const res = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData, prompt: q }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Vision analysis failed.')
        setAnalysis(data.analysis)
      } catch (error) {
        toast({
          title: 'Analysis failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setAnalyzing(false)
      }
    },
    [imageData, question, analyzing, toast]
  )

  return (
    <div className="omni-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <ScanEye className="h-5 w-5 text-emerald-600" aria-hidden /> Vision
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Show OMNI any image — it sees, understands, and answers.
          </p>
        </header>

        {/* Drop zone */}
        {!imageData ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload an image for analysis"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) readFile(file)
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center transition ${
              dragging
                ? 'border-emerald-400/70 bg-emerald-500/10'
                : 'border-border/70 bg-card/40 hover:border-emerald-500/40 hover:bg-emerald-500/5'
            }`}
          >
            <UploadCloud className="mb-4 h-10 w-10 text-emerald-600/70" aria-hidden />
            <p className="text-sm font-medium">Drop an image here, or click to browse</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              PNG, JPG, WebP, GIF · up to 8MB · never leaves your session
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) readFile(file)
                e.target.value = ''
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row">
            {/* Image preview */}
            <div className="lg:w-2/5">
              <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70">
                <img src={imageData} alt={imageName || 'Uploaded image'} className="max-h-80 w-full object-contain lg:max-h-96" />
                <button
                  onClick={() => {
                    setImageData(null)
                    setImageName('')
                    setAnalysis('')
                  }}
                  aria-label="Remove image"
                  className="absolute right-2.5 top-2.5 rounded-full bg-black/60 p-1.5 text-white/90 backdrop-blur transition hover:bg-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
                {imageName && (
                  <p className="truncate border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    {imageName}
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4">
                <label htmlFor="vision-question" className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Ask about this image
                </label>
                <Textarea
                  id="vision-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What breed is this dog? What is the weather like?"
                  rows={3}
                  className="mt-2 resize-none border-border/70 bg-background/60 focus-visible:ring-emerald-500/50"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setQuestion(q)
                        analyze(q)
                      }}
                      disabled={analyzing}
                      className="rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-border hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => analyze()}
                  disabled={analyzing}
                  className="mt-3 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  {analyzing ? 'Analyzing…' : 'Analyze image'}
                </Button>
              </div>
            </div>

            {/* Analysis output */}
            <div className="min-w-0 flex-1">
              <div className="min-h-[280px] rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
                {analyzing ? (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex items-center gap-1.5">
                      <span className="omni-dot h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span className="omni-dot h-2.5 w-2.5 rounded-full bg-teal-400" />
                      <span className="omni-dot h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    </div>
                    <p className="text-sm text-muted-foreground">OMNI is looking at your image…</p>
                  </div>
                ) : analysis ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <Markdown content={analysis} />
                  </motion.div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <ScanEye className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Ask a question (or use a quick prompt) and OMNI&apos;s answer will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
