import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "./env";

export function clientIp(req: Request): string {
  if (env.TRUST_PROXY === "1") {
    const h = req.headers;
    return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "0.0.0.0";
  }
  return "0.0.0.0";
}

export const hashIp = (ip: string) => createHash("sha256").update(`tinymotion:${ip}`).digest("hex").slice(0, 24);

export function problem(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Rejects cross-site form/JSON posts to cookie-authenticated endpoints. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
