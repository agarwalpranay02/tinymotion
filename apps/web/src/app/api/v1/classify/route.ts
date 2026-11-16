import { NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVITIES, DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/activities";
import { loadServerModel } from "@/lib/engine/server";
import { MODEL_VERSION } from "@/lib/engine/version";
import { countCall, MONTHLY_QUOTA, PER_MINUTE, verifyKey } from "@/lib/server/apikeys";
import { clientIp, problem } from "@/lib/server/http";
import { limitHeaders, rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WINDOWS = 64;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const finite = z.number().finite().gte(-1000).lte(1000);
const window = z.array(z.array(finite).length(9)).length(128);
const Body = z
  .object({
    model: z.enum(MODELS.map((m) => m.id) as [ModelId, ...ModelId[]]).optional(),
    window: window.optional(),
    windows: z.array(window).min(1).max(MAX_WINDOWS).optional(),
  })
  .refine((b) => !!b.window !== !!b.windows, { message: "Send either `window` or `windows`." });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const ipLimit = await rateLimit(`ip:${clientIp(req)}`, 120, 60);
  if (!ipLimit.ok) return problem(429, "rate_limited", "Too many requests from this address.", { ...CORS, ...limitHeaders(ipLimit) });

  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const owner = key ? await verifyKey(key) : null;
  if (!owner) return problem(401, "invalid_api_key", "Send a valid API key as 'Authorization: Bearer tm_live_…'.", CORS);

  const rpm = await rateLimit(`key:${owner.id}`, PER_MINUTE, 60);
  if (!rpm.ok) return problem(429, "rate_limited", "Per-minute limit reached for this key.", { ...CORS, ...limitHeaders(rpm) });

  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return problem(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.", CORS);
  if (Number(req.headers.get("content-length") ?? 0) > 2_000_000) return problem(413, "too_large", "Request body must be 2 MB or smaller.", CORS);
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return problem(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request body.", CORS);

  const calls = await countCall(owner.id);
  if (calls > MONTHLY_QUOTA) return problem(429, "quota_exceeded", `Fair-use limit of ${MONTHLY_QUOTA} calls this month reached. It resets on the 1st.`, CORS);

  const id = parsed.data.model ?? DEFAULT_MODEL;
  const model = await loadServerModel(id);
  const wins = parsed.data.windows ?? [parsed.data.window!];
  const t0 = performance.now();
  const predictions = wins.map((w) => {
    const flat = new Float32Array(128 * 9);
    for (let t = 0; t < 128; t++) for (let c = 0; c < 9; c++) flat[t * 9 + c] = w[t][c];
    const p = model.predict(flat);
    let best = 0;
    for (let k = 1; k < 6; k++) if (p[k] > p[best]) best = k;
    return {
      activity: ACTIVITIES[best].id,
      confidence: Number(p[best].toFixed(4)),
      probabilities: Object.fromEntries(ACTIVITIES.map((a, k) => [a.id, Number(p[k].toFixed(4))])),
    };
  });
  return NextResponse.json(
    { model: id, version: MODEL_VERSION, predictions, latency_ms: Number((performance.now() - t0).toFixed(2)) },
    { headers: { ...CORS, ...limitHeaders(rpm), "X-Quota-Used": String(calls), "X-Quota-Limit": String(MONTHLY_QUOTA), "Cache-Control": "no-store" } },
  );
}
