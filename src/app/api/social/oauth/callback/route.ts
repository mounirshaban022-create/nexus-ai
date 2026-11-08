import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { verifyOAuthState } from '@/lib/auth'
import { encryptSecret } from '@/lib/email'
import { SOCIAL_PLATFORMS, isSocialPlatform, logActivity, getPlatformCredentials, SocialPlatform } from '@/lib/social'
import { OAUTH_NONCE_COOKIE } from '@/app/api/social/oauth/start/route'

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
/* If the user's Meta account is missing the one free thing Meta       */
/* requires (a Page / a professional IG linked to it), the answer page */
/* turns into a ONE-TAP FIX: a button that creates the page, a button  */
/* that retries the handshake — no knowledge required, ever.           */
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

interface MetaProfile {
  externalId: string
  handle: string
  displayName: string
  token: string
  avatarUrl: string
}

interface MetaPageRow {
  id: string
  name?: string
  username?: string
  access_token?: string
  instagram_business_account?: { id: string; username?: string }
}

type MetaOutcome =
  | { kind: 'ok'; profile: MetaProfile }
  | { kind: 'no-pages' }
  | { kind: 'page-without-ig'; page: MetaPageRow }

async function finishMeta(
  code: string,
  redirectUri: string,
  clientSecret: string,
  clientId: string,
  platform: 'instagram' | 'facebook',
): Promise<MetaOutcome> {
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
  )) as { data?: MetaPageRow[] }

  const list = pages.data ?? []
  if (list.length === 0) return { kind: 'no-pages' }

  if (platform === 'instagram') {
    const withIg = list.find((p) => p.instagram_business_account?.id)
    if (!withIg?.instagram_business_account) {
      return { kind: 'page-without-ig', page: withIg ?? list[0] }
    }
    const ig = withIg.instagram_business_account
    return {
      kind: 'ok',
      profile: {
        externalId: ig.id,
        handle: ig.username ? `@${ig.username}` : withIg.name ?? '',
        displayName: ig.username ? `@${ig.username}` : withIg.name ?? 'Instagram',
        token: withIg.access_token ?? token, // page token publishes to IG Graph
        avatarUrl: '',
      },
    }
  }

  const page = list[0]
  return {
    kind: 'ok',
    profile: {
      externalId: page.id,
      handle: page.username ? `@${page.username}` : page.name ?? '',
      displayName: page.name ?? 'Facebook Page',
      token: page.access_token ?? token,
      avatarUrl: '',
    },
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

interface ResultAction {
  href: string
  label: string
  primary?: boolean
  /** Open in a new tab — used for external links (Facebook) so the retry
   * buttons in this window survive the detour. */
  newTab?: boolean
}

/** SECURITY (audit M4): real HTML entity escaping — the previous
 * char-stripping approach blocked current injection paths but any future
 * template edit could silently re-open XSS. Escape every dynamic value. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resultPage(
  ok: boolean,
  platformLabel: string,
  message: string,
  actions: ResultAction[] = [{ href: '/', label: 'Back to NEXUS' }],
  steps?: { en: string; ar: string }[],
): NextResponse {
  const title = ok ? 'Connected ✓' : 'One step left'
  const color = ok ? '#10b981' : '#f59e0b'
  const buttons = actions
    .map((a) => {
      const safeHref = escapeHtml(a.href)
      const safeText = escapeHtml(a.label)
      const style = a.primary
        ? 'display:inline-block;margin:.35rem .3rem;padding:.8rem 1.3rem;border-radius:.8rem;background:#fafafa;color:#0b0b0d;font-weight:600;font-size:.86rem;text-decoration:none;'
        : 'display:inline-block;margin:.35rem .3rem;padding:.75rem 1.15rem;border-radius:.8rem;border:1px solid #3f3f46;color:#e4e4e7;font-size:.84rem;text-decoration:none;'
      const target = a.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `    <a href="${safeHref}"${target} style="${style}">${safeText}</a>`
    })
    .join('\n')
  // Bilingual step list (EN + AR) for the one-tap fix flows — the user is
  // anxious and needs the exact taps, not prose.
  const stepsHtml = (steps ?? [])
    .map(
      (s, i) =>
        `      <li><span class="num">${i + 1}</span><span class="txt"><span class="en">${escapeHtml(s.en)}</span><span class="ar" dir="rtl" lang="ar">${escapeHtml(s.ar)}</span></span></li>`,
    )
    .join('\n')
  const stepsBlock = stepsHtml
    ? `\n    <ol class="steps">\n${stepsHtml}\n    </ol>`
    : ''
  // The opener notification is a JSON payload — stringify (never hand-build a
  // JS string literal) and neutralize < so </script> cannot break out.
  const postMessagePayload = JSON.stringify({
    type: 'nexus-social-oauth',
    ok,
    platform: platformLabel,
    message,
  })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · NEXUS</title>
<style>
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:#0b0b0d; color:#fafafa;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { text-align:center; padding:2.5rem 1.5rem; max-width:30rem; }
  .dot { width:56px; height:56px; margin:0 auto 1.25rem; border-radius:9999px; display:grid; place-items:center;
         background:${color}22; border:1px solid ${color}55; font-size:1.6rem; }
  h1 { font-size:1.15rem; font-weight:600; margin:0 0 .5rem; }
  p { margin:0; font-size:.85rem; line-height:1.6; color:#a1a1aa; max-width:26rem; margin:0 auto; }
  .actions { margin-top:1.25rem; }
  .steps { margin:1.4rem auto 0; max-width:24rem; text-align:left; list-style:none; padding:0; }
  .steps li { display:flex; align-items:flex-start; gap:.6rem; padding:.6rem 0; border-top:1px solid #27272a; }
  .steps li:first-child { border-top:0; padding-top:0; }
  .steps .num { flex:0 0 1.35rem; height:1.35rem; margin-top:.15rem; border-radius:999px; background:${color}22; border:1px solid ${color}55; color:${color}; font-size:.7rem; font-weight:700; display:grid; place-items:center; }
  .steps .txt { display:flex; flex-direction:column; gap:.1rem; }
  .steps .en { font-size:.78rem; color:#a1a1aa; line-height:1.5; }
  .steps .ar { font-size:.88rem; color:#fafafa; line-height:1.65; text-align:right; }
  .hint { margin-top:1.1rem; font-size:.72rem; color:#71717a; }
</style>
</head>
<body>
  <div class="card">
    <div class="dot">${ok ? '✓' : '!'}</div>
    <h1>${ok ? `${escapeHtml(platformLabel)} is live` : `${escapeHtml(platformLabel)} connection didn't finish`}</h1>
    <p>${escapeHtml(message)}</p>${stepsBlock}
    <div class="actions">
${buttons}
    </div>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${postMessagePayload}, window.location.origin);
      }
    } catch (e) {}
    ${ok
      ? `setTimeout(function () { try { window.close() } catch (e) {} }, 1200);
    setTimeout(function () { try { if (!window.closed) window.location.replace('/') } catch (e) {} }, 2200);`
      : ''}
  </script>
</body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/* --------------------------- account upsert -------------------------- */

async function upsertAccount(
  userId: string,
  platform: SocialPlatform,
  label: string,
  profile: MetaProfile,
) {
  const existing = await db.socialAccount.findFirst({ where: { userId, platform } })
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
          userId,
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
    userId,
    row.id,
    'connected',
    `🚀 ${label} is LIVE (${profile.handle || profile.displayName}) — the agent can now publish for real.`,
  )
  return row
}

