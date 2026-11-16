import { NextResponse } from "next/server";
import { MODELS } from "@/lib/activities";
import { loadServerModel } from "@/lib/engine/server";
import { MODEL_VERSION } from "@/lib/engine/version";

export const dynamic = "force-dynamic";

/** Liveness plus a real inference on a zero window, so a broken model file shows up here. */
export async function GET() {
  try {
    const m = await loadServerModel(MODELS[0].id);
    const p = m.predict(new Float32Array(128 * 9));
    const ok = p.length === 6 && Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-3;
    return NextResponse.json({ status: ok ? "ok" : "degraded", version: MODEL_VERSION, models: MODELS.map((x) => x.id) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "down", version: MODEL_VERSION }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
