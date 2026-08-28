/**
 * Local functional test for the new web-access chain.
 * Run: bun scripts/test-search-chain.ts
 */
import {
  smartWebSearch,
  readPageSmart,
  parseGeminiGrounding,
} from '../src/lib/web-access'

async function main() {
  console.log('=== 1. parseGeminiGrounding (synthetic fixture) ===')
  const fixture = {
    candidates: [
      {
        content: { parts: [{ text: 'Next.js 16 is the latest stable release. It ships Turbopack by default [1]. Vercel announced it in October [2].' }] },
        groundingMetadata: {
          webSearchQueries: ['latest stable Next.js version 2026'],
          groundingChunks: [
            { web: { uri: 'https://nextjs.org/blog', title: 'Next.js 16 announcement' } },
            { web: { uri: 'https://vercel.com/blog/next-16', title: 'Vercel: Next.js 16' } },
          ],
          groundingSupports: [
            { segment: { text: 'Next.js 16 is the latest stable release.' }, groundingChunkIndices: [0] },
            { segment: { text: 'Vercel announced it in October.' }, groundingChunkIndices: [1] },
          ],
        },
      },
    ],
  }
  const parsed = parseGeminiGrounding(fixture, 8)
  console.log('answer:', parsed.answer.slice(0, 60), '…')
  console.log('queries:', parsed.queries)
  console.log('results:', parsed.results.length)
  for (const r of parsed.results) console.log('  -', r.title, '|', r.host_name, '| snippet:', r.snippet.slice(0, 45))
  if (parsed.results.length !== 2 || !parsed.results[0].snippet) {
    throw new Error('PARSER FAILED — chunk/snippet mapping wrong')
  }
  console.log('PARSER OK\n')

  console.log('=== 2. smartWebSearch (live chain) ===')
  const t0 = Date.now()
  const smart = await smartWebSearch('latest stable Next.js version', 6)
  console.log(`engine=${smart.engine} results=${smart.results.length} answer=${smart.answer ? smart.answer.slice(0, 80) + '…' : '(none)'} (${Date.now() - t0}ms)`)
  for (const r of smart.results.slice(0, 3)) console.log('  -', r.title.slice(0, 60), '|', r.url.slice(0, 60))
  if (smart.results.length === 0) throw new Error('CHAIN FAILED — zero results')

  console.log('\n=== 3. readPageSmart (direct path) ===')
  const page1 = await readPageSmart('https://en.wikipedia.org/wiki/Next.js')
  console.log(`engine=${page1.engine} title=${page1.title.slice(0, 50)} textLen=${page1.text.length}`)
  if (!page1.text || page1.text.length < 200) throw new Error('direct reader failed')

  console.log('\n=== 4. readPageSmart (JS-heavy page → Jina fallback) ===')
  try {
    const page2 = await readPageSmart('https://www.reddit.com/r/nextjs/')
    console.log(`engine=${page2.engine} title=${page2.title.slice(0, 50)} textLen=${page2.text.length}`)
  } catch (e) {
    console.log('JS-heavy test skipped:', e instanceof Error ? e.message : e)
  }

  console.log('\nALL TESTS DONE')
}

main().catch((e) => {
  console.error('TEST FAILED:', e)
  process.exit(1)
})
