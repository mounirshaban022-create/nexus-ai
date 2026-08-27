/**
 * SSRF guard — blocks requests to private/internal networks.
 * Shared by the connector registry and the free web-access layer
 * (kept in its own module to avoid a circular import between them).
 *
 * Hostname-string based (no DNS resolution — OK for now). Note that the
 * WHATWG URL parser has already normalized most obfuscated IPv4 spellings
 * (hex `0x7f000001`, decimal `2130706433`, octal `0177.0.0.1`, short
 * `127.1`) to dotted-decimal before we inspect `hostname`, and IPv6
 * literals keep their square brackets. The explicit checks below are
 * defense-in-depth for parsers/callers that don't normalize.
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

  // IPv6 literals always contain ':' (and keep their brackets in
  // URL.hostname); domains never do — so these checks can't false-positive
  // on domain names like `fdroid.org`.
  if (host.includes(':')) {
    const v6 = host.replace(/^\[|\]$/g, '')
    const blockedV6 = [
      /^::$/, // unspecified address (0.0.0.0 equivalent)
      /^::1$/, // loopback
      /^::ffff:/, // IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 / ::ffff:7f00:1)
      /^f[cd]/, // fc00::/7 unique-local (covers fc… and fd… prefixes)
      /^fe[89ab]/, // fe80::/10 link-local
      /^2002:/, // 6to4 (embeds an arbitrary IPv4 address)
      /^64:ff9b::/, // NAT64 (embeds an IPv4 address)
    ]
    if (blockedV6.some((re) => re.test(v6))) {
      throw new Error('Requests to internal/private addresses are blocked')
    }
    return parsed
  }

  const privatePatterns = [
    /^localhost$|\.localhost$/i, // localhost + its subdomains (resolve to loopback)
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./, // includes 0.0.0.0
    /\.internal$/i,
    /\.local$/i,
  ]
  if (privatePatterns.some((re) => re.test(host))) {
    throw new Error('Requests to internal/private addresses are blocked')
  }

  // Defense in depth: obfuscated IPv4 spellings that a lenient parser
  // might pass through as "domains" — bare integers (`2130706433`),
  // hex (`0x7f000001`), octal (`0177.0.0.1`), or short forms (`127.1`).
  // No public site is ever addressed this way, so reject outright.
  if (isObfuscatedIpv4Literal(host)) {
    throw new Error('Requests to internal/private addresses are blocked')
  }

  return parsed
}

/**
 * True when the host is an all-numeric/hex token stream that is NOT a
 * plain dotted quad (those are screened by the privatePatterns above).
 * Examples caught: `2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`,
 * `0x7f.0.0.1`.
 */
function isObfuscatedIpv4Literal(host: string): boolean {
  const parts = host.split('.')
  if (parts.length < 1 || parts.length > 4) return false
  let sawNumeric = false
  for (const part of parts) {
    if (/^0x[0-9a-f]{1,8}$/i.test(part)) {
      sawNumeric = true
    } else if (/^[0-9]{1,10}$/.test(part)) {
      sawNumeric = true
    } else {
      return false // a real (non-numeric) domain label
    }
  }
  if (!sawNumeric) return false
  // A plain 4-part dotted-decimal is a normal IPv4 literal — already
  // handled by the privatePatterns above.
  if (parts.length === 4 && parts.every((p) => /^[0-9]{1,3}$/.test(p) && Number(p) <= 255)) {
    return false
  }
  return true
}
