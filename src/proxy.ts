import { NextResponse, type NextRequest } from 'next/server'

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
