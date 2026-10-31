import { NextResponse } from "next/server";
import { premiumEngineStatus } from "@/lib/premium-pool";
import { zaiConfigured } from "@/lib/zai";
import { authSecretSource, ensureAuthSecretProvisioned } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Health payload — liveness + identity + which engines are configured.
 * Exposes ONLY booleans/enums (never keys, URLs or the secret itself) so
 * it is safe to make public. It answers the two questions every Vercel
 * deployer asks after "nothing works":
 *   1. Is the DATABASE reachable and is the auth secret provisioned?
 *   2. Which AI / voice engines will actually serve requests here?
 *
 * Served from BOTH /api and /api/health.
 */
export async function healthResponse(): Promise<NextResponse> {
  let zai = false;
  try {
    zai = await zaiConfigured();
  } catch {
    zai = false;
  }

  // Database reachability — the #1 reason a fresh deployment "doesn't
  // work" (sign-in 500s, features 401/500). Reported without leaking
  // any credential material.
  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  // Resolve (and if necessary provision) the session-signing secret so
  // the reported state is accurate, not just "not touched yet".
  await ensureAuthSecretProvisioned();

  return NextResponse.json({
    ok: true,
    app: "nexus-ai",
    time: new Date().toISOString(),
    deployment: {
      vercel: Boolean(process.env.VERCEL),
      production: process.env.NODE_ENV === "production",
    },
    core: {
      /** Database reachable — sign-in, sessions and galleries need it. */
      database,
      /** 'env' = AUTH_SECRET set by the operator; 'db' = auto-provisioned
       *  on first boot; 'missing' = no DB either (sign-in cannot work). */
      authSecret: authSecretSource(),
    },
    engines: {
      ...premiumEngineStatus(),
      zai,
      /** Free image fallback — always available (no key). */
      pollinations: true,
      /** Free TTS — no key needed, but cloud IPs can be rate-limited;
       *  browsers additionally fall back to the built-in Web Speech voice. */
      edgeTts: true,
      /** Browser-side voice (recognition + synthesis) — client capability,
       *  listed so status dashboards can explain the voice stack. */
      browserVoice: "client-side (Web Speech API)",
    },
  });
}
