import { NextResponse } from "next/server";
import { premiumEngineStatus } from "@/lib/premium-pool";
import { zaiConfigured } from "@/lib/zai";

/**
 * Health endpoint — liveness + identity + which AI engines are configured.
 * Exposes ONLY booleans (never keys or URLs) so it is safe to make public:
 * it answers "is my provider key being picked up?" without leaking secrets.
 */
export async function GET() {
  let zai = false;
  try {
    zai = await zaiConfigured();
  } catch {
    zai = false;
  }
  return NextResponse.json({
    ok: true,
    app: "nexus-ai",
    time: new Date().toISOString(),
    engines: {
      ...premiumEngineStatus(),
      zai,
    },
  });
}
