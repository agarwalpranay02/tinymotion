"""
Exports a trained Keras model into every format TinyMotion ships, and verifies each one.

Outputs (in --out/<name>/):
  model.json        op program + metadata (classes, normalisation, filter, metrics)
  weights.bin       float32 little-endian weights, BatchNorm folded into the preceding layer
  tinymotion.h      dependency-free C99 implementation (float32) generated from the same program
  model_fp32.tflite TensorFlow Lite, float32
  model_int8.tflite TensorFlow Lite, full-integer INT8 (int8 input/output)
  model_int8_data.h the INT8 model as a C array for TensorFlow Lite Micro
  model.keras       the original Keras model
Verification: the op program (NumPy reference of the TS/C engine), the compiled C code and both
TFLite models are run on the full test set and compared with Keras.
"""
import argparse, json, os, shutil, subprocess, sys
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import tensorflow as tf
from scipy import signal
from sklearn.metrics import confusion_matrix

CLASSES = ["walking", "walking_upstairs", "walking_downstairs", "sitting", "standing", "laying"]


# ------------------------------------------------------------------ graph -> op program
def same_pad(n, k, s):
    out = -(-n // s)
    total = max((out - 1) * s + k - n, 0)
    return out, [total // 2, total - total // 2]


def build_program(model):
    weights = []
    def put(a):
        off = sum(w.size for w in weights)
        weights.append(np.asarray(a, np.float32).ravel())
        return off

    producer = {}  # tensor id -> op index
    consumers = {}
    ops = []
    tid = {}  # layer name -> output tensor id
    shapes = {}

    def src(layer):
        ins = layer.input if isinstance(layer.input, list) else [layer.input]
        return [tid[t._keras_history.operation.name] for t in ins]

    for layer in model.layers:
        cls = type(layer).__name__
        name = layer.name
        if cls == "InputLayer":
            tid[name] = "input"; shapes["input"] = (128, 9); continue
        if cls == "Dropout":
            tid[name] = src(layer)[0]; continue
        (i0,) = src(layer)[:1]
        T, C = shapes[i0]
        if cls in ("Conv1D", "DepthwiseConv1D"):
            cfg = layer.get_config()
            k, s = cfg["kernel_size"][0], cfg["strides"][0]
            Tout, pad = same_pad(T, k, s) if cfg["padding"] == "same" else ((T - k) // s + 1, [0, 0])
            W = layer.get_weights()[0]
            b = layer.get_weights()[1] if cfg["use_bias"] else None
            if cls == "Conv1D":
                cout = W.shape[2]; op = dict(op="conv", k=k, cin=C, cout=cout)
                Wf = W.astype(np.float64)
            else:
                cout = C; op = dict(op="dw", k=k, c=C)
                Wf = W[:, :, 0].astype(np.float64)
            op.update(stride=s, pad=pad, tin=T, tout=Tout, relu=cfg["activation"] == "relu",
                      _W=Wf, _b=np.zeros(cout) if b is None else b.astype(np.float64))
            if cfg["activation"] not in ("relu", "linear"):
                raise ValueError(f"unsupported activation {cfg['activation']}")
            out = f"t{len(ops)}"; op.update(inp=i0, out=out); ops.append(op); shapes[out] = (Tout, cout); tid[name] = out
        elif cls == "BatchNormalization":
            g, be, mu, var = [w.astype(np.float64) for w in layer.get_weights()]
            sc = g / np.sqrt(var + layer.epsilon)
            prev = ops[-1] if ops and ops[-1]["out"] == i0 else None
            if prev is not None and prev["op"] in ("conv", "dw") and not prev["relu"]:
                prev["_W"] = prev["_W"] * sc  # scales the output-channel axis (last axis)
                prev["_b"] = (prev["_b"] - mu) * sc + be
                tid[name] = i0
            else:
                out = f"t{len(ops)}"
                ops.append(dict(op="affine", inp=i0, out=out, c=C, t=T, _W=sc, _b=be - mu * sc)); shapes[out] = (T, C); tid[name] = out
        elif cls == "ReLU":
            prev = ops[-1]
            if prev["out"] == i0 and prev["op"] in ("conv", "dw", "add", "affine") and not prev.get("relu"):
                prev["relu"] = True; tid[name] = i0
            else:
                out = f"t{len(ops)}"; ops.append(dict(op="relu", inp=i0, out=out, n=T * C)); shapes[out] = (T, C); tid[name] = out
        elif cls == "Add":
            a, b = src(layer)
            out = f"t{len(ops)}"; ops.append(dict(op="add", inp=a, inp2=b, out=out, n=T * C, relu=False)); shapes[out] = (T, C); tid[name] = out
        elif cls == "GlobalAveragePooling1D":
            out = f"t{len(ops)}"; ops.append(dict(op="gap", inp=i0, out=out, t=T, c=C)); shapes[out] = (1, C); tid[name] = out
        elif cls == "Dense":
            W, b = layer.get_weights()
            out = f"t{len(ops)}"
            ops.append(dict(op="dense", inp=i0, out=out, cin=W.shape[0], cout=W.shape[1], _W=W.astype(np.float64), _b=b.astype(np.float64)))
            shapes[out] = (1, W.shape[1]); tid[name] = out
        else:
            raise ValueError(f"unsupported layer {cls}")

    # A relu may have been fused into a producer after a BN was folded; finalise weights.
    for op in ops:
        if "_W" in op:
            op["w"] = put(op.pop("_W")); op["b"] = put(op.pop("_b"))
    final = tid[model.layers[-1].name]
    buf = np.concatenate(weights).astype("<f4")
    max_elems = max(shapes[o["out"]][0] * shapes[o["out"]][1] for o in ops)
    return dict(ops=ops, output=final, max_elems=int(max(max_elems, 128 * 9))), buf


# ------------------------------------------------------------------ NumPy reference of the engine
def run_program(prog, buf, x):
    """x: (128, 9) normalised. Mirrors the TypeScript and C engines op for op."""
    env = {"input": x.astype(np.float32)}
    W = lambda op, n: buf[op["w"]:op["w"] + n]
    B = lambda op, n: buf[op["b"]:op["b"] + n]
    for op in prog["ops"]:
        a = env[op["inp"]]
        if op["op"] in ("conv", "dw"):
            k, s, (pl, pr) = op["k"], op["stride"], op["pad"]
            ap_ = np.pad(a, ((pl, pr), (0, 0)))
            idx = np.arange(op["tout"])[:, None] * s + np.arange(k)[None, :]
            patches = ap_[idx]  # (tout, k, cin)
            if op["op"] == "conv":
                w = W(op, k * op["cin"] * op["cout"]).reshape(k, op["cin"], op["cout"])
                y = np.einsum("tkc,kco->to", patches, w) + B(op, op["cout"])
            else:
                w = W(op, k * op["c"]).reshape(k, op["c"])
                y = np.einsum("tkc,kc->tc", patches, w) + B(op, op["c"])
        elif op["op"] == "affine":
            y = a * W(op, op["c"]) + B(op, op["c"])
        elif op["op"] == "relu":
            y = a
        elif op["op"] == "add":
            y = a + env[op["inp2"]]
        elif op["op"] == "gap":
            y = a.mean(0, keepdims=True)
        elif op["op"] == "dense":
            y = a @ W(op, op["cin"] * op["cout"]).reshape(op["cin"], op["cout"]) + B(op, op["cout"])
        if op.get("relu") or op["op"] == "relu":
            y = np.maximum(y, 0)
        env[op["out"]] = y.astype(np.float32)
    return env[prog["output"]].ravel()


# ------------------------------------------------------------------ C code generation
def gen_c(prog, buf, meta, name):
    lines = []
    w = lambda s: lines.append(s)
    w(f"/* {name}: generated by TinyMotion. Dependency-free C99, float32.")
    w(" * Input: one window of 128 samples at 50 Hz x 9 channels, in this order:")
    w(" *   body_acc_xyz (g), body_gyro_xyz (rad/s), total_acc_xyz (g), in the UCI HAR device frame.")
    w(" * Call tinymotion_normalise() on the raw window, then tinymotion_predict().")
    w(f" * Output: logits for {len(CLASSES)} classes: " + ", ".join(CLASSES) + ".")
    w(f" * Weights: {buf.size} floats ({buf.size * 4 / 1024:.1f} KB). Scratch RAM: 3 x {prog['max_elems']} floats. */")
    w("#ifndef TINYMOTION_H\n#define TINYMOTION_H\n#include <math.h>\n#include <string.h>\n")
    w(f"#define TINYMOTION_CLASSES {len(CLASSES)}\n#define TINYMOTION_WINDOW 128\n#define TINYMOTION_CHANNELS 9")
    w("static const char *const tinymotion_labels[TINYMOTION_CLASSES] = {" + ", ".join(f'"{c}"' for c in CLASSES) + "};")
    w("static const float tinymotion_mean[9] = {" + ", ".join(f"{v:.9g}f" for v in meta["norm"]["mean"]) + "};")
    w("static const float tinymotion_std[9] = {" + ", ".join(f"{v:.9g}f" for v in meta["norm"]["std"]) + "};")
    w(f"static const float tinymotion_w[{buf.size}] = {{")
    for i in range(0, buf.size, 8):
        w("  " + ", ".join(f"{v:.9g}f" for v in buf[i:i + 8]) + ",")
    w("};")
    w(f"static float tm_buf[3][{prog['max_elems']}];")
    w("""
static inline void tm_conv(const float *x, int tin, int cin, float *y, int tout, int cout, int k, int s, int pl,
                    const float *w, const float *b, int relu) {
  for (int t = 0; t < tout; t++)
    for (int o = 0; o < cout; o++) {
      float acc = b[o];
      for (int j = 0; j < k; j++) {
        int ti = t * s + j - pl;
        if (ti < 0 || ti >= tin) continue;
        const float *xi = x + ti * cin; const float *wj = w + (j * cin) * cout + o;
        for (int c = 0; c < cin; c++) acc += xi[c] * wj[c * cout];
      }
      y[t * cout + o] = relu && acc < 0 ? 0 : acc;
    }
}
static inline void tm_dw(const float *x, int tin, int c, float *y, int tout, int k, int s, int pl,
                  const float *w, const float *b, int relu) {
  for (int t = 0; t < tout; t++)
    for (int ch = 0; ch < c; ch++) {
      float acc = b[ch];
      for (int j = 0; j < k; j++) {
        int ti = t * s + j - pl;
        if (ti >= 0 && ti < tin) acc += x[ti * c + ch] * w[j * c + ch];
      }
      y[t * c + ch] = relu && acc < 0 ? 0 : acc;
    }
}
static inline void tinymotion_normalise(const float raw[TINYMOTION_WINDOW][TINYMOTION_CHANNELS], float out[TINYMOTION_WINDOW][TINYMOTION_CHANNELS]) {
  for (int t = 0; t < TINYMOTION_WINDOW; t++)
    for (int c = 0; c < TINYMOTION_CHANNELS; c++) out[t][c] = (raw[t][c] - tinymotion_mean[c]) / tinymotion_std[c];
}
/* Returns the index of the most likely class; writes logits to out. */
static inline int tinymotion_predict(const float x[TINYMOTION_WINDOW][TINYMOTION_CHANNELS], float out[TINYMOTION_CLASSES]) {""")
    # buffer allocation: map tensor ids to one of 3 scratch buffers (inputs of add need two live tensors)
    loc = {"input": "x0"}
    w("  const float *x0 = &x[0][0];")
    live = {}
    last_use = {}
    for i, op in enumerate(prog["ops"]):
        for key in ("inp", "inp2"):
            if key in op: last_use[op[key]] = i
    free = [0, 1, 2]
    owner = {}
    for i, op in enumerate(prog["ops"]):
        slot = free.pop(0)
        owner[op["out"]] = slot
        o = f"tm_buf[{slot}]"
        a = loc[op["inp"]] if op["inp"] == "input" else f"tm_buf[{owner[op['inp']]}]"
        W = f"tinymotion_w + {op.get('w', 0)}"; B = f"tinymotion_w + {op.get('b', 0)}"
        r = 1 if op.get("relu") else 0
        if op["op"] == "conv":
            w(f"  tm_conv({a}, {op['tin']}, {op['cin']}, {o}, {op['tout']}, {op['cout']}, {op['k']}, {op['stride']}, {op['pad'][0]}, {W}, {B}, {r});")
        elif op["op"] == "dw":
            w(f"  tm_dw({a}, {op['tin']}, {op['c']}, {o}, {op['tout']}, {op['k']}, {op['stride']}, {op['pad'][0]}, {W}, {B}, {r});")
        elif op["op"] == "affine":
            w(f"  for (int i = 0; i < {op['t'] * op['c']}; i++) {{ float v = {a}[i] * ({W})[i % {op['c']}] + ({B})[i % {op['c']}]; {o}[i] = {r} && v < 0 ? 0 : v; }}")
        elif op["op"] == "relu":
            w(f"  for (int i = 0; i < {op['n']}; i++) {o}[i] = {a}[i] < 0 ? 0 : {a}[i];")
        elif op["op"] == "add":
            b2 = f"tm_buf[{owner[op['inp2']]}]"
            w(f"  for (int i = 0; i < {op['n']}; i++) {{ float v = {a}[i] + {b2}[i]; {o}[i] = {r} && v < 0 ? 0 : v; }}")
        elif op["op"] == "gap":
            w(f"  for (int c = 0; c < {op['c']}; c++) {{ float s = 0; for (int t = 0; t < {op['t']}; t++) s += {a}[t * {op['c']} + c]; {o}[c] = s / {op['t']}; }}")
        elif op["op"] == "dense":
            w(f"  for (int o = 0; o < {op['cout']}; o++) {{ float s = ({B})[o]; for (int c = 0; c < {op['cin']}; c++) s += {a}[c] * ({W})[c * {op['cout']} + o]; {o}[o] = s; }}")
        # release inputs that are no longer needed
        for key in ("inp", "inp2"):
            t_ = op.get(key)
            if t_ and t_ != "input" and last_use.get(t_) == i and t_ in owner:
                free.append(owner[t_])
        free.sort()
    outslot = owner[prog["output"]]
    w(f"  int best = 0;\n  for (int i = 0; i < TINYMOTION_CLASSES; i++) {{ out[i] = tm_buf[{outslot}][i]; if (out[i] > out[best]) best = i; }}\n  return best;\n}}")
    w("#endif /* TINYMOTION_H */")
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--norm", required=True)
    ap.add_argument("--name", required=True); ap.add_argument("--title", required=True)
    ap.add_argument("--summary", required=True, help="training summary json (list of seed results)")
    ap.add_argument("--data", default="data/uci_har_raw.npz")
    ap.add_argument("--out", default="exports")
    a = ap.parse_args()
    out = os.path.join(a.out, a.name); os.makedirs(out, exist_ok=True)
    model = tf.keras.models.load_model(a.model)
    nz = np.load(a.norm); mean, std = nz["mean"], nz["std"]
    d = np.load(a.data)
    Xte = ((d["X_test"] - mean) / std).astype(np.float32); yte = d["y_test"]
    Xtr = ((d["X_train"] - mean) / std).astype(np.float32)

    keras_logits = model.predict(Xte, verbose=0, batch_size=512)
    keras_acc = float((keras_logits.argmax(1) == yte).mean())

    prog, buf = build_program(model)
    ref = np.stack([run_program(prog, buf, x) for x in Xte])
    prog_diff = float(np.abs(ref - keras_logits).max())
    prog_acc = float((ref.argmax(1) == yte).mean())

    # gravity reference (standing) and the 0.3 Hz gravity filter, as used by the live pipeline
    stand = d["X_train"][d["y_train"] == 4][:, :, 6:9].mean((0, 1))
    sos = signal.butter(3, 0.3, fs=50, output="sos")
    sos_noise = signal.butter(3, 20, fs=50, output="sos")

    runs = json.load(open(a.summary))
    accs = np.array([r["test"]["accuracy"] for r in runs]); rot = np.array([r["test_rotated"]["accuracy"] for r in runs])
    seed0 = next(r for r in runs if r["seed"] == 0)
    meta = dict(
        name=a.name, title=a.title, classes=CLASSES, window=128, rate_hz=50, channels=["body_acc_x", "body_acc_y", "body_acc_z", "body_gyro_x", "body_gyro_y", "body_gyro_z", "total_acc_x", "total_acc_y", "total_acc_z"],
        units={"acc": "g", "gyro": "rad/s"}, norm=dict(mean=mean.tolist(), std=std.tolist()),
        gravity_reference=(stand / np.linalg.norm(stand)).tolist(),
        filters=dict(gravity_sos=sos.tolist(), noise_sos=sos_noise.tolist()),
        params=int(model.count_params()), weights_floats=int(buf.size),
        metrics=dict(
            shipped_seed=0, test_accuracy=seed0["test"]["accuracy"], test_macro_f1=seed0["test"]["macro_f1"], test_macro_auc=seed0["test"]["macro_auc"],
            confusion=confusion_matrix(yte, keras_logits.argmax(1)).tolist(), rotated_accuracy=seed0["test_rotated"]["accuracy"],
            seeds=len(runs), mean_accuracy=float(accs.mean()), std_accuracy=float(accs.std()),
            mean_rotated_accuracy=float(rot.mean()), std_rotated_accuracy=float(rot.std()), best_epoch=seed0["best_epoch"]),
    )

    # TFLite exports
    conv = tf.lite.TFLiteConverter.from_keras_model(model); fp32 = conv.convert()
    def rep():
        rng = np.random.default_rng(0)
        for i in rng.choice(len(Xtr), 300, replace=False):
            yield [Xtr[i:i + 1]]
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]; conv.representative_dataset = rep
    conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    conv.inference_input_type = tf.int8; conv.inference_output_type = tf.int8
    int8 = conv.convert()

    def tfl_eval(blob, quant):
        it = tf.lite.Interpreter(model_content=blob); it.allocate_tensors()
        i_, o_ = it.get_input_details()[0], it.get_output_details()[0]
        preds = []
        for x in Xte:
            v = x[None]
            if quant:
                s, z = i_["quantization"]; v = np.clip(np.round(v / s + z), -128, 127).astype(np.int8)
            it.set_tensor(i_["index"], v); it.invoke()
            preds.append(it.get_tensor(o_["index"])[0].argmax())
        return float((np.array(preds) == yte).mean())

    open(f"{out}/model_fp32.tflite", "wb").write(fp32); open(f"{out}/model_int8.tflite", "wb").write(int8)
    it8 = tf.lite.Interpreter(model_content=int8); it8.allocate_tensors()
    tfl_ops = sorted({o["op_name"] for o in it8._get_ops_details()} - {"DELEGATE"})  # DELEGATE is the desktop XNNPACK node, not in the file
    qi, qo = it8.get_input_details()[0]["quantization"], it8.get_output_details()[0]["quantization"]
    tfl_fp32_acc, tfl_int8_acc = tfl_eval(fp32, False), tfl_eval(int8, True)
    hexes = ", ".join(f"0x{b:02x}" for b in int8)
    open(f"{out}/model_int8_data.h", "w").write(
        f"/* {a.title}, full-integer INT8 TensorFlow Lite model for TensorFlow Lite Micro. {len(int8)} bytes. */\n"
        f"#include <stdint.h>\nalignas(16) const uint8_t tinymotion_int8_tflite[] = {{{hexes}}};\nconst unsigned int tinymotion_int8_tflite_len = {len(int8)};\n")

    # C engine: generate, compile, run on the whole test set
    csrc = gen_c(prog, buf, meta, a.title)
    open(f"{out}/tinymotion.h", "w").write(csrc)
    np.asarray(Xte, "<f4").tofile("/tmp/tm_x.bin")
    harness = '#include <stdio.h>\n#include "tinymotion.h"\nint main(void){FILE*f=fopen("/tmp/tm_x.bin","rb");float x[128][9],o[6];while(fread(x,sizeof x,1,f)==1){tinymotion_predict(x,o);fwrite(o,sizeof o,1,stdout);}return 0;}\n'
    open(f"{out}/_harness.c", "w").write(harness)
    subprocess.run(["gcc", "-std=c99", "-O2", "-Wall", "-Wextra", "-Werror", "-o", "/tmp/tm_c", f"{out}/_harness.c", "-lm"], check=True)
    c_logits = np.frombuffer(subprocess.run(["/tmp/tm_c"], check=True, capture_output=True).stdout, "<f4").reshape(-1, 6)
    os.remove(f"{out}/_harness.c")
    c_diff = float(np.abs(c_logits - keras_logits).max()); c_acc = float((c_logits.argmax(1) == yte).mean())

    meta["formats"] = dict(
        keras=dict(accuracy=keras_acc),
        engine=dict(accuracy=prog_acc, max_abs_diff_vs_keras=prog_diff, bytes=int(buf.nbytes)),
        c=dict(accuracy=c_acc, max_abs_diff_vs_keras=c_diff, bytes=os.path.getsize(f"{out}/tinymotion.h")),
        tflite_fp32=dict(accuracy=tfl_fp32_acc, bytes=len(fp32)),
        tflite_int8=dict(accuracy=tfl_int8_acc, bytes=len(int8), ops=tfl_ops,
                         input_scale=float(qi[0]), input_zero_point=int(qi[1]), output_scale=float(qo[0]), output_zero_point=int(qo[1])),
    )
    meta["c_scratch_floats"] = int(3 * prog["max_elems"])
    prog_public = dict(ops=prog["ops"], output=prog["output"], max_elems=prog["max_elems"])
    json.dump(dict(meta=meta, program=prog_public), open(f"{out}/model.json", "w"), separators=(",", ":"))
    buf.tofile(f"{out}/weights.bin")
    shutil.copy(a.model, f"{out}/model.keras")
    print(json.dumps(dict(name=a.name, params=meta["params"], formats=meta["formats"]), indent=1))


if __name__ == "__main__":
    main()
