import { NextResponse } from "next/server";
import { revokeKey } from "@/lib/server/apikeys";
import { problem, sameOrigin } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return problem(403, "forbidden", "Cross-site request blocked.");
  const s = await getSession();
  if (!s) return problem(401, "unauthenticated", "Sign in first.");
  const { id } = await params;
  await revokeKey(s.user.id, id);
  return new NextResponse(null, { status: 204 });
}
