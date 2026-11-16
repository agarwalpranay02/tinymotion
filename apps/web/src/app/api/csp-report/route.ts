import { NextResponse } from "next/server";
import { clientIp } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** Receives CSP violation reports (logged, sampled, size-capped). */
export async function POST(req: Request) {
  const l = await rateLimit(`csp:${clientIp(req)}`, 20, 60);
  if (l.ok) {
    const text = (await req.text()).slice(0, 4000);
    console.warn("[csp-report]", text);
  }
  return new NextResponse(null, { status: 204 });
}
