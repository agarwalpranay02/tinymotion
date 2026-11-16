"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITIES, activityColor } from "@/lib/activities";
import { clipIndex, loadClip, type Clip, type ClipInfo } from "@/lib/demo";
import { loadModel } from "@/lib/engine/load";
import type { Model } from "@/lib/engine/model";
import { G, Pipeline } from "@/lib/engine/pipeline";
import { ActivityGlyph, ProbBars, Ribbon, Trace, type RibbonItem } from "./viz";

const HOP = 25; // a new decision every 0.5 s

/**
 * Replays a real recording of a person the model never saw, through the same pipeline and model
 * the live page uses, and shows the model's call beside the truth.
 */
export function ReplayDemo({ compact = false }: { compact?: boolean }) {
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [state, setState] = useState<{ probs: Float32Array | null; cls: number; truth: number; correct: number; total: number; t: number }>({ probs: null, cls: -1, truth: -1, correct: 0, total: 0, t: 0 });
  const [pred, setPred] = useState<RibbonItem[]>([]);
  const [truth, setTruth] = useState<RibbonItem[]>([]);
  const run = useRef({ i: 0, acc: 0, last: 0, correct: 0, total: 0, pipe: null as Pipeline | null, hist: [] as Float32Array[], trace: [new Float32Array(0), new Float32Array(0), new Float32Array(0)] });

  useEffect(() => {
    let live = true;
    Promise.all([clipIndex(), loadModel("tinymotion-anywhere")])
      .then(async ([idx, m]) => {
        if (!live) return;
        setClips(idx);
        setModel(m);
        setClip(await loadClip(idx[0]));
      })
      .catch((e) => live && setError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, []);

  /** Rewinds the playback state kept outside React (no re-render). */
  const rewind = useCallback(() => {
    if (!model) return;
    run.current = {
      i: 0, acc: 0, last: performance.now(), correct: 0, total: 0, hist: [],
      trace: [new Float32Array(0), new Float32Array(0), new Float32Array(0)],
      pipe: new Pipeline({ gravitySos: model.meta.filters.gravity_sos, noiseSos: model.meta.filters.noise_sos, skipNoiseFilter: true, hop: HOP }),
    };
  }, [model]);

  /** Rewinds and clears what is on screen; called from event handlers and the animation loop. */
  const reset = useCallback(() => {
    rewind();
    setState({ probs: null, cls: -1, truth: -1, correct: 0, total: 0, t: 0 });
    setPred([]);
    setTruth([]);
  }, [rewind]);

  useEffect(rewind, [clip, rewind]);

  useEffect(() => {
    if (!clip || !model || !playing) return;
    let raf = 0;
    run.current.last = performance.now();
    const tick = (now: number) => {
      const r = run.current;
      r.acc += ((now - r.last) / 1000) * 50 * speed;
      r.last = now;
      let steps = Math.min(Math.floor(r.acc), 200);
      r.acc -= steps;
      const traceAdd: number[][] = [[], [], []];
      const newPred: RibbonItem[] = [], newTruth: RibbonItem[] = [];
      let latest: typeof state | null = null;
      while (steps-- > 0) {
        if (r.i >= clip.samples) { r.i = 0; reset(); return; }
        const i = r.i++;
        const acc = [clip.acc[i * 3], clip.acc[i * 3 + 1], clip.acc[i * 3 + 2]];
        for (let k = 0; k < 3; k++) traceAdd[k].push(acc[k] - (k === 0 ? 1 : 0));
        const ws = r.pipe!.push({ t: i * 20, acc: [acc[0] * G, acc[1] * G, acc[2] * G], gyro: [clip.gyro[i * 3], clip.gyro[i * 3 + 1], clip.gyro[i * 3 + 2]] });
        for (const w of ws) {
          const p = model.predict(w.data);
          r.hist.push(p);
          if (r.hist.length > 3) r.hist.shift();
          const avg = new Float32Array(6);
          for (const h of r.hist) for (let k = 0; k < 6; k++) avg[k] += h[k] / r.hist.length;
          let cls = 0;
          for (let k = 1; k < 6; k++) if (avg[k] > avg[cls]) cls = k;
          const tr = clip.labels[i];
          const t = i / 50;
          r.total++;
          if (cls === tr) r.correct++;
          latest = { probs: avg, cls, truth: tr, correct: r.correct, total: r.total, t };
          newPred.push({ t0: t - HOP / 50, t1: t, cls, conf: avg[cls] });
          newTruth.push({ t0: t - HOP / 50, t1: t, cls: tr });
        }
      }
      for (let k = 0; k < 3; k++) {
        const old = r.trace[k];
        const merged = new Float32Array(Math.min(old.length + traceAdd[k].length, 600));
        const all = [...old, ...traceAdd[k]];
        merged.set(all.slice(all.length - merged.length));
        r.trace[k] = merged;
      }
      if (latest) {
        setState(latest);
        setPred((p) => [...p, ...newPred]);
        setTruth((p) => [...p, ...newTruth]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip, model, playing, speed, reset]);

  const source = useCallback(() => run.current.trace, []);
  const a = state.cls >= 0 ? ACTIVITIES[state.cls] : null;
  const t = state.truth >= 0 ? ACTIVITIES[state.truth] : null;
  const total = clip ? clip.samples / 50 : undefined;

  if (error) return <p className="panel p-6 text-[var(--fg-2)]">The demo could not load: {error}</p>;

  return (
    <div className={compact ? "" : "grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"}>
      <div className="panel glow overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] px-4 py-2.5">
          <span className="mono inline-flex items-center gap-2 text-[0.78rem] text-[var(--fg-3)]">
            <span className={playing ? "led" : "led led-off"} aria-hidden="true" />
            {clip ? <>test subject {clip.subject}<span className="hidden sm:inline"> · total acceleration (g)</span> · 50 Hz</> : "loading recording…"}
          </span>
          <span className="mono num text-[0.78rem] text-[var(--fg-3)]">{state.t.toFixed(1)} s</span>
        </div>
        <Trace source={source} range={1.1} labels={["x − 1 g", "y", "z"]} className={compact ? "h-40" : "h-56 sm:h-64"} />
        <div className="border-t border-[var(--rule)] px-4 py-5 sm:px-6">
          <p className="faint text-[0.85rem]">The model says</p>
          <p className="display mt-1 flex items-center gap-3 text-[clamp(2.4rem,7vw,4.6rem)]" aria-live="polite" style={{ color: a ? activityColor(a.id) : "var(--fg-3)" }}>
            {a ? <ActivityGlyph id={a.id} className="h-[0.8em] w-[0.8em] shrink-0" /> : null}
            <span className="text-[var(--fg)]">{a ? a.label : "Listening…"}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.92rem]">
            <span className="muted">
              Truth: <span className="font-[650] text-[var(--fg)]">{t ? t.label : "–"}</span>
              {a && t ? <span className={a.id === t.id ? "ml-2 text-[var(--color-led)]" : "ml-2 text-[#ff8a7a]"}>{a.id === t.id ? "✓ match" : "✗ miss"}</span> : null}
            </span>
            <span className="muted">
              Confidence <span className="mono num text-[var(--fg)]">{state.probs && a ? `${(state.probs[state.cls] * 100).toFixed(0)}%` : "–"}</span>
            </span>
            <span className="muted">
              Agreement so far <span className="mono num text-[var(--fg)]">{state.total ? `${((state.correct / state.total) * 100).toFixed(1)}%` : "–"}</span>
            </span>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="flex flex-col gap-6">
          <div className="panel p-5">
            <ProbBars probs={state.probs} highlight={state.cls} />
          </div>
          <div className="panel space-y-4 p-5">
            <Ribbon items={truth} label="What the person was doing" total={total} />
            <Ribbon items={pred} label="What the model said" total={total} />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
                {playing ? "Pause" : "Play"}
              </button>
              <div role="group" aria-label="Playback speed" className="inline-flex overflow-hidden rounded-md ring-1 ring-[var(--rule-2)]">
                {[1, 2, 4].map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className="mono px-3 py-2 text-[0.85rem] text-[var(--fg-2)] aria-pressed:bg-[var(--surface-2)] aria-pressed:text-[var(--fg)]">
                    {s}×
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="clip">Recording</label>
              <select id="clip" className="field !min-h-[2.4rem] !w-auto text-[0.9rem]" value={clip?.id ?? ""} onChange={async (e) => {
                  const next = await loadClip(clips.find((c) => c.id === e.target.value)!);
                  reset();
                  setClip(next);
                }}>
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>
                    Test subject {c.subject}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
