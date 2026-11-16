"""
TinyMotion training pipeline for UCI HAR raw inertial signals (128 x 9 windows, 50 Hz).

Protocol
- UCI's official split is by person: 21 training subjects, 9 test subjects.
- Model selection uses 4 training subjects held out as validation. The test set is
  evaluated once per trained model and never used for early stopping or checkpoints.
- Every configuration is trained with 5 seeds; mean and standard deviation are reported.
  The shipped model is seed 0, fixed in advance, not the best seed.

Models
- paper_mobilenet1d: the MobileNet1D from the WCAIAA 2026 paper's notebook, unchanged.
- tinymotion: a residual depthwise-separable 1D CNN designed here.
- tinymotion_anywhere: the same network trained with yaw rotation and mirror augmentation,
  so it does not depend on which way the phone faces (used for the live demo).
"""
import argparse, json, os, time
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
import tensorflow as tf
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, roc_auc_score

L = tf.keras.layers
CLASSES = ["walking", "walking_upstairs", "walking_downstairs", "sitting", "standing", "laying"]
VAL_SUBJECTS = [1, 7, 22, 30]  # 4 of the 21 training subjects, fixed in advance

# ---------------------------------------------------------------- data
def load(path):
    d = np.load(path)
    return {k: d[k] for k in d.files}


def norm_stats(X):
    return X.mean(axis=(0, 1)).astype(np.float32), (X.std(axis=(0, 1)) + 1e-6).astype(np.float32)


def rotation_about(axis, theta):
    a = axis / (np.linalg.norm(axis) + 1e-9)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * K @ K


def augment(Xb, rng, anywhere):
    """Xb: (n, 128, 9) raw (unnormalised) signals: body_acc, body_gyro, total_acc."""
    out = Xb.copy()
    n = len(out)
    if anywhere:
        for i in range(n):
            g = out[i, :, 6:9].mean(0)  # gravity direction of this window
            R = rotation_about(g, rng.uniform(0, 2 * np.pi))
            if rng.random() < 0.5:  # mirror across a vertical plane: covers left/right pockets and sign conventions
                u = np.cross(g, [0.0, 0.0, 1.0] if abs(g[2]) < 0.9 else [0.0, 1.0, 0.0])
                u /= np.linalg.norm(u) + 1e-9
                R = (np.eye(3) - 2 * np.outer(u, u)) @ R
            for s in (0, 3, 6):
                out[i, :, s:s + 3] = out[i, :, s:s + 3] @ R.T
    scale = rng.uniform(0.9, 1.1, size=(n, 1, 1))
    out[:, :, 0:6] *= scale  # dynamic parts only; gravity keeps its magnitude
    out += rng.normal(0, 0.01, size=out.shape).astype(np.float32)
    shift = rng.integers(-16, 17, size=n)
    for i in range(n):
        out[i] = np.roll(out[i], shift[i], axis=0)
    return out.astype(np.float32)


# ---------------------------------------------------------------- models
def paper_mobilenet1d():
    i = L.Input((128, 9))
    x = L.Conv1D(32, 3, padding="same", activation="relu")(i)
    x = L.DepthwiseConv1D(3, padding="same")(x); x = L.BatchNormalization(momentum=0.9)(x); x = L.ReLU()(x)
    x = L.Conv1D(64, 1, padding="same", activation="relu")(x)
    x = L.DepthwiseConv1D(3, padding="same")(x); x = L.BatchNormalization(momentum=0.9)(x); x = L.ReLU()(x)
    x = L.Conv1D(128, 1, padding="same", activation="relu")(x)
    x = L.GlobalAveragePooling1D()(x); x = L.Dropout(0.3)(x)
    return tf.keras.Model(i, L.Dense(6)(x), name="paper_mobilenet1d")


def tinymotion():
    """Residual depthwise-separable 1D CNN. Ops: Conv1D, DepthwiseConv1D, BatchNorm, ReLU, Add, GAP, Dense."""
    def block(x, c_out, stride):
        c_in = x.shape[-1]
        y = L.DepthwiseConv1D(7, strides=stride, padding="same", use_bias=False)(x)
        y = L.BatchNormalization(momentum=0.9)(y); y = L.ReLU()(y)
        y = L.Conv1D(c_out, 1, use_bias=False)(y); y = L.BatchNormalization(momentum=0.9)(y)
        if stride == 1 and c_in == c_out:
            y = L.Add()([x, y])
        return L.ReLU()(y)

    i = L.Input((128, 9))
    x = L.Conv1D(32, 5, padding="same", use_bias=False)(i); x = L.BatchNormalization(momentum=0.9)(x); x = L.ReLU()(x)
    x = block(x, 32, 1)
    x = block(x, 48, 2); x = block(x, 48, 1)
    x = block(x, 64, 2); x = block(x, 64, 1)
    x = block(x, 96, 2); x = block(x, 96, 1)
    x = L.GlobalAveragePooling1D()(x); x = L.Dropout(0.2)(x)
    return tf.keras.Model(i, L.Dense(6)(x), name="tinymotion")


ARCH = {"paper_mobilenet1d": paper_mobilenet1d, "tinymotion": tinymotion, "tinymotion_anywhere": tinymotion}


