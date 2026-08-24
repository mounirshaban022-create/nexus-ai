/**
 * Shared SSE stream consumer for OpenAI-compatible /chat/completions
 * streaming responses — used by BOTH the built-in Z.ai engine and the
 * anonymous free-LLM fallback chain so they share identical semantics.
 *
 * DIRECTIVE-SAFE STREAMING (peek + trailing guard):
 *   The assistant's raw stream can contain TOOL_CALL / ARTIFACT_PATCH
 *   directives that must NEVER be shown to the user. Some models emit
 *   them at the very start; chattier models emit prose FIRST and the
 *   directive mid-stream. Both cases are handled:
 *
 *   1. TRAILING GUARD — while streaming, the last ~24 chars are held
 *      back. A directive that is still forming at the tail stays
 *      unemitted until we know whether it completes.
 *   2. DIRECTIVE DETECTION — the moment a complete directive token
 *      appears anywhere in the accumulated text, everything before it
 *      is flushed as visible prose and streaming switches to silent
 *      accumulation (the chat route parses the directive afterwards).
 *   3. END-OF-STREAM FLUSH — when the stream ends with no directive,
 *      the held-back tail is flushed (this also fixes short answers
 *      like "OK" that would otherwise never be emitted).
 */

export interface SseConsumeOptions {
  /** Chars held back while streaming to catch forming directives. */
  guardLen?: number
}

const DIRECTIVE_TOKENS = ['TOOL_CALL', 'ARTIFACT_PATCH']

/** Earliest index of a COMPLETE directive token in the text (-1 if none). */
function findDirective(text: string): number {
  let earliest = -1
  for (const token of DIRECTIVE_TOKENS) {
    const idx = text.indexOf(token)
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx
  }
  return earliest
}

export async function consumeSSEWithPeek(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: string) => void,
  opts: SseConsumeOptions = {}
): Promise<string> {
  const decoder = new TextDecoder()
  const GUARD_LEN = opts.guardLen ?? 24

  let buf = ''
  let fullContent = ''
  let emitted = 0
  let toolMode = false

  /** Emit the slice [emitted, upto) as a visible delta. */
  const emitUpTo = (upto: number) => {
    if (upto > emitted) {
      const chunk = fullContent.slice(emitted, upto)
      if (chunk) onDelta(chunk)
      emitted = upto
    }
  }

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

      if (toolMode) continue // silently accumulate

      // A complete directive token appeared anywhere → flush the prose
      // before it and switch to silent accumulation.
      const dirIdx = findDirective(fullContent)
      if (dirIdx >= 0) {
        emitUpTo(dirIdx)
        toolMode = true
        continue
      }

      // Hold back the trailing guard window so a directive that is still
      // forming at the tail can be caught before it becomes visible.
      emitUpTo(Math.max(0, fullContent.length - GUARD_LEN))
    }
  }

  // END-OF-STREAM: flush any held-back tail — unless a directive formed
  // inside the guard window (then leave it hidden; parseToolCall handles it).
  if (!toolMode) {
    const dirIdx = findDirective(fullContent)
    emitUpTo(dirIdx >= 0 ? dirIdx : fullContent.length)
  }

  return fullContent
}
