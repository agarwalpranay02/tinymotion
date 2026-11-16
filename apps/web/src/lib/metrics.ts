import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MODELS, type ModelId } from "./activities";
import type { ModelFile, ModelMeta } from "./engine/model";
import { MODEL_VERSION } from "./engine/version";

/** Verified metrics written by the export step (ml/export.py). Every number on the site comes from here. */
export function modelMeta(id: ModelId): ModelMeta {
  const file = path.join(process.cwd(), "public", "models", MODEL_VERSION, id, "model.json");
  return (JSON.parse(readFileSync(file, "utf8")) as ModelFile).meta;
}

export function modelProgram(id: ModelId): ModelFile["program"] {
  const file = path.join(process.cwd(), "public", "models", MODEL_VERSION, id, "model.json");
  return (JSON.parse(readFileSync(file, "utf8")) as ModelFile).program;
}

export const allModels = () => MODELS.map((m) => ({ ...m, meta: modelMeta(m.id) }));

/** Facts from the research pipeline that are not tied to one model. */
export type ResearchFacts = {
  pipeline_check: { official: number; live_pipeline: number; n: number; model: ModelId };
  paper_protocol: Record<string, { params: number; accuracy: number; tflite_fp32_kb: number; tflite_int8_dynamic_kb: number; macro_auc: number }>;
  per_seed: Record<string, { seed: number; accuracy: number; rotated: number; macro_f1: number }[]>;
};

export function researchFacts(): ResearchFacts {
  const file = path.join(process.cwd(), "public", "models", MODEL_VERSION, "research.json");
  return JSON.parse(readFileSync(file, "utf8")) as ResearchFacts;
}

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
