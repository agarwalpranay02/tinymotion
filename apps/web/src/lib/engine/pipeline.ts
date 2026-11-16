/**
 * Turns raw phone sensor readings into the windows the model expects, following the UCI HAR
 * protocol: 50 Hz, a 20 Hz low-pass noise filter, gravity separated with a 3rd-order 0.3 Hz
 * Butterworth low-pass, acceleration in g, rotation in rad/s, 128-sample windows.
 *
 * Phones are held in different ways, so readings are first rotated into the study's device
 * frame. A short still calibration measures the direction of gravity; the rotation that maps it
 * onto the study's standing gravity direction is applied to every later reading. The shipped
 * "anywhere" model is trained to ignore the remaining rotation about the vertical axis.
 */

export const G = 9.80665;
export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// ------------------------------------------------------------------ filters
/** Second-order sections filter (transposed direct form II), started in steady state. */
export class Sos {
  private z: Float64Array;
  private started = false;
  constructor(private readonly sos: number[][]) {
    this.z = new Float64Array(sos.length * 2);
  }
  step(x: number): number {
    if (!this.started) this.prime(x);
    let v = x;
    for (let s = 0; s < this.sos.length; s++) {
      const [b0, b1, b2, , a1, a2] = this.sos[s];
      const y = b0 * v + this.z[2 * s];
      this.z[2 * s] = b1 * v - a1 * y + this.z[2 * s + 1];
      this.z[2 * s + 1] = b2 * v - a2 * y;
      v = y;
    }
    return v;
  }
  /** Sets the state a constant input x would settle to, so there is no start-up transient. */
  private prime(x: number) {
    let v = x;
    for (let s = 0; s < this.sos.length; s++) {
      const [b0, b1, b2, , a1, a2] = this.sos[s];
      const y = (v * (b0 + b1 + b2)) / (1 + a1 + a2);
      this.z[2 * s] = y - b0 * v;
      this.z[2 * s + 1] = b2 * v - a2 * y;
      v = y;
    }
    this.started = true;
  }
}

// ------------------------------------------------------------------ geometry
export const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const apply = (R: Mat3, v: Vec3): Vec3 => [
  R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
  R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
  R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
];

/** Smallest rotation taking direction `from` onto direction `to` (Rodrigues). */
export function alignRotation(from: Vec3, to: Vec3): Mat3 {
  const a = from.map((x) => x / norm(from)) as Vec3;
  const b = to.map((x) => x / norm(to)) as Vec3;
  const v: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.999999) {
    // opposite directions: rotate 180 degrees about any axis perpendicular to a
    const p: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u: Vec3 = [a[1] * p[2] - a[2] * p[1], a[2] * p[0] - a[0] * p[2], a[0] * p[1] - a[1] * p[0]];
    const n = norm(u);
    const [x, y, z] = [u[0] / n, u[1] / n, u[2] / n];
    return [[2 * x * x - 1, 2 * x * y, 2 * x * z], [2 * x * y, 2 * y * y - 1, 2 * y * z], [2 * x * z, 2 * y * z, 2 * z * z - 1]];
  }
  const k = 1 / (1 + c);
  const [x, y, z] = v;
  return [
    [1 - k * (y * y + z * z), -z + k * x * y, y + k * x * z],
    [z + k * x * y, 1 - k * (x * x + z * z), -x + k * y * z],
    [-y + k * x * z, x + k * y * z, 1 - k * (x * x + y * y)],
  ];
}

// ------------------------------------------------------------------ streaming pipeline
export type RawSample = {
  /** milliseconds */
  t: number;
  /** acceleration including gravity, m/s^2, device frame */
  acc: Vec3;
  /** angular velocity, rad/s, device frame (x, y, z) */
  gyro: Vec3;
};

export type PipelineOptions = {
  window?: number;
  /** samples between consecutive windows (default 25 = 0.5 s) */
  hop?: number;
  rate?: number;
  gravitySos: number[][];
  noiseSos: number[][];
  /** rotation into the study frame (from calibration); identity if the data is already in it */
  rotation?: Mat3;
  /** set when the input is already noise-filtered (UCI recordings) */
  skipNoiseFilter?: boolean;
  /** called with every processed 50 Hz row (9 values, UCI channel order), e.g. to draw a trace */
  onRow?: (row: number[]) => void;
};

export type Window = { data: Float32Array; tEnd: number };

