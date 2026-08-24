/**
 * Shared SSE stream consumer for OpenAI-compatible /chat/completions
 * streaming responses — used by BOTH the built-in Z.ai engine and the
 * anonymous free-LLM fallback chain so they share identical semantics.
 *
 * PEEK LOGIC — avoids showing a half-formed TOOL_CALL to the user:
 *   1. Buffer the first ~24 chars locally before emitting any delta.
 *   2. If the buffered text looks like a TOOL_CALL / ARTIFACT_PATCH
 *      directive, keep buffering silently until the stream ends (the
 *      caller parses the full content as a directive afterwards).
 *   3. Otherwise flush the peeked prefix as one delta, then emit each
 *      subsequent chunk as it arrives — the "feels fast" effect.
 *   4. END-OF-STREAM FLUSH: if the whole answer is shorter than the
 *      peek window (e.g. "OK"), it would previously never be emitted
 *      and the user saw an empty bubble. We now flush it as a single
 *      delta when the stream ends in peeking mode.
 */

export interface SseConsumeOptions {
  /** Number of chars to buffer before deciding stream-vs-tool. */
  peekLen?: number
}

export async function consumeSSEWithPeek(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: string) => void,
  opts: SseConsumeOptions = {}
): Promise<string> {
  const decoder = new TextDecoder()
  let buf = ''
  let fullContent = ''
  let mode: 'peeking' | 'streaming' | 'tool' = 'peeking'
  const PEEK_LEN = opts.peekLen ?? 24

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    // SSE: lines starting with "data:"
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let deltaText = ''
      try {
        const json = JSON.parse(data)
        deltaText = json?.choices?.[0]?.delta?.content ?? ''
      } catch {
        // Some providers send plain-text chunks; treat the line itself as delta
        if (data && !data.startsWith('{')) deltaText = data
      }
      if (!deltaText) continue
      fullContent += deltaText

      if (mode === 'peeking') {
        // Check if this looks like a tool-call OR artifact-patch forming
        if (
          fullContent.startsWith('TOOL_CALL') ||
          fullContent.includes('TOOL_CALL') ||
          fullContent.startsWith('ARTIFACT_PATCH') ||
          fullContent.includes('ARTIFACT_PATCH')
        ) {
          mode = 'tool'
          // Don't emit deltas — wait for the full content to parse as a directive
        } else if (fullContent.length >= PEEK_LEN) {
          // Safe to assume this is a final answer — flush the peeked prefix
          mode = 'streaming'
          onDelta(fullContent)
        }
        // else: keep peeking
      } else if (mode === 'streaming') {
        // Emit just the new chunk (prefix already flushed)
        onDelta(deltaText)
      }
      // mode === 'tool': silently accumulate
    }
  }

  // END-OF-STREAM FLUSH (bug fix): a complete answer shorter than the
  // peek window (e.g. "OK", "Yes", "42") previously left the bubble
  // empty forever. If we're still peeking and the content is not a
  // directive, flush everything as one final delta.
  if (mode === 'peeking' && fullContent.trim()) {
    onDelta(fullContent)
  }

  return fullContent
}
