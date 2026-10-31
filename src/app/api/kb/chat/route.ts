import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { smartChat } from '@/lib/smart-chat'

export const maxDuration = 60

/**
 * KNOWLEDGE BASE — cited RAG answers.
 *
 * Retrieval: BM25-style term-overlap scoring over the user's chunks
 * (dependency-free, fast at this library scale). The top-k passages are
 * injected into a strict grounding prompt; the model must answer ONLY
 * from them and cite [n] markers that map back to document + snippet.
 */

const requestSchema = z.object({
  question: z.string().min(1).max(2000),
  docIds: z.array(z.string()).max(20).optional(),
})

const TOP_K = 6
const MAX_CHUNKS_SCANNED = 4000

interface ScoredChunk {
  docId: string
  filename: string
  title: string
  idx: number
  content: string
  score: number
}

/* ------------------------------ tokenization ----------------------------- */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
  'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
  'will', 'just', 'should', 'now', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'of',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'how', 'why', 'where', 'as', 'until', 'while',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06FF\u4e00-\u9FFF]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/* -------------------------------- retrieval ------------------------------ */

function bm25LiteScore(
  queryTerms: string[],
  chunkTokens: Map<string, number>,
  docFreq: Map<string, number>,
  totalChunks: number,
  chunkLen: number,
  avgLen: number
): number {
  const k1 = 1.4
  const b = 0.72
  let score = 0
  for (const term of queryTerms) {
    const tf = chunkTokens.get(term) ?? 0
    if (!tf) continue
    const df = docFreq.get(term) ?? 0
    const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5))
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (chunkLen / Math.max(avgLen, 1)))))
  }
  return score
}

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`kb-chat:${clientKey(req)}`, 30, 60_000)
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Rate limit reached. Retry in ${limit.retryAfterSeconds}s.` },
        { status: 429 }
      )
    }

    const parsed = requestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'A question is required (max 2000 chars).' }, { status: 400 })
    }
    const { question, docIds } = parsed.data

    const user = await getCurrentUser(req)
    const userId = user ? user.id : null

    // Scope: signed-in → own docs; guest → global docs.
    const scope = userId ? { userId } : { userId: null }
    const docFilter = docIds && docIds.length > 0 ? { ...scope, id: { in: docIds } } : scope

    const docs = await db.knowledgeDoc.findMany({
      where: docFilter,
      select: { id: true, filename: true, title: true, format: true },
    })

    if (docs.length === 0) {
      return NextResponse.json({
        answer: '',
        sources: [],
        note: 'Your knowledge base is empty. Upload a document first.',
        empty: true,
      })
    }

    const docMap = new Map(docs.map((d) => [d.id, d]))

    const chunks = await db.knowledgeChunk.findMany({
      where: { docId: { in: docs.map((d) => d.id) } },
      orderBy: [{ docId: 'asc' }, { idx: 'asc' }],
      take: MAX_CHUNKS_SCANNED,
      select: { docId: true, idx: true, content: true },
    })

    // Index chunks
    const queryTerms = Array.from(new Set(tokenize(question)))
    const chunkTokens: Map<string, number>[] = []
    const docFreq = new Map<string, number>()
    let totalLen = 0

    for (const chunk of chunks) {
      const tokens = tokenize(chunk.content)
      const freq = new Map<string, number>()
      for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
      chunkTokens.push(freq)
      totalLen += tokens.length
      for (const term of new Set(tokens)) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
      }
    }
    const avgLen = chunks.length > 0 ? totalLen / chunks.length : 1

    const scored: ScoredChunk[] = chunks.map((chunk, i) => ({
      docId: chunk.docId,
      filename: docMap.get(chunk.docId)?.filename ?? 'document',
      title: docMap.get(chunk.docId)?.title ?? 'Document',
      idx: chunk.idx,
      content: chunk.content,
      score: bm25LiteScore(queryTerms, chunkTokens[i], docFreq, chunks.length, chunkTokens[i].size, avgLen),
    }))

    const top = scored
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)

    if (top.length === 0) {
      return NextResponse.json({
        answer: '',
        sources: [],
        note: 'No passage in your knowledge base matches this question. Try rephrasing or upload a relevant document.',
        empty: true,
      })
    }

    // Build the grounded prompt with numbered passages
    const context = top
      .map((c, i) => `[${i + 1}] (from "${c.filename}", chunk ${c.idx + 1})\n${c.content}`)
      .join('\n\n---\n\n')

    const answer = await smartChat(
      [
        {
          role: 'assistant',
          content:
            'You are a precise knowledge-base assistant. Answer the user\'s question using ONLY the provided passages. ' +
            'Rules: (1) Cite every claim with bracket numbers matching the passage, e.g. [1] or [2][3]. ' +
            '(2) If the passages do not contain the answer, say exactly what is missing instead of guessing. ' +
            '(3) Be concise and factual; use Markdown formatting (short paragraphs or bullets). ' +
            '(4) Do not invent facts, numbers or names that are not in the passages.',
        },
        {
          role: 'user',
          content: `Passages from my knowledge base:\n\n${context}\n\nQuestion: ${question}`,
        },
      ],
      { maxTokens: 1200, temperature: 0.3, task: 'documents' }
    )

    return NextResponse.json({
      answer: answer.trim(),
      sources: top.map((c, i) => ({
        n: i + 1,
        docId: c.docId,
        filename: c.filename,
        title: c.title,
        chunk: c.idx + 1,
        snippet: c.content.slice(0, 280),
        score: Number(c.score.toFixed(2)),
      })),
    })
  } catch (error) {
    console.error('[api/kb/chat] POST error:', error)
    const message = error instanceof Error ? error.message : 'Knowledge chat failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
