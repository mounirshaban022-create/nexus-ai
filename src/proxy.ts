import { NextResponse, type NextRequest } from 'next/server'

/**
 * Security headers middleware.
 * - Clickjacking protection, MIME sniffing protection, referrer privacy,
 *   permission lock-down (microphone allowed for the Voice Studio only).
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
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
