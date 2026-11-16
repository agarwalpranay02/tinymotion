"use client";

export type ClipInfo = {
  id: string;
  subject: number;
  samples: number;
  rate: number;
  accScale: number;
  gyroScale: number;
  segments: { start: number; length: number; label: number }[];
};

export type Clip = ClipInfo & {
  /** total acceleration in g, (samples x 3) */
  acc: Float32Array;
  /** angular velocity in rad/s, (samples x 3) */
  gyro: Float32Array;
  labels: Uint8Array;
};

let indexPromise: Promise<ClipInfo[]> | null = null;
export function clipIndex(): Promise<ClipInfo[]> {
  indexPromise ??= fetch("/demo/index.json").then((r) => {
    if (!r.ok) throw new Error("Demo recordings could not be loaded.");
    return r.json().then((j: { clips: ClipInfo[] }) => j.clips);
  });
  return indexPromise;
}

/** Loads one real test-subject recording (int16-packed) and unpacks it. */
export async function loadClip(info: ClipInfo): Promise<Clip> {
  const buf = await fetch(`/demo/${info.id}.bin`).then((r) => {
    if (!r.ok) throw new Error("Demo recording could not be loaded.");
    return r.arrayBuffer();
  });
  const n = info.samples;
  const dv = new DataView(buf);
  const acc = new Float32Array(n * 3), gyro = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      acc[i * 3 + k] = dv.getInt16((i * 6 + k) * 2, true) / info.accScale;
      gyro[i * 3 + k] = dv.getInt16((i * 6 + 3 + k) * 2, true) / info.gyroScale;
    }
  const labels = new Uint8Array(buf, n * 12, n);
  return { ...info, acc, gyro, labels };
}
