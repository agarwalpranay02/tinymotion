import "server-only";
import { env } from "./env";

/**
 * Fixed-window rate limiter. Uses Upstash Redis (REST) when configured so limits
 * hold across instances; otherwise an in-process map (fine for a single instance).
 */
const mem = new Map<string, { n: number; reset: number }>();

export type Limit = { ok: boolean; remaining: number; reset: number; limit: number };

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Limit> {
  const now = Date.now();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const bucket = `rl:${key}:${Math.floor(now / 1000 / windowSec)}`;
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      body: JSON.stringify([["INCR", bucket], ["EXPIRE", bucket, String(windowSec)]]),
      cache: "no-store",
    });
    if (res.ok) {
      const [[, n]] = (await res.json()).map((r: { result: number }) => [null, r.result]);
      const reset = (Math.floor(now / 1000 / windowSec) + 1) * windowSec * 1000;
      return { ok: n <= limit, remaining: Math.max(0, limit - n), reset, limit };
    }
  }
  const e = mem.get(key);
  if (!e || e.reset <= now) {
    mem.set(key, { n: 1, reset: now + windowSec * 1000 });
    if (mem.size > 50_000) for (const [k, v] of mem) if (v.reset <= now) mem.delete(k);
    return { ok: true, remaining: limit - 1, reset: now + windowSec * 1000, limit };
  }
  e.n++;
  return { ok: e.n <= limit, remaining: Math.max(0, limit - e.n), reset: e.reset, limit };
}

export function limitHeaders(l: Limit): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(l.limit),
    "X-RateLimit-Remaining": String(l.remaining),
    "X-RateLimit-Reset": String(Math.ceil(l.reset / 1000)),
    ...(l.ok ? {} : { "Retry-After": String(Math.max(1, Math.ceil((l.reset - Date.now()) / 1000))) }),
  };
}
