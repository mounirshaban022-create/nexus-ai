/**
 * SSRF guard — blocks requests to private/internal networks.
 * Shared by the connector registry and the free web-access layer
 * (kept in its own module to avoid a circular import between them).
 */
export function assertPublicUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('Only http(s) URLs are allowed')
  }
  const host = parsed.hostname.toLowerCase()
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?fc00:/,
    /^\[?fe80:/,
    /^\[?fd/i,
    /\.internal$/i,
    /\.local$/i,
  ]
  if (privatePatterns.some((re) => re.test(host))) {
    throw new Error('Requests to internal/private addresses are blocked')
  }
  return parsed
}
