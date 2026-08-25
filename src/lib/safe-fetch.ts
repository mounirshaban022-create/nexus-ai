/**
 * Safe JSON fetch — never throws "Unexpected token '<'".
 *
 * The #1 cause of "Unexpected token '<', "<html> <h"... is not valid JSON"
 * is a frontend calling `await res.json()` on a response that is actually
 * an HTML error page (gateway 502/504, dev-server recompile page, route
 * module-load error, or a 404 page). This helper detects that case and
 * returns a clean, human-friendly error instead.
 *
 * Usage:
 *   const { ok, status, data, error } = await safeJsonFetch('/api/image', { ... })
 *   if (!ok) throw new Error(error)
 */

export interface SafeJsonResult<T = any> {
  ok: boolean
  status: number
  data: T | null
  /** Always a human-friendly string when !ok */
  error: string | null
  /** The raw response object, in case the caller needs headers etc. */
  response: Response
}

/** Human-friendly mapping for common HTTP status codes on AI endpoints. */
function statusToMessage(status: number, fallback: string): string {
  if (status === 502 || status === 504) {
    return 'The AI service took too long to respond. Please try again in a moment.'
  }
  if (status === 503) {
    return 'The service is temporarily unavailable. Please try again shortly.'
  }
  if (status === 429) {
    return 'You are doing that a bit too fast. Please wait a moment and try again.'
  }
  if (status === 404) {
    return 'This feature is not available right now. Please refresh the page and try again.'
  }
  if (status >= 500) {
    return fallback || 'The server had a problem handling that. Please try again.'
  }
  return fallback
}

export async function safeJsonFetch<T = any>(
  input: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; label?: string }
): Promise<SafeJsonResult<T>> {
  const label = options?.label ?? 'request'
  const timeoutMs = options?.timeoutMs ?? 180_000 // 3 min default — image gen can take 90s

  // Client-side abort timeout. fetch() itself has no default timeout, so
  // without this a hung request can stall the UI forever.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // If the caller passed their own signal, respect it too.
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort())
  }

  let res: Response
  try {
    res = await fetch(input, { ...init, signal: controller.signal })
  } catch (err: any) {
    clearTimeout(timer)
    const msg = err?.name === 'AbortError'
      ? `${label} timed out. The AI may be busy — please try again.`
      : err?.message?.includes('Failed to fetch')
        ? 'Network error — please check your connection and try again.'
        : (err?.message || `Network error during ${label}.`)
    return { ok: false, status: 0, data: null, error: msg, response: null as any }
  }
  clearTimeout(timer)

  // Inspect content-type BEFORE trying to parse JSON.
  const contentType = res.headers.get('content-type') ?? ''

  // Read the body as text once — we'll decide what to do with it.
  let rawText = ''
  try {
    rawText = await res.text()
  } catch {
    rawText = ''
  }

  // Case 1: HTML response (error page from gateway / dev server / 404).
  const looksLikeHtml =
    contentType.includes('text/html') ||
    /^\s*<(?:!doctype|html|head|body|h1|pre|title)\b/i.test(rawText)

  if (looksLikeHtml) {
    const friendly = statusToMessage(
      res.status,
      `${label} failed (the server returned an error page instead of data).`
    )
    return { ok: false, status: res.status, data: null, error: friendly, response: res }
  }

  // Case 2: Empty body.
  if (!rawText.trim()) {
    if (res.ok) {
      return { ok: true, status: res.status, data: {} as T, error: null, response: res }
    }
    return {
      ok: false,
      status: res.status,
      data: null,
      error: statusToMessage(res.status, `${label} failed with no response.`),
      response: res,
    }
  }

  // Case 3: Try to parse as JSON.
  let data: T
  try {
    data = JSON.parse(rawText)
  } catch {
    // Not JSON and not HTML — still a malformed response.
    const friendly = statusToMessage(
      res.status,
      `${label} returned an unexpected format. Please try again.`
    )
    return { ok: false, status: res.status, data: null, error: friendly, response: res }
  }

  // Case 4: Valid JSON. Surface server-provided error messages.
  if (!res.ok) {
    const serverError =
      (data as any)?.error ||
      (data as any)?.message ||
      statusToMessage(res.status, `${label} failed.`)
    return { ok: false, status: res.status, data: null, error: serverError, response: res }
  }

  return { ok: true, status: res.status, data, error: null, response: res }
}