# ---------------------------------------------------------------- training
def train_one(cfg, seed, data, epochs, out_dir=None, final=False):
    """final=False: train on 17 subjects, select by validation. final=True: retrain on all 21 for the chosen epochs."""
    tf.keras.utils.set_random_seed(seed)
    rng = np.random.default_rng(seed)
    Xtr, ytr, str_ = data["X_train"], data["y_train"], data["s_train"]
    is_val = np.isin(str_, VAL_SUBJECTS)
    Xfit, yfit = (Xtr, ytr) if final else (Xtr[~is_val], ytr[~is_val])
    Xval, yval = Xtr[is_val], ytr[is_val]
    mean, std = norm_stats(Xfit)
    nrm = lambda X: ((X - mean) / std).astype(np.float32)
    anywhere = cfg == "tinymotion_anywhere"
    use_aug = cfg != "paper_mobilenet1d"

    model = ARCH[cfg]()
    steps = int(np.ceil(len(Xfit) / 64)) * epochs
    lr = tf.keras.optimizers.schedules.CosineDecay(2e-3, steps, alpha=0.02) if use_aug else 1e-3
    opt = tf.keras.optimizers.AdamW(lr, weight_decay=1e-3) if use_aug else tf.keras.optimizers.Adam(1e-3)
    loss = tf.keras.losses.CategoricalCrossentropy(from_logits=True, label_smoothing=0.1 if use_aug else 0.0)
    model.compile(optimizer=opt, loss=loss, metrics=["accuracy"])

    hist = []
    best = (-1, None, 0)
    Yfit = tf.keras.utils.to_categorical(yfit, 6)
    for ep in range(epochs):
        Xe = augment(Xfit, rng, anywhere) if use_aug else Xfit
        model.fit(nrm(Xe), Yfit, batch_size=64 if use_aug else 32, epochs=1, verbose=0, shuffle=True)
        if not final:
            va = accuracy_score(yval, model.predict(nrm(Xval), verbose=0, batch_size=512).argmax(1))
            hist.append(va)
            if va > best[0]:
                best = (va, [w.copy() for w in model.get_weights()], ep + 1)
    if not final:
        model.set_weights(best[1])
    return model, dict(mean=mean, std=std, best_val=best[0], best_epoch=best[2], val_curve=hist)


def evaluate(model, data, mean, std, rotate=False, seed=0):
    X = data["X_test"]
    if rotate:  # robustness check: every test window rotated by a random yaw around its own gravity axis
        X = augment(X, np.random.default_rng(1000 + seed), True)
        X = X  # augment also adds small noise/shift/scale; acceptable for a robustness check
    logits = model.predict(((X - mean) / std).astype(np.float32), verbose=0, batch_size=512)
    p = tf.nn.softmax(logits).numpy()
    y = data["y_test"]; yp = p.argmax(1)
    return dict(accuracy=float(accuracy_score(y, yp)), macro_f1=float(f1_score(y, yp, average="macro")),
                macro_auc=float(roc_auc_score(tf.keras.utils.to_categorical(y, 6), p, average="macro")),
                confusion=confusion_matrix(y, yp).tolist()), p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/uci_har_raw.npz")
    ap.add_argument("--cfg", required=True, choices=list(ARCH))
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--out", default="runs")
    a = ap.parse_args()
    data = load(a.data)
    os.makedirs(a.out, exist_ok=True)
    results = []
    for seed in a.seeds:
        t0 = time.time()
        # 1) choose the epoch count on validation subjects
        _, sel = train_one(a.cfg, seed, data, a.epochs)
        # 2) retrain on all 21 training subjects for that many epochs, then test once
        model, info = train_one(a.cfg, seed, data, sel["best_epoch"], final=True)
        r, _ = evaluate(model, data, info["mean"], info["std"])
        rr, _ = evaluate(model, data, info["mean"], info["std"], rotate=True, seed=seed)
        row = dict(cfg=a.cfg, seed=seed, best_epoch=sel["best_epoch"], val_acc=sel["best_val"], test=r,
                   test_rotated=dict(accuracy=rr["accuracy"], macro_f1=rr["macro_f1"]),
                   params=int(model.count_params()), minutes=round((time.time() - t0) / 60, 1))
        results.append(row)
        with open(f"{a.out}/{a.cfg}.jsonl", "a") as fh:  # saved per seed so an interrupted run loses nothing
            fh.write(json.dumps(row) + "\n")
        print(json.dumps({k: (v if k != "test" else {kk: vv for kk, vv in v.items() if kk != "confusion"}) for k, v in row.items()}), flush=True)
        if seed == a.seeds[0]:
            model.save(f"{a.out}/{a.cfg}_seed{seed}.keras")
            np.savez(f"{a.out}/{a.cfg}_seed{seed}_norm.npz", mean=info["mean"], std=info["std"])
    json.dump(results, open(f"{a.out}/{a.cfg}.json", "w"), indent=1)
    acc = np.array([r["test"]["accuracy"] for r in results]); rot = np.array([r["test_rotated"]["accuracy"] for r in results])
    print(f"SUMMARY {a.cfg}: test {acc.mean()*100:.2f} ± {acc.std()*100:.2f}  |  rotated {rot.mean()*100:.2f} ± {rot.std()*100:.2f}  (n={len(acc)})")


if __name__ == "__main__":
    main()