export class Pipeline {
  readonly rate: number;
  readonly window: number;
  readonly hop: number;
  rotation: Mat3;
  private readonly noise: Sos[];
  private readonly gravity: Sos[];
  private readonly skipNoise: boolean;
  private readonly onRow?: (row: number[]) => void;
  private ring: Float32Array;
  private filled = 0;
  private sinceEmit = 0;
  private last: RawSample | null = null;
  private nextT: number | null = null;

  constructor(o: PipelineOptions) {
    this.rate = o.rate ?? 50;
    this.window = o.window ?? 128;
    this.hop = o.hop ?? 25;
    this.rotation = o.rotation ?? IDENTITY;
    this.skipNoise = !!o.skipNoiseFilter;
    this.onRow = o.onRow;
    this.noise = Array.from({ length: 6 }, () => new Sos(o.noiseSos));
    this.gravity = Array.from({ length: 3 }, () => new Sos(o.gravitySos));
    this.ring = new Float32Array(this.window * 9);
  }

  /** Feeds one raw reading. Returns the windows completed by it (usually zero or one). */
  push(s: RawSample): Window[] {
    const out: Window[] = [];
    const dt = 1000 / this.rate;
    if (!this.last) {
      this.last = s;
      this.nextT = s.t;
    }
    const a = this.last;
    // A gap of more than a second (tab hidden, sensor paused) restarts the resampler.
    if (s.t - a.t > 1000 || s.t < a.t) {
      this.last = s;
      this.nextT = s.t;
      this.filled = 0;
      this.sinceEmit = 0;
      return out;
    }
    while (this.nextT! <= s.t) {
      const f = s.t === a.t ? 1 : (this.nextT! - a.t) / (s.t - a.t);
      const acc: Vec3 = [0, 1, 2].map((i) => a.acc[i] + f * (s.acc[i] - a.acc[i])) as Vec3;
      const gyro: Vec3 = [0, 1, 2].map((i) => a.gyro[i] + f * (s.gyro[i] - a.gyro[i])) as Vec3;
      const w = this.sample(this.nextT!, acc, gyro);
      if (w) out.push(w);
      this.nextT! += dt;
    }
    this.last = s;
    return out;
  }

  /** One resampled reading at exactly `rate` Hz. */
  private sample(t: number, accMs2: Vec3, gyro: Vec3): Window | null {
    let total = apply(this.rotation, [accMs2[0] / G, accMs2[1] / G, accMs2[2] / G]);
    let g = apply(this.rotation, gyro);
    if (!this.skipNoise) {
      total = [this.noise[0].step(total[0]), this.noise[1].step(total[1]), this.noise[2].step(total[2])];
      g = [this.noise[3].step(g[0]), this.noise[4].step(g[1]), this.noise[5].step(g[2])];
    }
    const grav: Vec3 = [this.gravity[0].step(total[0]), this.gravity[1].step(total[1]), this.gravity[2].step(total[2])];
    const row = [total[0] - grav[0], total[1] - grav[1], total[2] - grav[2], g[0], g[1], g[2], total[0], total[1], total[2]];
    this.onRow?.(row);
    // shift the ring left by one row and append (128 x 9 is small enough that this is cheap)
    this.ring.copyWithin(0, 9);
    this.ring.set(row, (this.window - 1) * 9);
    this.filled = Math.min(this.filled + 1, this.window);
    this.sinceEmit++;
    if (this.filled === this.window && this.sinceEmit >= this.hop) {
      this.sinceEmit = 0;
      return { data: this.ring.slice(), tEnd: t };
    }
    return null;
  }
}

/** Averages acceleration over a still period and returns the rotation into the study frame. */
export function calibrate(samples: Vec3[], gravityReference: number[]): { rotation: Mat3; stillness: number; magnitude: number } {
  const n = samples.length;
  const m: Vec3 = [0, 0, 0];
  for (const s of samples) for (let i = 0; i < 3; i++) m[i] += s[i] / n;
  let varSum = 0;
  for (const s of samples) varSum += (s[0] - m[0]) ** 2 + (s[1] - m[1]) ** 2 + (s[2] - m[2]) ** 2;
  return {
    rotation: alignRotation(m, gravityReference as Vec3),
    // standard deviation of the acceleration vector in g: below ~0.05 the phone was still
    stillness: Math.sqrt(varSum / Math.max(1, n)) / G,
    magnitude: norm(m) / G,
  };
}
