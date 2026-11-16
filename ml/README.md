# Training and export

Everything needed to reproduce TinyMotion's models and every number on the site.

```bash
pip install -r requirements.txt
python prepare_data.py "path/to/UCI HAR Dataset"   # writes data/uci_har_raw.npz
python streams.py                                   # rebuilds continuous test recordings (data/streams.npy)
python replicate_paper.py                           # the paper's networks, trained the way its notebook does
python train.py --cfg tinymotion --out runs          # 5 seeds each; results stream to runs/<cfg>.jsonl
python train.py --cfg tinymotion_anywhere --out runs
python train.py --cfg paper_mobilenet1d --out runs
python finalize.py                                  # exports into ../apps/web, writes research.json and test fixtures
python make_demo.py                                 # replay clips and the sample CSV for the website
python check_c.py                                   # the shipped C headers against TensorFlow (also runs in CI)
```

Get the dataset from the UCI Machine Learning Repository: Reyes-Ortiz et al. (2012), *Human Activity Recognition Using Smartphones*, [doi:10.24432/C54S4K](https://doi.org/10.24432/C54S4K), CC BY 4.0.

## Protocol

- **Split by person.** UCI's official split: 21 training subjects (7,352 windows), 9 test subjects (2,947 windows).
- **Validation on held-out people.** Subjects 1, 7, 22 and 30, fixed in advance, choose the number of epochs. The model is then retrained on all 21 training subjects for that many epochs.
- **Test once.** The test set is never used for early stopping, checkpoints or tuning.
- **Five seeds.** Every configuration is trained with seeds 0 to 4. The site reports the mean and standard deviation; the shipped model is seed 0, chosen in advance.

## Models

| Config | What it is |
|---|---|
| `tinymotion` | Residual depthwise-separable 1D CNN (35,558 parameters): 5-wide stem, seven depthwise (k=7) + pointwise blocks, three stride-2 stages, global average pooling, dense. AdamW, cosine schedule, label smoothing 0.1, scaling/jitter/time-shift augmentation. |
| `tinymotion_anywhere` | The same network, also trained with random rotations about each window's gravity axis and random mirroring, so it does not depend on how the phone sits in a pocket. Used by the Live page. |
| `paper_mobilenet1d` | The MobileNet1D from the WCAIAA 2026 paper's notebook, unchanged, trained under the protocol above. |

## Export and verification (`export.py`)

BatchNorm is folded into the preceding convolution, and the network is written as a small op program (`model.json` + `weights.bin`). The same program drives the browser engine (`apps/web/src/lib/engine/model.ts`) and is generated as dependency-free C (`tinymotion.h`). On export, on the full test set:

- a NumPy reference of the engine, the gcc-compiled C code and the float32 TensorFlow Lite model are compared with Keras;
- the full-integer INT8 TensorFlow Lite model is calibrated on 300 training windows and evaluated;
- all results are written into `model.json`, which is where the website reads every number it shows.

## Live pipeline (`finalize.py`)

A phone has to separate gravity itself. The check re-runs all test windows with body acceleration computed by the same causal 3rd-order 0.3 Hz Butterworth filter the website uses, instead of the dataset's precomputed signal, and reports both accuracies.
