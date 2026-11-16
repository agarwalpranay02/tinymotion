"""Builds data/uci_har_raw.npz from the official UCI HAR download.

Usage: python prepare_data.py "path/to/UCI HAR Dataset"
Download: https://doi.org/10.24432/C54S4K (CC BY 4.0). Unzip the inner "UCI HAR Dataset.zip".
"""
import os, sys
import numpy as np

root = sys.argv[1] if len(sys.argv) > 1 else "UCI HAR Dataset"
SIGNALS = ["body_acc_x", "body_acc_y", "body_acc_z", "body_gyro_x", "body_gyro_y", "body_gyro_z", "total_acc_x", "total_acc_y", "total_acc_z"]
out = {}
for s in ("train", "test"):
    out[f"X_{s}"] = np.stack([np.loadtxt(os.path.join(root, s, "Inertial Signals", f"{g}_{s}.txt"), dtype=np.float32) for g in SIGNALS], axis=-1)
    out[f"y_{s}"] = np.loadtxt(os.path.join(root, s, f"y_{s}.txt"), dtype=np.int64) - 1
    out[f"s_{s}"] = np.loadtxt(os.path.join(root, s, f"subject_{s}.txt"), dtype=np.int64)
    print(s, out[f"X_{s}"].shape, np.bincount(out[f"y_{s}"]).tolist())
assert out["X_train"].shape == (7352, 128, 9) and out["X_test"].shape == (2947, 128, 9), "unexpected dataset shape"
os.makedirs("data", exist_ok=True)
np.savez_compressed("data/uci_har_raw.npz", **out)
print("wrote data/uci_har_raw.npz")
