import { NextResponse } from "next/server";
import { z } from "zod";
import { createKey, listKeys } from "@/lib/server/apikeys";
import { problem, sameOrigin } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return problem(401, "unauthenticated", "Sign in first.");
  return NextResponse.json({ keys: await listKeys(s.user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return problem(403, "forbidden", "Cross-site request blocked.");
  const s = await getSession();
  if (!s) return problem(401, "unauthenticated", "Sign in first.");
  const body = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return problem(400, "invalid_name", "Give the key a name up to 60 characters.");
  if ((await listKeys(s.user.id)).length >= 10) return problem(409, "too_many_keys", "Revoke an existing key first (limit 10).");
  const k = await createKey(s.user.id, body.data.name);
  return NextResponse.json(k, { status: 201, headers: { "Cache-Control": "no-store" } });
}
