"""Rebuilds continuous 50 Hz recordings from UCI HAR's 50%-overlapping test windows."""
import numpy as np, json, sys
d = np.load("data/uci_har_raw.npz")
X, y, s = d["X_test"], d["y_test"], d["s_test"]
segs = []  # list of (subject, total(n,3), gyro(n,3), body(n,3), labels(n))
cur = None
for i in range(len(X)):
    w = X[i]
    cont = cur is not None and s[i] == cur["s"] and np.array_equal(X[i - 1][64:, 6:9], w[:64, 6:9])
    if not cont:
        if cur: segs.append(cur)
        cur = dict(s=int(s[i]), rows=[w], labels=[y[i]] * 128, starts=[0], wlab=[int(y[i])])
    else:
        cur["rows"].append(w[64:]); cur["labels"] += [y[i]] * 64; cur["starts"].append(cur["starts"][-1] + 64); cur["wlab"].append(int(y[i]))
segs.append(cur)
for g in segs:
    g["sig"] = np.concatenate(g["rows"]); del g["rows"]
lens = [len(g["sig"]) for g in segs]
print("segments", len(segs), "samples", sum(lens), "longest", max(lens), "windows covered", sum(len(g["starts"]) for g in segs), "of", len(X))
np.save("data/streams.npy", np.array(segs, dtype=object), allow_pickle=True)
by_subj = {}
for g in segs: by_subj.setdefault(g["s"], []).append(len(g["sig"]))
print({k: (len(v), sum(v)) for k, v in by_subj.items()})
