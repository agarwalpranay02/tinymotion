import { NextResponse } from "next/server";
import { devLoginEnabled } from "@/lib/server/env";
import { devOutbox } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

/** Local development only: exposes the last emails so sign-in can be tested without a mail provider. */
export function GET() {
  if (!devLoginEnabled) return new NextResponse(null, { status: 404 });
  return NextResponse.json(devOutbox);
}
