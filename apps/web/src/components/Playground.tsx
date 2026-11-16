"use client";

import { useState } from "react";
import { ACTIVITIES } from "@/lib/activities";
import { clipIndex, loadClip } from "@/lib/demo";
import { loadModel } from "@/lib/engine/load";
import { G, Pipeline } from "@/lib/engine/pipeline";

/** Sends one real window (from a test-subject recording) to the live API with the visitor's key. */
export function Playground() {
  const [key, setKey] = useState("");
  const [act, setAct] = useState(0);
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const call = async () => {
    setBusy(true);
    setOut("");
    try {
      const [idx, model] = await Promise.all([clipIndex(), loadModel("tinymotion-anywhere")]);
      const clip = await loadClip(idx[0]);
      const seg = clip.segments.find((s) => s.label === act)!;
      // run the real preprocessing over the bout and take a window from its middle
      const pipe = new Pipeline({ gravitySos: model.meta.filters.gravity_sos, noiseSos: model.meta.filters.noise_sos, skipNoiseFilter: true, hop: 64 });
      let win: Float32Array | null = null;
      for (let i = seg.start; i < seg.start + seg.length; i++) {
        const ws = pipe.push({ t: i * 20, acc: [clip.acc[i * 3] * G, clip.acc[i * 3 + 1] * G, clip.acc[i * 3 + 2] * G], gyro: [clip.gyro[i * 3], clip.gyro[i * 3 + 1], clip.gyro[i * 3 + 2]] });
        if (ws.length && i > seg.start + seg.length / 2) { win = ws[0].data; break; }
        if (ws.length) win = ws[0].data;
      }
      if (!win) throw new Error("Could not build a window from the recording.");
      const window = Array.from({ length: 128 }, (_, t) => Array.from(win!.slice(t * 9, t * 9 + 9), (v) => Number(v.toFixed(5))));
      const r = await fetch("/api/v1/classify", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ window }),
      });
      setOut(`HTTP ${r.status}\n` + JSON.stringify(await r.json(), null, 2));
    } catch (e) {
      setOut(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-5 sm:p-6">
      <h2 className="t-h3">Try it</h2>
      <p className="t-small muted mt-1">Paste a key, pick what the volunteer was doing, and send a real 2.56-second window from the test set.</p>
      <label className="mt-4 block text-[0.85rem]">
        <span className="faint">API key</span>
        <input className="field mono mt-1" placeholder="tm_live_…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <label className="mt-3 block text-[0.85rem]">
        <span className="faint">Window taken from</span>
        <select className="field mt-1" value={act} onChange={(e) => setAct(Number(e.target.value))}>
          {ACTIVITIES.map((a, i) => <option key={a.id} value={i}>{a.label}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-primary mt-4" disabled={busy || key.trim().length < 10} onClick={call}>{busy ? "Sending…" : "POST /api/v1/classify"}</button>
      {out && <pre className="codeblock mt-4 max-h-96" aria-live="polite"><code>{out}</code></pre>}
    </div>
  );
}
