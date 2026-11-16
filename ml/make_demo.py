"""Builds homepage replay clips and a sample CSV from real UCI HAR test-subject recordings."""
import numpy as np, json, os
OUT = "../apps/web/public/demo"; os.makedirs(OUT, exist_ok=True)
segs = np.load("data/streams.npy", allow_pickle=True)
ORDER = [0, 1, 2, 4, 3, 5]  # walking, up, down, standing, sitting, lying
SA, SG = 8000, 4000  # int16 scales: acc in g, gyro in rad/s
index = []
for subj in (9, 13, 24):
    mine = [g for g in segs if g["s"] == subj]
    parts = []
    for act in ORDER:
        bouts = [g for g in mine if g["wlab"][0] == act]
        b = max(bouts, key=lambda g: len(g["sig"]))  # the longest bout of this activity
        n = min(len(b["sig"]), 1300)  # cap at 26 s per activity
        parts.append((act, b["sig"][:n]))
    sig = np.concatenate([p[1] for p in parts]); lab = np.concatenate([[a] * len(p) for a, p in parts]).astype(np.uint8)
    six = np.concatenate([sig[:, 6:9] * SA, sig[:, 3:6] * SG], 1)  # total acc (g), gyro (rad/s)
    q = np.clip(np.round(six), -32768, 32767).astype("<i2")
    open(f"{OUT}/subject-{subj}.bin", "wb").write(q.tobytes() + lab.tobytes())
    starts = np.cumsum([0] + [len(p[1]) for p in parts[:-1]]).tolist()
    index.append(dict(id=f"subject-{subj}", subject=subj, samples=len(sig), rate=50, accScale=SA, gyroScale=SG,
                      segments=[dict(start=s, length=len(p), label=int(a)) for s, (a, p) in zip(starts, parts)]))
    if subj == 9:  # sample CSV for Analyze: m/s^2 including gravity, rad/s, in the study's device frame
        t = np.arange(len(sig)) * 20
        rows = ["time_ms,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,label"]
        names = ["walking", "walking_upstairs", "walking_downstairs", "sitting", "standing", "laying"]
        for i in range(len(sig)):
            a = sig[i, 6:9] * 9.80665; g = sig[i, 3:6]
            rows.append(f"{t[i]},{a[0]:.4f},{a[1]:.4f},{a[2]:.4f},{g[0]:.5f},{g[1]:.5f},{g[2]:.5f},{names[lab[i]]}")
        open(f"{OUT}/sample-recording.csv", "w").write("\n".join(rows) + "\n")
json.dump(dict(source="UCI HAR test subjects (CC BY 4.0), reconstructed from 50%-overlapping windows", clips=index), open(f"{OUT}/index.json", "w"), indent=1)
for c in index: print(c["id"], c["samples"], "samples", round(c["samples"] / 50), "s", [s["length"] for s in c["segments"]])
