import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Benchmark } from "@/components/Benchmark";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";
import { MODEL_VERSION } from "@/lib/engine/version";
import { allModels, kb, modelProgram, pct } from "@/lib/metrics";
import { share } from "@/lib/seo";

export const metadata: Metadata = share({
  title: "Model studio: TinyML downloads",
  description: "Download TinyMotion's activity recognition models as dependency-free C, INT8 TensorFlow Lite for microcontrollers, or Keras. Every format is verified against TensorFlow.",
  alternates: { canonical: "/studio" },
});

const OP_NAMES: Record<string, string> = { conv: "Conv1D", dw: "DepthwiseConv1D", add: "Add (residual)", gap: "GlobalAveragePool", dense: "Dense", affine: "Scale and shift", relu: "ReLU" };

export default async function Studio({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const models = allModels();
  const live = models[0];
  const prog = modelProgram(live.id);
  const q = live.meta.formats.tflite_int8;
  const base = (id: string) => `/models/${MODEL_VERSION}/${id}`;
  const files = [
    ["tinymotion.h", "C99 header, float32, no dependencies", "c"],
    ["model_int8.tflite", "TensorFlow Lite, full INT8", "tflite_int8"],
    ["model_int8_data.h", "INT8 model as a C array for TensorFlow Lite Micro", null],
    ["model_fp32.tflite", "TensorFlow Lite, float32", "tflite_fp32"],
    ["model.keras", "Keras 3 model", null],
    ["model.json", "Op program and metadata (used by this site)", null],
  ] as const;

  const cSnippet = `#include "tinymotion.h"

/* One 2.56 s window at 50 Hz, UCI HAR channel order:
   body_acc xyz (g), body_gyro xyz (rad/s), total_acc xyz (g). */
static float raw[TINYMOTION_WINDOW][TINYMOTION_CHANNELS];
static float x[TINYMOTION_WINDOW][TINYMOTION_CHANNELS];

int classify(void) {
  float logits[TINYMOTION_CLASSES];
  tinymotion_normalise(raw, x);
  int best = tinymotion_predict(x, logits);
  /* tinymotion_labels[best] -> "walking", "sitting", ... */
  return best;
}`;
  // TFLite op name -> TFLite Micro registration call. DELEGATE is the desktop interpreter's own node, not part of the file.
  const TFLM: Record<string, string> = { ADD: "AddAdd", CONV_2D: "AddConv2D", DEPTHWISE_CONV_2D: "AddDepthwiseConv2D", EXPAND_DIMS: "AddExpandDims", FULLY_CONNECTED: "AddFullyConnected", MEAN: "AddMean", RESHAPE: "AddReshape", SOFTMAX: "AddSoftmax", QUANTIZE: "AddQuantize", DEQUANTIZE: "AddDequantize" };
  const tflmOps = (q.ops ?? []).filter((o) => o !== "DELEGATE").map((o) => TFLM[o] ?? `/* ${o} */ AddBuiltin`);
  const tflmSnippet = `#include "model_int8_data.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"

constexpr int kArenaSize = 64 * 1024;  // tune for your board
alignas(16) static uint8_t arena[kArenaSize];

const tflite::Model* model = tflite::GetModel(tinymotion_int8_tflite);
static tflite::MicroMutableOpResolver<${tflmOps.length}> ops;  // every op in this file:
${tflmOps.map((o) => `ops.${o}();`).join("\n")}
static tflite::MicroInterpreter interp(model, ops, arena, kArenaSize);
interp.AllocateTensors();

// After normalising with the mean/std in model.json:
//   q = round(x / ${q.input_scale?.toPrecision(6)}) + ${q.input_zero_point}   (int8 input)
//   logit = (q_out - ${q.output_zero_point}) * ${q.output_scale?.toPrecision(6)}`;
  const pySnippet = `import numpy as np, tensorflow as tf, json

meta = json.load(open("model.json"))["meta"]
it = tf.lite.Interpreter(model_path="model_fp32.tflite"); it.allocate_tensors()
inp, out = it.get_input_details()[0], it.get_output_details()[0]

window = np.zeros((128, 9), np.float32)   # your 2.56 s window, UCI units
x = (window - meta["norm"]["mean"]) / meta["norm"]["std"]
it.set_tensor(inp["index"], x[None].astype(np.float32)); it.invoke()
print(meta["classes"][int(it.get_tensor(out["index"]).argmax())])`;

  return (
    <>
      <PageHeader kicker="studio · tinyml" title="Take the model with you" sub="Three models, each in every format you need to put activity recognition on a phone, a server or a microcontroller. Every format is run on the full test set and checked against TensorFlow before it ships." />

      <section className="wrap grid gap-8 lg:grid-cols-3" aria-label="Models">
        {models.map((m) => (
          <article key={m.id} className="chip mx-2 flex flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="t-h3">{m.title}</h2>
              {m.live && <span className="tag shrink-0 !text-[var(--color-led)]"><span className="led" aria-hidden="true" />live</span>}
            </div>
            <p className="t-small muted mt-2">{m.blurb}</p>
            <dl className="mt-5 [&_dd]:whitespace-nowrap">
              <div className="spec"><dt>Accuracy, {m.meta.metrics.seeds}-run mean</dt><dd>{(m.meta.metrics.mean_accuracy * 100).toFixed(1)} ± {pct(m.meta.metrics.std_accuracy)}</dd></div>
              <div className="spec"><dt>This file</dt><dd>{pct(m.meta.metrics.test_accuracy)}</dd></div>
              <div className="spec"><dt>Phone rotated</dt><dd>{pct(m.meta.metrics.mean_rotated_accuracy)}</dd></div>
              <div className="spec"><dt>Parameters</dt><dd>{m.meta.params.toLocaleString("en")}</dd></div>
              <div className="spec"><dt>Weights, float32</dt><dd>{kb(m.meta.formats.engine.bytes ?? 0)}</dd></div>
              <div className="spec"><dt>INT8 TFLite</dt><dd>{kb(m.meta.formats.tflite_int8.bytes ?? 0)} · {pct(m.meta.formats.tflite_int8.accuracy)}</dd></div>
              <div className="spec"><dt>C vs TensorFlow</dt><dd>max Δ {m.meta.formats.c.max_abs_diff_vs_keras?.toExponential(1)}</dd></div>
            </dl>
            <ul className="mt-5 space-y-1.5 border-t border-[var(--rule)] pt-4">
              {files.map(([f, label, fmt]) => (
                <li key={f} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.92rem]">
                  <a href={`${base(m.id)}/${f}`} download className="link mono inline-block py-1.5">{f}</a>
                  <span className="faint text-right text-[0.8rem]">{fmt && m.meta.formats[fmt]?.bytes ? kb(m.meta.formats[fmt].bytes!) : label.split(",")[0]}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="wrap pt-16" aria-labelledby="bench">
        <h2 id="bench" className="sr-only">Benchmark</h2>
        <Benchmark />
      </section>

      <section className="wrap grid gap-8 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" aria-labelledby="arch">
        <div>
          <h2 id="arch" className="display t-h2">Inside {live.title}</h2>
          <p className="muted mt-4 measure">
            A residual depthwise-separable 1D CNN: a 5-wide stem, seven blocks of depthwise (kernel 7) and pointwise convolutions, three stride-2 stages, global average pooling and one dense layer. BatchNorm is folded into the convolutions on export, so the deployed model is just the operations on the right.
          </p>
          <dl className="mt-6">
            <div className="spec"><dt>Input</dt><dd>128 × 9 · 2.56 s at 50 Hz</dd></div>
            <div className="spec"><dt>Output</dt><dd>6 logits</dd></div>
            <div className="spec"><dt>C scratch memory</dt><dd>{kb((live.meta.c_scratch_floats ?? 0) * 4)}</dd></div>
            <div className="spec"><dt>C weights in flash</dt><dd>{kb(live.meta.weights_floats * 4)}</dd></div>
            <div className="spec"><dt>TFLite INT8 ops</dt><dd className="!text-[0.82rem]">{q.ops?.join(", ")}</dd></div>
          </dl>
        </div>
        <div className="panel overflow-x-auto p-0">
          <table className="w-full text-left text-[0.9rem]">
            <caption className="sr-only">Deployed operations of {live.title}</caption>
            <thead className="faint text-[0.78rem]">
              <tr className="border-b border-[var(--rule)]"><th className="px-4 py-2.5 font-[500]">#</th><th className="px-2 py-2.5 font-[500]">Operation</th><th className="px-2 py-2.5 font-[500]">Shape out</th><th className="px-4 py-2.5 text-right font-[500]">Kernel / stride</th></tr>
            </thead>
            <tbody className="mono num">
              {prog.ops.map((o, i) => {
                const shape = o.op === "conv" ? `${o.tout} × ${o.cout}` : o.op === "dw" ? `${o.tout} × ${o.c}` : o.op === "gap" ? `${o.c}` : o.op === "dense" ? `${o.cout}` : o.op === "add" ? "same" : "";
                const ks = o.op === "conv" || o.op === "dw" ? `${o.k} / ${o.stride}` : "";
                const relu = o.op !== "relu" && "relu" in o && o.relu ? " + ReLU" : "";
                return (
                  <tr key={i} className="border-t border-dashed border-[var(--rule)]">
                    <td className="px-4 py-1.5 text-[var(--fg-3)]">{i + 1}</td>
                    <td className="px-2 py-1.5 font-sans">{OP_NAMES[o.op]}{relu}</td>
                    <td className="px-2 py-1.5">{shape}</td>
                    <td className="px-4 py-1.5 text-right">{ks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wrap pt-16" aria-labelledby="use">
        <h2 id="use" className="display t-h2">Use it</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {[
            ["C, any microcontroller with an FPU", cSnippet, "Generated from the same program as the browser engine and compiled with gcc -Wall -Wextra -Werror during export; its outputs match TensorFlow on all 2,947 test windows."],
            ["TensorFlow Lite Micro, INT8", tflmSnippet, `Full-integer quantisation calibrated on training windows; ${pct(q.accuracy)} on the test set. Ops and quantisation parameters below come from the exported file.`],
            ["Python, TensorFlow Lite", pySnippet, "Handy for checking your own preprocessing against ours."],
          ].map(([h, code, note]) => (
            <figure key={h} className="min-w-0">
              <figcaption className="mb-2 font-[650]">{h}</figcaption>
              <pre className="codeblock"><code>{code}</code></pre>
              <p className="t-small faint mt-2">{note}</p>
            </figure>
          ))}
          <div className="panel flex flex-col justify-center p-6">
            <p className="font-[650]">From a server or another app</p>
            <p className="muted mt-2">Send windows to the HTTP API and get probabilities back. Free, with a key.</p>
            <Link href="/developers" className="btn btn-ghost mt-5 self-start">API documentation</Link>
          </div>
        </div>
        <p className="t-small faint mt-8 measure">
          The C header and the TFLite files are verified numerically, not on hardware. Preprocessing on a device must match the study&apos;s: 50 Hz, a 20 Hz low-pass, gravity separated with a 3rd-order 0.3 Hz Butterworth (coefficients in model.json), acceleration in g and rotation in rad/s.
        </p>
      </section>
    </>
  );
}
