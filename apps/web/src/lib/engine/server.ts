import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeWeights, Model, type ModelFile } from "./model";
import type { ModelId } from "@/lib/activities";
import { MODEL_VERSION } from "./version";

const cache = new Map<string, Promise<Model>>();

/** Loads a shipped model on the server from the files that are also served to browsers. */
export function loadServerModel(id: ModelId): Promise<Model> {
  let p = cache.get(id);
  if (!p) {
    const dir = path.join(process.cwd(), "public", "models", MODEL_VERSION, id);
    p = Promise.all([readFile(path.join(dir, "model.json"), "utf8"), readFile(path.join(dir, "weights.bin"))]).then(([json, bin]) => {
      const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
      return new Model(JSON.parse(json) as ModelFile, decodeWeights(ab));
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
