import { NextResponse } from "next/server";

/** Minimal health endpoint — liveness + identity, no internals exposed. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "nexus-ai",
    time: new Date().toISOString(),
  });
}
