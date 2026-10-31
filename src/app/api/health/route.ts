import { healthResponse } from "@/lib/health";

export async function GET() {
  return healthResponse();
}
