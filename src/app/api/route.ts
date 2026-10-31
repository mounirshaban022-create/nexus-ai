import { healthResponse } from "@/lib/health";

/** Health endpoint — served at BOTH /api and /api/health. */
export async function GET() {
  return healthResponse();
}
