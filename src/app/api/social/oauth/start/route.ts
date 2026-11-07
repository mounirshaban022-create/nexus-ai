import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedSession, signOAuthState } from '@/lib/auth'
import { SOCIAL_PLATFORMS, isSocialPlatform, SocialPlatform } from '@/lib/social'

export const maxDuration = 30

/* ------------------------------------------------------------------ */
/* GET /api/social/oauth/start?platform=instagram                      */
/*                                                                     */
/* The ZERO-KNOWLEDGE go-live handshake, step 1. The user taps         */
/* "Continue with {platform}" and this route hands back the platform's */
/* own consent-screen URL. The user signs in on the platform's page —  */
/* the ONLY screen they ever see — and the callback finishes the rest. */
/* No tokens are ever shown, copied or pasted by the user.             */
/*                                                                     */
/* Server-side configuration (deployment settings, NOT the user):      */
/*   instagram / facebook → META_APP_ID + META_APP_SECRET              */
/*   linkedin             → LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET*/
/*   x                    → X_CLIENT_ID + X_CLIENT_SECRET              */
/* When a platform is not configured the route answers                  */
/* { available: false } and the UI shows a calm, human explanation.    */
/* ------------------------------------------------------------------ */

interface OAuthConfig {
  authorize: string
  scopes: string[]
  scopeSeparator: ',' | ' '
  envId: string
  envSecret: string
}

const CONFIG: Record<SocialPlatform, OAuthConfig> = {
  instagram: {
    authorize: 'https://www.facebook.com/v21.0/dialog/oauth',
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'],
    scopeSeparator: ',',
    envId: 'META_APP_ID',
    envSecret: 'META_APP_SECRET',
  },
  facebook: {
    authorize: 'https://www.facebook.com/v21.0/dialog/oauth',
    scopes: ['pages_manage_posts', 'pages_show_list', 'pages_read_engagement'],
    scopeSeparator: ',',
    envId: 'META_APP_ID',
    envSecret: 'META_APP_SECRET',
  },
  linkedin: {
    authorize: 'https://www.linkedin.com/oauth/v2/authorization',
    scopes: ['openid', 'profile', 'w_member_social'],
    scopeSeparator: ' ',
    envId: 'LINKEDIN_CLIENT_ID',
    envSecret: 'LINKEDIN_CLIENT_SECRET',
  },
  x: {
    authorize: 'https://x.com/i/oauth2/authorize',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    scopeSeparator: ' ',
    envId: 'X_CLIENT_ID',
    envSecret: 'X_CLIENT_SECRET',
  },
}

function resolveOrigin(req: NextRequest): string {
  // Behind proxies (Vercel, the sandbox gateway) the forwarded host is the
  // public origin — prefer it over the internal nextUrl origin.
  const proto = req.headers.get('x-forwarded-proto')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (proto && host) return `${proto.split(',')[0].trim()}://${host}`
  return req.nextUrl.origin
}

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req)
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const platform = new URL(req.url).searchParams.get('platform') ?? ''
  if (!isSocialPlatform(platform)) {
    return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 })
  }

  const cfg = CONFIG[platform]
  const clientId = process.env[cfg.envId]?.trim() ?? ''
  const clientSecret = process.env[cfg.envSecret]?.trim() ?? ''

  if (!clientId || !clientSecret) {
    // Calm, human answer — the user never needs to do anything here.
    return NextResponse.json({
      available: false,
      hint:
        `The official connection for ${SOCIAL_PLATFORMS[platform].label} isn't switched on for this deployment yet. ` +
        "That's a server-side switch — there is nothing for you to prepare. Your agent keeps rehearsing everything " +
        'meanwhile, and this button goes live the moment the connection is switched on.',
    })
  }

  const redirectUri = `${resolveOrigin(req)}/api/social/oauth/callback`
  const state = await signOAuthState({ userId: session.userId, platform })

  const url = new URL(cfg.authorize)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', cfg.scopes.join(cfg.scopeSeparator))

  // X requires PKCE (S256). The verifier rides inside the signed state so
  // the callback can complete the exchange without server-side storage.
  if (platform === 'x') {
    const { randomBytes, createHash } = await import('crypto')
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    const signed = await signOAuthState({ userId: session.userId, platform, verifier })
    url.searchParams.set('state', signed)
  }

  return NextResponse.json({ available: true, url: url.toString() })
}
