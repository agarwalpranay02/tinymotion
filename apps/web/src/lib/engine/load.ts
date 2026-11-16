"use client";
import { decodeWeights, Model, type ModelFile } from "./model";
import type { ModelId } from "@/lib/activities";
import { MODEL_VERSION } from "./version";

const cache = new Map<string, Promise<Model>>();

/** Loads a shipped model in the browser. Files are versioned and cached immutably. */
export function loadModel(id: ModelId): Promise<Model> {
  let p = cache.get(id);
  if (!p) {
    const base = `/models/${MODEL_VERSION}/${id}`;
    p = Promise.all([
      fetch(`${base}/model.json`).then((r) => {
        if (!r.ok) throw new Error(`Model ${id} could not be loaded (${r.status}).`);
        return r.json() as Promise<ModelFile>;
      }),
      fetch(`${base}/weights.bin`).then((r) => {
        if (!r.ok) throw new Error(`Weights for ${id} could not be loaded (${r.status}).`);
        return r.arrayBuffer();
      }),
    ]).then(([file, buf]) => new Model(file, decodeWeights(buf)));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
