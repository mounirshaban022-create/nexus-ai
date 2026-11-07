import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyOAuthState } from '@/lib/auth'
import { encryptSecret } from '@/lib/email'
import { SOCIAL_PLATFORMS, isSocialPlatform, logActivity } from '@/lib/social'

export const maxDuration = 60

/* ------------------------------------------------------------------ */
/* GET /api/social/oauth/callback  — the ZERO-KNOWLEDGE handshake,     */
/* step 2 (the user never reads this code, they just see "Connected"). */
/*                                                                     */
/* The platform redirects here with ?code&state after the user signed  */
/* in on THE PLATFORM'S OWN PAGE. We then, server-side:                */
/*   1. verify the signed state (who + which platform, 10-min window)  */
/*   2. exchange the code for a real access token                      */
/*   3. fetch the profile (handle / page / IG business account)        */
/*   4. store the token AES-256-GCM encrypted, mark the account LIVE   */
/*   5. answer with a tiny page that tells the app "done" and closes   */
/*                                                                     */
/* The user sees one screen: a green check and the window closing.     */
/* ------------------------------------------------------------------ */

const TIMEOUT = 15_000

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      typeof json.error === 'object' && json.error !== null && 'message' in json.error
        ? String((json.error as { message: unknown }).message)
        : res.statusText || 'The platform rejected the connection.'
    throw new Error(msg)
  }
  return json
}

/* ------------------------------ Meta ------------------------------ */

async function finishMeta(code: string, redirectUri: string, clientSecret: string, clientId: string, platform: 'instagram' | 'facebook') {
  const GRAPH = 'https://graph.facebook.com/v21.0'
  const short = (await fetchJson(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}`,
  )) as { access_token?: string }
  if (!short.access_token) throw new Error('No access token returned.')

  // Long-lived user token (60 days) — refreshed on future visits.
  const long = (await fetchJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(short.access_token)}`,
  )) as { access_token?: string }
  const token = long.access_token ?? short.access_token

  const pages = (await fetchJson(
    `${GRAPH}/me/accounts?fields=id,name,username,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`,
  )) as { data?: Array<{ id: string; name?: string; username?: string; access_token?: string; instagram_business_account?: { id: string; username?: string } }> }

  const list = pages.data ?? []
  if (list.length === 0) throw new Error('No Facebook Page was found on this account. Connect a page (free) and try again.')

  if (platform === 'instagram') {
    const withIg = list.find((p) => p.instagram_business_account?.id)
    if (!withIg?.instagram_business_account) {
      throw new Error('No Instagram professional account is linked to your page yet. Switch your Instagram to a free Creator account and link it to your page.')
    }
    const ig = withIg.instagram_business_account
    return {
      externalId: ig.id,
      handle: ig.username ? `@${ig.username}` : withIg.name ?? '',
      displayName: ig.username ? `@${ig.username}` : withIg.name ?? 'Instagram',
      token: withIg.access_token ?? token, // page token publishes to IG Graph
      avatarUrl: '',
    }
  }

  const page = list[0]
  return {
    externalId: page.id,
    handle: page.username ? `@${page.username}` : page.name ?? '',
    displayName: page.name ?? 'Facebook Page',
    token: page.access_token ?? token,
    avatarUrl: '',
  }
}

/* ----------------------------- LinkedIn ---------------------------- */

async function finishLinkedIn(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const tokenRes = (await fetchJson('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })) as { access_token?: string }
  if (!tokenRes.access_token) throw new Error('No access token returned.')

  const me = (await fetchJson('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` },
  })) as { sub?: string; name?: string; email?: string }
  if (!me.sub) throw new Error('Could not read the LinkedIn profile.')

  return {
    externalId: `urn:li:person:${me.sub}`,
    handle: me.name ?? '',
    displayName: me.name ?? 'LinkedIn',
    token: tokenRes.access_token,
    avatarUrl: '',
  }
}

/* -------------------------------- X -------------------------------- */

async function finishX(code: string, redirectUri: string, clientId: string, clientSecret: string, verifier: string) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  const tokenRes = (await fetchJson('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body,
  })) as { access_token?: string }
  if (!tokenRes.access_token) throw new Error('No access token returned.')

  const me = (await fetchJson('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` },
  })) as { data?: { username?: string; name?: string } }
  const user = me.data
  if (!user?.username) throw new Error('Could not read the X profile.')

  return {
    externalId: user.username,
    handle: `@${user.username}`,
    displayName: user.name ?? `@${user.username}`,
    token: tokenRes.access_token,
    avatarUrl: '',
  }
}

/* ---------------------------- HTML answer --------------------------- */

