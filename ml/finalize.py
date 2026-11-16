"""Exports the three shipped models into the website and writes research.json and test fixtures."""
import json, os, subprocess, sys
PREVIEW = "--preview" in sys.argv
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import tensorflow as tf
from scipy import signal

SITE = "../apps/web"
OUT = f"{SITE}/public/models/2026.11"
RUNS = "runs"
NAMES = {"tinymotion_anywhere": ("tinymotion-anywhere", "TinyMotion Anywhere"),
         "tinymotion": ("tinymotion-study", "TinyMotion Study"),
         "paper_mobilenet1d": ("paper-mobilenet1d", "Paper MobileNet1D")}
os.makedirs(OUT, exist_ok=True)

per_seed = {}
for cfg, (mid, title) in NAMES.items():
    src = cfg
    if PREVIEW and not os.path.exists(f"{RUNS}/{cfg}_seed0.keras"):
        src = "tinymotion"  # local preview only: stand-in until this model finishes training
    rows = [json.loads(l) for l in open(f"{RUNS}/{src}.jsonl")]
    rows = sorted({r["seed"]: r for r in rows}.values(), key=lambda r: r["seed"])  # one row per seed
    if not PREVIEW:
        assert [r["seed"] for r in rows] == [0, 1, 2, 3, 4], (cfg, [r["seed"] for r in rows])
    json.dump(rows, open(f"/tmp/{cfg}_summary.json", "w"))
    per_seed[mid] = [dict(seed=r["seed"], accuracy=r["test"]["accuracy"], rotated=r["test_rotated"]["accuracy"], macro_f1=r["test"]["macro_f1"]) for r in rows]
    subprocess.run([sys.executable, "export.py", "--model", f"{RUNS}/{src}_seed0.keras", "--norm", f"{RUNS}/{src}_seed0_norm.npz",
                    "--name", mid, "--title", title, "--summary", f"/tmp/{cfg}_summary.json", "--out", OUT], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    m = json.load(open(f"{OUT}/{mid}/model.json"))["meta"]
    print(mid, "params", m["params"], {k: round(v["accuracy"], 4) for k, v in m["formats"].items()})

# live pipeline check for the model the live page uses
d = np.load("data/uci_har_raw.npz")
segs = np.load("data/streams.npy", allow_pickle=True)
model = tf.keras.models.load_model(f"{RUNS}/tinymotion_anywhere_seed0.keras")
nz = np.load(f"{RUNS}/tinymotion_anywhere_seed0_norm.npz"); mean, std = nz["mean"], nz["std"]
sos = signal.butter(3, 0.3, fs=50, output="sos")
ours, official, labels = [], [], []
for g in segs:
    sig = g["sig"]; total = sig[:, 6:9]
    grav = np.stack([signal.sosfilt(sos, total[:, i], zi=signal.sosfilt_zi(sos) * total[0, i])[0] for i in range(3)], 1)
    rebuilt = np.concatenate([total - grav, sig[:, 3:6], total], 1)
    for st, lab in zip(g["starts"], g["wlab"]):
        ours.append(rebuilt[st:st + 128]); official.append(sig[st:st + 128]); labels.append(lab)
ours, official, labels = map(np.array, (ours, official, labels))
pred = lambda X: model.predict(((X - mean) / std).astype(np.float32), verbose=0, batch_size=512).argmax(1)
check = dict(official=float((pred(official) == labels).mean()), live_pipeline=float((pred(ours) == labels).mean()), n=int(len(labels)), model="tinymotion-anywhere")
print("pipeline check", check)

rep = json.load(open("paper_replication.json"))
paper = {"MobileNet1D (paper code)": rep["MobileNet1D"], "Baseline CNN (paper code)": rep["BaselineCNN"]}
paper = {k: dict(params=v["params"], accuracy=v["accuracy"], tflite_fp32_kb=v["tflite_fp32_kb"], tflite_int8_dynamic_kb=v["tflite_int8_dynamic_kb"], macro_auc=v["macro_auc"]) for k, v in paper.items()}
json.dump(dict(pipeline_check=check, paper_protocol=paper, per_seed=per_seed), open(f"{OUT}/research.json", "w"), indent=1)

# fixtures for the web app's unit tests: raw test windows and TensorFlow's logits for each model
fx = {"windows": d["X_test"][:: 245][:12].tolist(), "labels": d["y_test"][:: 245][:12].tolist(), "logits": {}}
for cfg, (mid, _) in NAMES.items():
    src = cfg if os.path.exists(f"{RUNS}/{cfg}_seed0.keras") else "tinymotion"
    m = tf.keras.models.load_model(f"{RUNS}/{src}_seed0.keras"); n = np.load(f"{RUNS}/{src}_seed0_norm.npz")
    X = ((np.array(fx["windows"], np.float32) - n["mean"]) / n["std"]).astype(np.float32)
    fx["logits"][mid] = m.predict(X, verbose=0).tolist()
os.makedirs(f"{SITE}/tests/fixtures", exist_ok=True)
json.dump(fx, open(f"{SITE}/tests/fixtures/parity.json", "w"))
print("done")
