"""CI check: every shipped tinymotion.h compiles warning-free and matches TensorFlow's logits
(stored in the web app's test fixtures) to within 1e-4. Needs only gcc and NumPy."""
import json, pathlib, subprocess, sys, tempfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
fx = json.loads((WEB / "tests" / "fixtures" / "parity.json").read_text())
windows = np.asarray(fx["windows"], "<f4")
version = (WEB / "src" / "lib" / "engine" / "version.ts").read_text().split('"')[1]
harness = r'''#include <stdio.h>
#include "tinymotion.h"
int main(void){float raw[128][9],x[128][9],o[6];while(fread(raw,sizeof raw,1,stdin)==1){tinymotion_normalise(raw,x);tinymotion_predict(x,o);fwrite(o,sizeof o,1,stdout);}return 0;}
'''
failed = False
for model_dir in sorted((WEB / "public" / "models" / version).iterdir()):
    if not (model_dir / "tinymotion.h").exists():
        continue
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "main.c"; src.write_text(harness)
        exe = pathlib.Path(tmp) / "m"
        subprocess.run(["gcc", "-std=c99", "-O2", "-Wall", "-Wextra", "-Werror", "-I", str(model_dir), "-o", str(exe), str(src), "-lm"], check=True)
        out = subprocess.run([str(exe)], input=windows.tobytes(), capture_output=True, check=True).stdout
    logits = np.frombuffer(out, "<f4").reshape(-1, 6)
    diff = float(np.abs(logits - np.asarray(fx["logits"][model_dir.name])).max())
    ok = diff < 1e-4
    failed |= not ok
    print(f"{model_dir.name:22s} max |C - TensorFlow| = {diff:.2e}  {'ok' if ok else 'FAIL'}")
sys.exit(1 if failed else 0)
