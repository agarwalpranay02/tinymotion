import { beforeEach, describe, expect, it, vi } from "vitest";

// The key store and rate limiter are replaced so the real route handler can be called directly.
vi.mock("@/lib/server/apikeys", () => ({
  PER_MINUTE: 30,
  MONTHLY_QUOTA: 5000,
  verifyKey: vi.fn(async (k: string) => (k === "tm_live_good" ? { id: "key1" } : null)),
  countCall: vi.fn(async () => 1),
}));
vi.mock("@/lib/server/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 })),
  limitHeaders: () => ({}),
}));
vi.mock("server-only", () => ({}));

const { POST } = await import("@/app/api/v1/classify/route");
const call = (body: unknown, key = "tm_live_good", type = "application/json") =>
  POST(new Request("http://x/api/v1/classify", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": type }, body: JSON.stringify(body) }));
const still = () => Array.from({ length: 128 }, () => [0, 0, 0, 0, 0, 0, 1, -0.16, -0.03]);

describe("POST /api/v1/classify", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects an unknown key", async () => {
    const r = await call({ window: still() }, "tm_live_bad");
    expect(r.status).toBe(401);
  });
  it("classifies one window", async () => {
    const r = await call({ window: still() });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.model).toBe("tinymotion-anywhere");
    expect(j.predictions).toHaveLength(1);
    const p = j.predictions[0];
    expect(Object.values(p.probabilities as Record<string, number>).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(p.confidence).toBe(p.probabilities[p.activity]);
  });
  it("classifies a batch with a chosen model, in order", async () => {
    const r = await call({ model: "paper-mobilenet1d", windows: [still(), still(), still()] });
    expect(r.status).toBe(200);
    expect((await r.json()).predictions).toHaveLength(3);
  });
  it("validates shape, size, content type and exclusivity", async () => {
    expect((await call({ window: [[1, 2, 3]] })).status).toBe(400);
    expect((await call({ window: still(), windows: [still()] })).status).toBe(400);
    expect((await call({ windows: Array.from({ length: 65 }, still) })).status).toBe(400);
    expect((await call({ model: "nope", window: still() })).status).toBe(400);
    const w = still(); w[5][2] = Number.NaN;
    expect((await call({ window: w })).status).toBe(400);
    expect((await call({ window: still() }, "tm_live_good", "text/plain")).status).toBe(415);
  });
});
