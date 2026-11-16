"""Reproduces the paper's MobileNet1D and baseline CNN exactly as the notebook trains them."""
import os, json, numpy as np, tensorflow as tf
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score, average_precision_score
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
tf.keras.utils.set_random_seed(42)
d = np.load("data/uci_har_raw.npz")
Xtr, Xte, ytr, yte = d["X_train"], d["X_test"], d["y_train"], d["y_test"]
mean = Xtr.mean(axis=(0, 1), keepdims=True); std = Xtr.std(axis=(0, 1), keepdims=True) + 1e-8
Xtr, Xte = (Xtr - mean) / std, (Xte - mean) / std
Ytr, Yte = tf.keras.utils.to_categorical(ytr, 6), tf.keras.utils.to_categorical(yte, 6)
L = tf.keras.layers

def mobilenet1d():  # notebook lines 1185-1208
    i = L.Input((128, 9)); x = L.Conv1D(32, 3, padding="same", activation="relu")(i)
    x = L.DepthwiseConv1D(3, padding="same")(x); x = L.BatchNormalization()(x); x = L.ReLU()(x)
    x = L.Conv1D(64, 1, padding="same", activation="relu")(x)
    x = L.DepthwiseConv1D(3, padding="same")(x); x = L.BatchNormalization()(x); x = L.ReLU()(x)
    x = L.Conv1D(128, 1, padding="same", activation="relu")(x); x = L.GlobalAveragePooling1D()(x); x = L.Dropout(0.3)(x)
    return tf.keras.Model(i, L.Dense(6, activation="softmax")(x))

def baseline_cnn():  # notebook lines 268-286
    return tf.keras.Sequential([L.Input((128, 9)), L.Conv1D(32, 3, activation="relu"), L.BatchNormalization(), L.Conv1D(32, 3, activation="relu"),
        L.MaxPooling1D(2), L.Dropout(0.25), L.Conv1D(64, 3, activation="relu"), L.BatchNormalization(), L.MaxPooling1D(2), L.Dropout(0.3),
        L.Flatten(), L.Dense(128, activation="relu"), L.Dropout(0.4), L.Dense(6, activation="softmax")])

out = {}
for name, fn in (("MobileNet1D", mobilenet1d), ("BaselineCNN", baseline_cnn)):
    m = fn(); m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="categorical_crossentropy", metrics=["accuracy"])
    m.fit(Xtr, Ytr, validation_data=(Xte, Yte), epochs=10, batch_size=32, verbose=0)  # as in the notebook: test set used as validation
    p = m.predict(Xte, verbose=0); yp = p.argmax(1)
    conv = tf.lite.TFLiteConverter.from_keras_model(m); fp32 = conv.convert(); conv.optimizations = [tf.lite.Optimize.DEFAULT]; q = conv.convert()
    out[name] = dict(params=int(m.count_params()), accuracy=round(accuracy_score(yte, yp) * 100, 2),
        precision_w=round(precision_score(yte, yp, average="weighted"), 4), recall_w=round(recall_score(yte, yp, average="weighted"), 4), f1_w=round(f1_score(yte, yp, average="weighted"), 4),
        macro_auc=round(roc_auc_score(Yte, p, average="macro"), 4), macro_ap=round(average_precision_score(Yte, p, average="macro"), 4),
        tflite_fp32_kb=round(len(fp32) / 1024, 1), tflite_int8_dynamic_kb=round(len(q) / 1024, 1))
    print(name, out[name], flush=True)
json.dump(out, open("paper_replication.json", "w"), indent=1)
