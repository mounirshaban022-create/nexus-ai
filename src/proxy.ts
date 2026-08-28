import { NextResponse, type NextRequest } from 'next/server'

/**
 * CSRF mitigation: state-changing requests (POST/PUT/PATCH/DELETE) must come
 * from a same-origin context. Browsers always attach an Origin header on
 * cross-site POSTs — an attacker site can no longer ride the victim's
 * SameSite=None session cookie (which must stay None: the app is built to be
 * embedded in a cross-origin iframe, see the NOTE below).
 *
 * Why this is safe for the iframe preview: when the app's own frontend runs
 * inside the iframe, its fetch() Origin header equals the app's own origin —
 * never the parent page's — so same-origin checks still pass while embedded.
 *
 * Escape hatch: set NEXUS_DISABLE_ORIGIN_CHECK=1 to skip (not recommended),
 * or NEXUS_ALLOWED_ORIGINS="https://a.example,https://b.example" to allow
 * trusted cross-origin callers (host:port match, scheme-insensitive).
 *
 * Requests without an Origin header (curl, Meta/WhatsApp webhook callbacks,
 * server-side self-calls) are not browser-forged CSRF and pass through.
 */
function csrfGuard(request: NextRequest): NextResponse | null {
  if (process.env.NEXUS_DISABLE_ORIGIN_CHECK === '1') return null
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null

  const origin = request.headers.get('origin')
  if (!origin) return null // non-browser client — CSRF cookies don't apply

  let originHost = ''
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return block(request)
  }

  const requestHost = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    ''
  ).toLowerCase()
  // Host header missing (shouldn't happen per HTTP spec) — cannot verify.
  if (!requestHost) return null
  // Same host, any scheme (http/https proxy-termination mismatches are fine).
  if (originHost === requestHost) return null

  const extra = (process.env.NEXUS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (extra.includes(originHost)) return null

  return block(request)
}

function block(request: NextRequest): NextResponse {
  console.warn(
    `[proxy] CSRF origin check rejected ${request.method} ${request.nextUrl.pathname} ` +
      `(Origin: ${request.headers.get('origin') ?? 'none'})`
  )
  return NextResponse.json(
    { error: 'Cross-origin request blocked. If this is a trusted integration, add its origin to NEXUS_ALLOWED_ORIGINS.' },
    { status: 403 }
  )
}

/**
 * Security headers middleware.
 * - Clickjacking protection, MIME sniffing protection, referrer privacy,
 *   permission lock-down (microphone allowed for the Voice Studio only).
 *
 * NOTE: no X-Frame-Options header. The sandbox preview panel embeds this app
 * in a cross-origin iframe — X-Frame-Options: DENY made the browser refuse
 * to render the app inside the preview (blank frame). The app is built to be
 * embedded (iframe-safe session cookies in src/lib/auth.ts), so embedding
 * must stay allowed.
 */
export function proxy(request: NextRequest) {
  const csrf = csrfGuard(request)
  if (csrf) return csrf

  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=(self), payment=()'
  )
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|nexus-logo.png).*)'],
}