function resultPage(ok: boolean, platformLabel: string, message: string): NextResponse {
  const safeLabel = platformLabel.replace(/[<>&"]/g, '')
  const safeMessage = message.replace(/[<>&"]/g, '')
  const title = ok ? 'Connected ✓' : 'Not connected'
  const color = ok ? '#10b981' : '#f59e0b'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · NEXUS</title>
<style>
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:#0b0b0d; color:#fafafa;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { text-align:center; padding:2.5rem 2rem; }
  .dot { width:56px; height:56px; margin:0 auto 1.25rem; border-radius:9999px; display:grid; place-items:center;
         background:${color}22; border:1px solid ${color}55; font-size:1.6rem; }
  h1 { font-size:1.15rem; font-weight:600; margin:0 0 .5rem; }
  p { margin:0; font-size:.85rem; line-height:1.6; color:#a1a1aa; max-width:26rem; }
  a { display:inline-block; margin-top:1.5rem; font-size:.8rem; color:#fafafa; }
</style>
</head>
<body>
  <div class="card">
    <div class="dot">${ok ? '✓' : '!'}</div>
    <h1>${ok ? `${safeLabel} is live` : `${safeLabel} connection didn't finish`}</h1>
    <p>${safeMessage}</p>
    <a href="/">Back to NEXUS</a>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'nexus-social-oauth', ok: ${ok ? 'true' : 'false'}, platform: '${safeLabel}' }, window.location.origin);
      }
    } catch (e) {}
    setTimeout(function () { try { window.close() } catch (e) {} }, 900);
  </script>
</body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/* ------------------------------ handler ----------------------------- */

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? ''

  const clientIdFor = (platform: string): string => {
    const id =
      platform === 'linkedin' ? process.env.LINKEDIN_CLIENT_ID : platform === 'x' ? process.env.X_CLIENT_ID : process.env.META_APP_ID
    return id?.trim() ?? ''
  }
  const secretFor = (platform: string): string => {
    const s =
      platform === 'linkedin'
        ? process.env.LINKEDIN_CLIENT_SECRET
        : platform === 'x'
          ? process.env.X_CLIENT_SECRET
          : process.env.META_APP_SECRET
    return s?.trim() ?? ''
  }

  try {
    if (oauthError) {
      return resultPage(false, 'Account', 'No problem — nothing was changed, and the agent keeps rehearsing. You can try again any time.')
    }
    if (!code || !state) {
      return resultPage(false, 'Account', 'The platform did not finish the handshake. Please try again.')
    }

    const payload = await verifyOAuthState(state)
    if (!payload || !isSocialPlatform(payload.platform)) {
      return resultPage(false, 'Account', 'The connection link expired (it is valid for 10 minutes). Please tap the button again.')
    }

    const platform = payload.platform
    const label = SOCIAL_PLATFORMS[platform].label
    const origin =
      (req.headers.get('x-forwarded-proto') && req.headers.get('x-forwarded-host'))
        ? `${req.headers.get('x-forwarded-proto').split(',')[0].trim()}://${req.headers.get('x-forwarded-host')}`
        : req.nextUrl.origin
    const redirectUri = `${origin}/api/social/oauth/callback`

    let profile: { externalId: string; handle: string; displayName: string; token: string; avatarUrl: string }
    if (platform === 'instagram' || platform === 'facebook') {
      profile = await finishMeta(code, redirectUri, secretFor(platform), clientIdFor(platform), platform)
    } else if (platform === 'linkedin') {
      profile = await finishLinkedIn(code, redirectUri, clientIdFor(platform), secretFor(platform))
    } else {
      profile = await finishX(code, redirectUri, clientIdFor(platform), secretFor(platform), payload.verifier ?? '')
    }

    // Upsert: one live connection per platform per user (autopilot settings preserved on update).
    const existing = await db.socialAccount.findFirst({ where: { userId: payload.userId, platform } })
    const meta = JSON.stringify({ handle: profile.handle, avatarUrl: profile.avatarUrl })
    const statusMessage = `Live — connected with one tap via ${label}. Posts go on-air for real.`

    const row = existing
      ? await db.socialAccount.update({
          where: { id: existing.id },
          data: {
            externalId: profile.externalId,
            accessTokenEnc: encryptSecret(profile.token),
            displayName: profile.displayName || existing.displayName,
            meta,
            status: 'connected',
            statusMessage,
          },
        })
      : await db.socialAccount.create({
          data: {
            userId: payload.userId,
            platform,
            displayName: profile.displayName || label,
            externalId: profile.externalId,
            accessTokenEnc: encryptSecret(profile.token),
            meta,
            status: 'connected',
            statusMessage,
          },
        })

    await logActivity(
      payload.userId,
      row.id,
      'connected',
      `🚀 ${label} is LIVE (${profile.handle || profile.displayName}) — the agent can now publish for real.`,
    )

    return resultPage(true, label, `The agent can now publish to ${label} for real. You can close this window.`)
  } catch (error) {
    console.error('[api/social/oauth/callback] error:', error)
    const message = error instanceof Error ? error.message : 'Something went wrong — please try again.'
    return resultPage(false, 'Account', `${message} Nothing was broken — the agent keeps rehearsing meanwhile.`)
  }
}
