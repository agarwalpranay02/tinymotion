/**
 * TinyMotion inference engine: runs an exported op program in plain TypeScript.
 * The same program is generated as C (tinymotion.h) and checked against TensorFlow on the
 * whole UCI HAR test set during export, so all three implementations agree.
 */

export type Op =
  | { op: "conv"; inp: string; out: string; k: number; cin: number; cout: number; stride: number; pad: [number, number]; tin: number; tout: number; relu: boolean; w: number; b: number }
  | { op: "dw"; inp: string; out: string; k: number; c: number; stride: number; pad: [number, number]; tin: number; tout: number; relu: boolean; w: number; b: number }
  | { op: "affine"; inp: string; out: string; c: number; t: number; relu?: boolean; w: number; b: number }
  | { op: "relu"; inp: string; out: string; n: number }
  | { op: "add"; inp: string; inp2: string; out: string; n: number; relu: boolean }
  | { op: "gap"; inp: string; out: string; t: number; c: number }
  | { op: "dense"; inp: string; out: string; cin: number; cout: number; w: number; b: number };

export type ModelMeta = {
  name: string;
  title: string;
  classes: string[];
  window: number;
  rate_hz: number;
  channels: string[];
  norm: { mean: number[]; std: number[] };
  gravity_reference: number[];
  filters: { gravity_sos: number[][]; noise_sos: number[][] };
  params: number;
  weights_floats: number;
  metrics: {
    test_accuracy: number;
    test_macro_f1: number;
    test_macro_auc: number;
    confusion: number[][];
    rotated_accuracy: number;
    seeds: number;
    mean_accuracy: number;
    std_accuracy: number;
    mean_rotated_accuracy: number;
    std_rotated_accuracy: number;
    best_epoch: number;
    shipped_seed: number;
  };
  formats: Record<string, { accuracy: number; bytes?: number; max_abs_diff_vs_keras?: number; ops?: string[]; input_scale?: number; input_zero_point?: number; output_scale?: number; output_zero_point?: number }>;
  c_scratch_floats?: number;
};

export type ModelFile = { meta: ModelMeta; program: { ops: Op[]; output: string; max_elems: number } };

export class Model {
  readonly meta: ModelMeta;
  private readonly ops: Op[];
  private readonly output: string;
  private readonly w: Float32Array;

  constructor(file: ModelFile, weights: Float32Array) {
    this.meta = file.meta;
    this.ops = file.program.ops;
    this.output = file.program.output;
    this.w = weights;
    if (weights.length !== file.meta.weights_floats) throw new Error(`Weights length ${weights.length} does not match model (${file.meta.weights_floats}).`);
  }

  /** window: Float32Array of 128 x 9 raw values (UCI units), time-major. Returns logits. */
  logits(window: Float32Array): Float32Array {
    const { mean, std } = this.meta.norm;
    const C = mean.length;
    const x = new Float32Array(window.length);
    for (let i = 0; i < window.length; i++) x[i] = (window[i] - mean[i % C]) / std[i % C];
    const env = new Map<string, Float32Array>([["input", x]]);
    const W = this.w;
    for (const op of this.ops) {
      const a = env.get(op.inp)!;
      let y: Float32Array;
      switch (op.op) {
        case "conv": {
          y = new Float32Array(op.tout * op.cout);
          for (let t = 0; t < op.tout; t++)
            for (let o = 0; o < op.cout; o++) {
              let acc = W[op.b + o];
              for (let j = 0; j < op.k; j++) {
                const ti = t * op.stride + j - op.pad[0];
                if (ti < 0 || ti >= op.tin) continue;
                const xi = ti * op.cin;
                const wj = op.w + j * op.cin * op.cout + o;
                for (let c = 0; c < op.cin; c++) acc += a[xi + c] * W[wj + c * op.cout];
              }
              y[t * op.cout + o] = op.relu && acc < 0 ? 0 : acc;
            }
          break;
        }
        case "dw": {
          y = new Float32Array(op.tout * op.c);
          for (let t = 0; t < op.tout; t++)
            for (let ch = 0; ch < op.c; ch++) {
              let acc = W[op.b + ch];
              for (let j = 0; j < op.k; j++) {
                const ti = t * op.stride + j - op.pad[0];
                if (ti >= 0 && ti < op.tin) acc += a[ti * op.c + ch] * W[op.w + j * op.c + ch];
              }
              y[t * op.c + ch] = op.relu && acc < 0 ? 0 : acc;
            }
          break;
        }
        case "affine": {
          y = new Float32Array(op.t * op.c);
          for (let i = 0; i < y.length; i++) {
            const v = a[i] * W[op.w + (i % op.c)] + W[op.b + (i % op.c)];
            y[i] = op.relu && v < 0 ? 0 : v;
          }
          break;
        }
        case "relu": {
          y = new Float32Array(op.n);
          for (let i = 0; i < op.n; i++) y[i] = a[i] < 0 ? 0 : a[i];
          break;
        }
        case "add": {
          const b = env.get(op.inp2)!;
          y = new Float32Array(op.n);
          for (let i = 0; i < op.n; i++) {
            const v = a[i] + b[i];
            y[i] = op.relu && v < 0 ? 0 : v;
          }
          break;
        }
        case "gap": {
          y = new Float32Array(op.c);
          for (let t = 0; t < op.t; t++) for (let c = 0; c < op.c; c++) y[c] += a[t * op.c + c];
          for (let c = 0; c < op.c; c++) y[c] /= op.t;
          break;
        }
        case "dense": {
          y = new Float32Array(op.cout);
          for (let o = 0; o < op.cout; o++) {
            let s = W[op.b + o];
            for (let c = 0; c < op.cin; c++) s += a[c] * W[op.w + c * op.cout + o];
            y[o] = s;
          }
          break;
        }
      }
      env.set(op.out, y);
    }
    return env.get(this.output)!;
  }

  /** Class probabilities for one window. */
  predict(window: Float32Array): Float32Array {
    return softmax(this.logits(window));
  }
}

export function softmax(z: Float32Array): Float32Array {
  let m = -Infinity;
  for (const v of z) m = Math.max(m, v);
  const e = new Float32Array(z.length);
  let s = 0;
  for (let i = 0; i < z.length; i++) s += e[i] = Math.exp(z[i] - m);
  for (let i = 0; i < z.length; i++) e[i] /= s;
  return e;
}

/** Decodes little-endian float32 weights (works the same in browsers and Node). */
export function decodeWeights(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  const out = new Float32Array(buf.byteLength / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}
