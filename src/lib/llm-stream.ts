/**
 * Shared SSE stream consumer for OpenAI-compatible /chat/completions
 * streaming responses — used by the built-in Z.ai engine, user-connected
 * providers and the anonymous free-LLM fallback chain so they all share
 * identical semantics.
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

/**
 * Reusable directive-safe delta guard. Feed every raw model delta through
 * `push()`; the safe visible prose comes out through `onDelta`. Call
 * `end()` when the model finishes. Mirrors the semantics documented above.
 */
export class DirectiveGuard {
  private fullContent = ''
  private emitted = 0
  private toolMode = false
  private readonly guardLen: number

  constructor(
    private readonly onDelta: (delta: string) => void,
    opts: { guardLen?: number } = {}
  ) {
    this.guardLen = opts.guardLen ?? 24
  }

  /** Feed one raw model delta. Visible prose is emitted as it becomes safe. */
  push(deltaText: string): void {
    if (!deltaText) return
    this.fullContent += deltaText

    if (this.toolMode) return // silently accumulate

    // A complete directive token appeared anywhere → flush the prose
    // before it and switch to silent accumulation.
    const dirIdx = findDirective(this.fullContent)
    if (dirIdx >= 0) {
      this.emitUpTo(dirIdx)
      this.toolMode = true
      return
    }

    // Hold back the trailing guard window so a directive that is still
    // forming at the tail can be caught before it becomes visible.
    this.emitUpTo(Math.max(0, this.fullContent.length - this.guardLen))
  }

  /**
   * End of stream: flush any held-back tail — unless a directive formed
   * inside the guard window (then leave it hidden; parseToolCall handles
   * it downstream).
   */
  end(): void {
    if (!this.toolMode) {
      const dirIdx = findDirective(this.fullContent)
      this.emitUpTo(dirIdx >= 0 ? dirIdx : this.fullContent.length)
    }
  }

  /** The full accumulated raw content (directives included). */
  content(): string {
    return this.fullContent
  }

  private emitUpTo(upto: number): void {
    if (upto > this.emitted) {
      const chunk = this.fullContent.slice(this.emitted, upto)
      if (chunk) this.onDelta(chunk)
      this.emitted = upto
    }
  }
}

export async function consumeSSEWithPeek(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: string) => void,
  opts: SseConsumeOptions = {}
): Promise<string> {
  const decoder = new TextDecoder()
  const guard = new DirectiveGuard(onDelta, opts)

  let buf = ''

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
      guard.push(deltaText)
    }
  }

  guard.end()
  return guard.content()
}
