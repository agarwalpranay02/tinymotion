/** Parsing and unit detection for sensor recordings (TinyMotion CSV and other phone-logger exports). */

export type Parsed = { header: string[]; rows: string[][] };

export function parseCsv(text: string, maxRows = 500_000): Parsed {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) throw new Error("The file is empty.");
  const delim = [",", ";", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const first = split(lines[0]);
  const hasHeader = first.some((c) => c !== "" && Number.isNaN(Number(c)));
  const header = hasHeader ? first : first.map((_, i) => `column ${i + 1}`);
  const rows = (hasHeader ? lines.slice(1) : lines).slice(0, maxRows).map(split);
  return { header, rows };
}

export type Mapping = { time: number; acc: [number, number, number]; gyro: [number, number, number] | null; label: number | null };

const kindOf = (c: string): "acc" | "gyro" | null =>
  /gyr|rot|angular|omega/.test(c) || /^(g|w)[ _.]?[xyz]$/.test(c) ? "gyro" : /acc|^a[ _.]?[xyz]$/.test(c) ? "acc" : null;
const axisOf = (c: string): number => {
  const m = c.match(/(?:^|[^a-z])([xyz])(?:[^a-z]|$)/) ?? c.match(/(?:acc|gyro|gyr|rot|a|g|w)([xyz])$/);
  return m ? "xyz".indexOf(m[1]) : -1;
};

/** Guesses which columns hold time, acceleration, rotation and an optional label. */
export function guessMapping(h: string[]): Mapping {
  const n = h.map((c) => c.toLowerCase().trim());
  let time = n.findIndex((c) => /^time|timestamp|^t$|seconds|elapsed|^ms$/.test(c));
  if (time < 0) time = 0;
  const acc: number[] = [-1, -1, -1], gyro: number[] = [-1, -1, -1];
  n.forEach((c, i) => {
    if (i === time) return;
    const k = kindOf(c), ax = axisOf(c);
    if (!k || ax < 0) return;
    const slot = k === "acc" ? acc : gyro;
    if (slot[ax] < 0) slot[ax] = i;
  });
  // Fall back to positional columns: time, ax, ay, az, gx, gy, gz
  const pos = (k: number) => (h.length > k ? k : -1);
  const accF = (acc.every((i) => i >= 0) ? acc : [pos(1), pos(2), pos(3)]) as [number, number, number];
  const gyroF = (gyro.every((i) => i >= 0) ? gyro : h.length >= 7 && !n.slice(4, 7).some((c) => /label|activity|class/.test(c)) ? [pos(4), pos(5), pos(6)] : null) as [number, number, number] | null;
  const label = n.findIndex((c) => /^label$|activity|^class$/.test(c));
  return { time, acc: accF, gyro: gyroF, label: label >= 0 ? label : null };
}

export type Units = { timeScaleMs: number; accScale: number; gyroScale: number };

/** Detects units from the data: time in s/ms/us/ns, acceleration in g or m/s^2, rotation in deg/s or rad/s. */
export function guessUnits(p: Parsed, m: Mapping): Units {
  const col = (i: number, max = 3000) => p.rows.slice(0, max).map((r) => Number(r[i])).filter(Number.isFinite);
  const t = col(m.time);
  const dts = t.slice(1).map((v, i) => v - t[i]).filter((d) => d > 0).sort((a, b) => a - b);
  const dt = dts[Math.floor(dts.length / 2)] ?? 20;
  // a typical phone logs at 20-500 Hz, so one step is 2-50 ms
  const timeScaleMs = dt < 0.1 ? 1000 : dt < 100 ? 1 : dt < 1e5 ? 1e-3 : 1e-6;
  const ax = col(m.acc[0]), ay = col(m.acc[1]), az = col(m.acc[2]);
  const mags = ax.map((v, i) => Math.hypot(v, ay[i] ?? 0, az[i] ?? 0)).sort((a, b) => a - b);
  const med = mags[Math.floor(mags.length / 2)] ?? 9.8;
  const accScale = med > 4 ? 1 : 9.80665; // values near 1 are in g
  let gyroScale = 1;
  if (m.gyro) {
    const g = m.gyro.flatMap((i) => col(i)).map(Math.abs).sort((a, b) => a - b);
    const p95 = g[Math.floor(g.length * 0.95)] ?? 0;
    gyroScale = p95 > 12 ? Math.PI / 180 : 1; // body rotation rarely exceeds ~12 rad/s; bigger means deg/s
  }
  return { timeScaleMs, accScale, gyroScale };
}
