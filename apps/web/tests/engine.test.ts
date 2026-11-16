import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/activities";
import { csvFixture } from "./helpers";
import { guessMapping, guessUnits, parseCsv } from "@/lib/csv";
import { decodeWeights, Model, type ModelFile } from "@/lib/engine/model";
import { alignRotation, apply, calibrate, G, Pipeline, Sos, type Vec3 } from "@/lib/engine/pipeline";
import { MODEL_VERSION } from "@/lib/engine/version";

const dir = path.join(__dirname, "..", "public");
const load = (id: string) => {
  const base = path.join(dir, "models", MODEL_VERSION, id);
  const file = JSON.parse(readFileSync(path.join(base, "model.json"), "utf8")) as ModelFile;
  const bin = readFileSync(path.join(base, "weights.bin"));
  return new Model(file, decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer));
};
const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "parity.json"), "utf8")) as { windows: number[][][]; labels: number[]; logits: Record<string, number[][]> };

describe("inference engine matches TensorFlow", () => {
  for (const m of MODELS) {
    it(`${m.id}: logits within 1e-4 of Keras on 12 test windows`, () => {
      const model = load(m.id);
      fixture.windows.forEach((w, i) => {
        const z = model.logits(Float32Array.from(w.flat()));
        const ref = fixture.logits[m.id][i];
        for (let k = 0; k < 6; k++) expect(Math.abs(z[k] - ref[k])).toBeLessThan(1e-4);
      });
    });
  }
  it("probabilities sum to one", () => {
    const p = load("tinymotion-anywhere").predict(Float32Array.from(fixture.windows[0].flat()));
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});

describe("signal pipeline", () => {
  it("Butterworth filter starts in steady state and passes DC unchanged", () => {
    const model = load("tinymotion-anywhere");
    const f = new Sos(model.meta.filters.gravity_sos);
    for (let i = 0; i < 50; i++) expect(f.step(0.98)).toBeCloseTo(0.98, 6);
  });
  it("alignRotation maps one direction onto another, including opposite ones", () => {
    for (const [a, b] of [[[0, 0, 9.8], [1, -0.16, -0.03]], [[0, 0, 1], [0, 0, -1]], [[3, 4, 0], [0, 0, 1]]] as [Vec3, Vec3][]) {
      const v = apply(alignRotation(a, b), a);
      const n = Math.hypot(...b);
      const scale = Math.hypot(...a) / n;
      b.forEach((x, i) => expect(v[i]).toBeCloseTo(x * scale, 5));
    }
  });
  it("calibration reports a still phone as still with a 1 g magnitude", () => {
    const c = calibrate(Array.from({ length: 100 }, () => [0.1, 9.75, 0.6] as Vec3), [1, -0.16, -0.03]);
    expect(c.stillness).toBeLessThan(1e-6);
    expect(c.magnitude).toBeCloseTo(Math.hypot(0.1, 9.75, 0.6) / G, 5);
  });
  it("resamples and windows a real recording, and the model agrees with the labels", () => {
    const model = load("tinymotion-anywhere");
    const idx = JSON.parse(readFileSync(path.join(dir, "demo", "index.json"), "utf8")).clips[0];
    const buf = readFileSync(path.join(dir, "demo", `${idx.id}.bin`));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = idx.samples;
    const pipe = new Pipeline({ gravitySos: model.meta.filters.gravity_sos, noiseSos: model.meta.filters.noise_sos, skipNoiseFilter: true, hop: 64 });
    let right = 0, total = 0;
    for (let i = 0; i < n; i++) {
      const acc = [0, 1, 2].map((k) => (dv.getInt16((i * 6 + k) * 2, true) / idx.accScale) * G) as Vec3;
      const gyro = [3, 4, 5].map((k) => dv.getInt16((i * 6 + k) * 2, true) / idx.gyroScale) as Vec3;
      for (const w of pipe.push({ t: i * 20, acc, gyro })) {
        const label = buf[n * 12 + i - 64];
        const p = model.predict(w.data);
        total++;
        if (p.indexOf(Math.max(...p)) === label) right++;
      }
    }
    expect(total).toBeGreaterThan(60);
    expect(right / total).toBeGreaterThan(0.85);
  });
  it("restarts cleanly after a gap in the readings", () => {
    const model = load("tinymotion-anywhere");
    const pipe = new Pipeline({ gravitySos: model.meta.filters.gravity_sos, noiseSos: model.meta.filters.noise_sos, hop: 25 });
    let windows = 0;
    for (let t = 0; t < 3000; t += 16) windows += pipe.push({ t, acc: [0, 9.8, 0], gyro: [0, 0, 0] }).length;
    for (let t = 6000; t < 7000; t += 16) windows += pipe.push({ t, acc: [0, 9.8, 0], gyro: [0, 0, 0] }).length;
    // 3 s gives windows after the first 2.56 s; the 1 s after the gap is too short for a new window
    expect(windows).toBeGreaterThan(0);
    expect(windows).toBeLessThan(5);
  });
});

describe("CSV import", () => {
  it("reads TinyMotion's own export, including labels", () => {
    const p = parseCsv(readFileSync(path.join(dir, "demo", "sample-recording.csv"), "utf8"));
    const m = guessMapping(p.header);
    expect(m).toEqual({ time: 0, acc: [1, 2, 3], gyro: [4, 5, 6], label: 7 });
    const u = guessUnits(p, m);
    expect(u).toEqual({ timeScaleMs: 1, accScale: 1, gyroScale: 1 });
  });
  it("detects seconds, g and deg/s in another logger's layout", () => {
    const p = parseCsv(csvFixture());
    const m = guessMapping(p.header);
    expect(m.acc).toEqual([1, 2, 3]);
    expect(m.gyro).toEqual([4, 5, 6]);
    const u = guessUnits(p, m);
    expect(u.timeScaleMs).toBe(1000);
    expect(u.accScale).toBeCloseTo(9.80665);
    expect(u.gyroScale).toBeCloseTo(Math.PI / 180);
  });
});

describe("service worker", () => {
  it("precaches the model folder for the current model version", async () => {
    const { readFileSync } = await import("node:fs");
    const { MODEL_VERSION } = await import("../src/lib/engine/version");
    expect(readFileSync("public/sw.js", "utf8")).toContain(`/models/${MODEL_VERSION}/tinymotion-anywhere`);
  });
});

describe("database TLS", () => {
  it("verifies certificates for hosted Postgres and respects sslmode=disable", async () => {
    const { pgConfig } = await import("../src/lib/server/pgconfig");
    const hosted = pgConfig("postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=require&channel_binding=require");
    expect(hosted.ssl).toBe(true);
    expect(hosted.connectionString).not.toContain("sslmode");
    expect(hosted.connectionString).toContain("channel_binding=require");
    expect(pgConfig("postgres://localhost:5432/tinymotion?sslmode=disable").ssl).toBe(false);
  });
});
