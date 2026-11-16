"use client";

import { useState } from "react";
import { MODELS, type ModelId } from "@/lib/activities";
import { loadModel } from "@/lib/engine/load";

type Row = { id: ModelId; median: number; p95: number; perSec: number };

/** Times each model on this device: 300 windows after a warm-up, single thread, no WebAssembly. */
export function Benchmark() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setRows([]);
    const out: Row[] = [];
    for (const m of MODELS) {
      const model = await loadModel(m.id);
      const x = new Float32Array(128 * 9).map(() => Math.random() - 0.5);
      for (let i = 0; i < 30; i++) model.logits(x);
      const t: number[] = [];
      for (let i = 0; i < 300; i++) {
        const a = performance.now();
        model.logits(x);
        t.push(performance.now() - a);
        if (i % 50 === 0) await new Promise((r) => setTimeout(r)); // keep the page responsive
      }
      t.sort((a, b) => a - b);
      const median = t[150];
      out.push({ id: m.id, median, p95: t[285], perSec: 1000 / median });
      setRows([...out]);
    }
    setBusy(false);
  };
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="t-h3">Benchmark on this device</h3>
          <p className="t-small muted mt-1">Times one 2.56-second window, 300 times per model, in plain JavaScript.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Running…" : rows.length ? "Run again" : "Run benchmark"}</button>
      </div>
      <table className="mt-5 w-full text-left text-[0.95rem]">
        <caption className="sr-only">Inference time per window on this device</caption>
        <thead>
          <tr className="faint text-[0.8rem]">
            <th className="py-2 font-[500]">Model</th>
            <th className="py-2 text-right font-[500]">Median</th>
            <th className="py-2 text-right font-[500]">95th pct</th>
            <th className="py-2 text-right font-[500]">Windows / s</th>
          </tr>
        </thead>
        <tbody>
          {MODELS.map((m) => {
            const r = rows.find((x) => x.id === m.id);
            return (
              <tr key={m.id} className="border-t border-dashed border-[var(--rule)]">
                <td className="py-2.5">{m.title}</td>
                <td className="mono num py-2.5 text-right">{r ? `${r.median.toFixed(2)} ms` : "–"}</td>
                <td className="mono num py-2.5 text-right">{r ? `${r.p95.toFixed(2)} ms` : "–"}</td>
                <td className="mono num py-2.5 text-right">{r ? Math.round(r.perSec).toLocaleString("en") : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