/* ------------------------------ handler ----------------------------- */

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? ''

  // SECURITY (audit M1): consume the one-time handshake cookie. Whether the
  // flow succeeds or fails, the nonce is spent — retry always re-runs /start.
  const nonceCookie = req.cookies.get(OAUTH_NONCE_COOKIE)?.value ?? ''
  const clearNonce = (res: NextResponse): NextResponse => {
    res.cookies.set(OAUTH_NONCE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
    return res
  }

  // Best-effort platform recovery (for "Try again" buttons even on errors).
  let retryPlatform = ''
  if (state) {
    try {
      const peek = await verifyOAuthState(state)
      if (peek && isSocialPlatform(peek.platform)) retryPlatform = peek.platform
    } catch {
      /* expired/invalid — no retry button then */
    }
  }

  const back: ResultAction[] = [{ href: '/', label: 'Back to NEXUS' }]
  const retry = (platform: string): ResultAction[] =>
    platform
      ? [{ href: `/api/social/oauth/start?platform=${platform}`, label: 'Try again', primary: true }]
      : []

  try {
    if (oauthError) {
      return resultPage(
        false,
        'Account',
        'No problem — nothing was changed, and the agent keeps rehearsing. You can try again any time.',
        [...retry(retryPlatform), ...back],
      )
    }
    if (!code || !state) {
      return resultPage(false, 'Account', 'The platform did not finish the handshake. Please try again.', back)
    }

    const payload = await verifyOAuthState(state)
    if (!payload || !isSocialPlatform(payload.platform)) {
      return clearNonce(
        resultPage(
          false,
          'Account',
          'The connection link expired (it is valid for 10 minutes). Please tap the connect button again.',
          back,
        ),
      )
    }

    // SECURITY (audit M1): the state JWT must pair with the nonce cookie this
    // browser received at /start. Missing/mismatched → reject (replay guard).
    const nonceHash = createHash('sha256').update(payload.nonce ?? '').digest('hex')
    const nonceOk =
      Boolean(payload.nonce) &&
      nonceCookie.length === nonceHash.length &&
      timingSafeEqual(Buffer.from(nonceCookie), Buffer.from(nonceHash))
    if (!nonceOk) {
      return clearNonce(
        resultPage(
          false,
          'Account',
          'This connection link was already used or came from another browser. Please tap the connect button again.',
          back,
        ),
      )
    }

    const platform = payload.platform
    const label = SOCIAL_PLATFORMS[platform].label
    // SECURITY (audit M2): canonical origin from operator env first, headers
    // as fallback (see start/route.ts resolveOrigin).
    const configuredOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    const origin =
      configuredOrigin && configuredOrigin.startsWith('http')
        ? configuredOrigin.replace(/\/+$/, '')
        : proto && host
          ? `${proto}://${host}`
          : req.nextUrl.origin
    const redirectUri = `${origin}/api/social/oauth/callback`

    if (platform === 'instagram' || platform === 'facebook') {
      const creds = await getPlatformCredentials(platform)
      if (!creds) {
        return resultPage(false, label, 'The connection was switched off in the meantime. Open NEXUS and tap connect again.', back)
      }
      const outcome = await finishMeta(code, redirectUri, creds.clientSecret, creds.clientId, platform)

      if (outcome.kind === 'no-pages') {
        // The ONE free thing Meta requires that we cannot do for the user:
        // a Facebook Page. Give them a one-tap path to create it, then retry.
        // NOTE: on phones Facebook often bounces /pages/creation to the user's
        // profile — the steps below give the in-app Menu → Pages path too.
        return resultPage(
          false,
          label,
          'Almost there! Your Facebook account has no Page yet, and Meta requires one before connecting. It is free, stays invisible until you post, and takes about a minute.',
          [
            { href: 'https://www.facebook.com/pages/creation', label: 'Open the Create-Page form', primary: true, newTab: true },
            { href: `/api/social/oauth/start?platform=${platform}`, label: 'I created it — retry' },
            { href: 'https://www.facebook.com/help/104002523025024', label: 'Official Facebook guide', newTab: true },
            ...back,
          ],
          [
            {
              en: 'Easiest on your phone: open the Facebook app → Menu ☰ → Pages → Create.',
              ar: 'أسهل طريق من الموبايل: افتح تطبيق فيسبوك ← القائمة ☰ ← «الصفحات» ← «إنشاء».',
            },
            {
              en: 'On a computer: tap the button above — the form opens right away.',
              ar: 'من الكمبيوتر: اضغط الزر اللي فوق والفورم هيفتح على طول.',
            },
            {
              en: 'Type any name, pick any category → Create. Your personal profile stays untouched.',
              ar: 'اكتب أي اسم واختار أي تصنيف ← «إنشاء». بروفايلك الشخصي مش هيتأثر خالص.',
            },
            {
              en: 'Come back to this window and tap “I created it — retry”.',
              ar: 'ارجع للنافذة دي واضغط «I created it — retry» وهنكمل أوتوماتيك.',
            },
            {
              en: 'Important: after creating a Page, Facebook switches you to “acting as the Page”. Switch back to your personal profile before retrying, or the login will fail with “App not active”.',
              ar: 'مهم: بعد ما تعمل الصفحة، فيسبوك بيحوّلك «للعمل باسم الصفحة». ارجع لبروفايلك الشخصي الأول (القائمة ☰ ← صورتك الشخصية) وبعدها دوس retry — لو ما رجعتش هيطلع «App not active».',
            },
          ],
        )
      }

      if (outcome.kind === 'page-without-ig') {
        // Silver lining: the Page itself is perfectly usable — connect
        // Facebook right now, free of charge, zero extra work.
        const page = outcome.page
        await upsertAccount(payload.userId, 'facebook', SOCIAL_PLATFORMS.facebook.label, {
          externalId: page.id,
          handle: page.username ? `@${page.username}` : page.name ?? '',
          displayName: page.name ?? 'Facebook Page',
          token: page.access_token ?? '',
          avatarUrl: '',
        })
        return resultPage(
          false,
          'Instagram',
          'Good news — your Facebook Page is now connected to NEXUS. One free step left for Instagram: switch it to a professional (creator) account and pick your page. Then tap retry.',
          [
            { href: 'https://www.instagram.com/', label: 'Open Instagram', primary: true, newTab: true },
            { href: '/api/social/oauth/start?platform=instagram', label: 'Done — retry Instagram' },
            ...back,
          ],
          [
            {
              en: 'Instagram app → your profile → menu ☰ → Settings and privacy.',
              ar: 'في تطبيق انستجرام: البروفايل ← القائمة ☰ ← «الإعدادات والخصوصية».',
            },
            {
              en: 'Account type and tools → Switch to professional account → Creator.',
              ar: '«نوع الحساب والأدوات» ← «التبديل إلى حساب احترافي» ← «مبدع».',
            },
            {
              en: 'When asked, pick the Facebook Page you just created → Done.',
              ar: 'لما يسألك، اختار صفحة فيسبوك اللي عملتها دلوقتي ← تم.',
            },
            {
              en: 'Back here → “Done — retry Instagram” and the rest is automatic.',
              ar: 'ارجع هنا ← «Done — retry Instagram» والباقي أوتوماتيك.',
            },
          ],
        )
      }

      const profile = outcome.profile
      await upsertAccount(payload.userId, platform, label, profile)
      return resultPage(true, label, `The agent can now publish to ${label} for real. You can close this window.`)
    }

    let profile: MetaProfile
    if (platform === 'linkedin') {
      const creds = await getPlatformCredentials(platform)
      if (!creds) throw new Error('The LinkedIn connection is not switched on for this deployment.')
      profile = await finishLinkedIn(code, redirectUri, creds.clientId, creds.clientSecret)
    } else {
      const creds = await getPlatformCredentials(platform)
      if (!creds) throw new Error('The X connection is not switched on for this deployment.')
      profile = await finishX(code, redirectUri, creds.clientId, creds.clientSecret, payload.verifier ?? '')
    }
    await upsertAccount(payload.userId, platform, label, profile)
    return resultPage(true, label, `The agent can now publish to ${label} for real. You can close this window.`)
  } catch (error) {
    console.error('[api/social/oauth/callback] error:', error)
    const message = error instanceof Error ? error.message : 'Something went wrong — please try again.'
    return resultPage(false, 'Account', `${message} Nothing was broken — the agent keeps rehearsing meanwhile.`, [
      ...retry(retryPlatform),
      ...back,
    ])
  }
}
