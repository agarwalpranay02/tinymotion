"use client";

import { useCallback, useMemo, useState } from "react";
import { ACTIVITIES } from "@/lib/activities";
import { guessMapping, guessUnits, parseCsv, type Mapping, type Parsed, type Units } from "@/lib/csv";
import { loadModel } from "@/lib/engine/load";
import { calibrate, IDENTITY, Pipeline, type Vec3 } from "@/lib/engine/pipeline";
import { download } from "@/lib/sensors";
import { Legend, Ribbon, type RibbonItem } from "./viz";

type Align = "auto" | "study";
type Result = { items: RibbonItem[]; truth: RibbonItem[]; seconds: number; samples: number; rate: number; correct: number; scored: number; confusion: number[][]; note?: string };

const HOP = 25;
const MAX_BYTES = 60 * 1024 * 1024;
const LABEL_ALIASES: Record<string, number> = { walking: 0, walk: 0, walking_upstairs: 1, upstairs: 1, up: 1, walking_downstairs: 2, downstairs: 2, down: 2, sitting: 3, sit: 3, standing: 4, stand: 4, laying: 5, lying: 5, lie: 5 };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Analyzer() {
  const [file, setFile] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [units, setUnits] = useState<Units | null>(null);
  const [align, setAlign] = useState<Align>("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);

  const load = useCallback(async (name: string, text: string, alignHint?: Align) => {
    setError(null);
    setRes(null);
    try {
      const parsed = parseCsv(text);
      if (parsed.rows.length < 200) throw new Error("The recording is too short. At least 4 seconds of data is needed.");
      const m = guessMapping(parsed.header);
      setFile({ name, parsed });
      setMap(m);
      setUnits(guessUnits(parsed, m));
      if (alignHint) setAlign(alignHint);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("That file is larger than 60 MB. Split it into shorter recordings.");
    await load(f.name, await f.text());
  };

  const analyse = async () => {
    if (!file || !map || !units) return;
    setBusy(true);
    setError(null);
    try {
      const model = await loadModel("tinymotion-anywhere");
      const rows = file.parsed.rows;
      const num = (r: string[], i: number) => Number(r[i]);
      const samples = rows
        .map((r) => ({
          t: num(r, map.time) * units.timeScaleMs,
          acc: map.acc.map((i) => num(r, i) * units.accScale) as Vec3,
          gyro: (map.gyro ? map.gyro.map((i) => num(r, i) * units.gyroScale) : [0, 0, 0]) as Vec3,
          label: map.label !== null ? LABEL_ALIASES[(r[map.label] ?? "").toLowerCase()] : undefined,
        }))
        .filter((s) => Number.isFinite(s.t) && s.acc.every(Number.isFinite) && s.gyro.every(Number.isFinite))
        .sort((a, b) => a.t - b.t);
      if (samples.length < 200) throw new Error("Too few readable rows. Check the column choices below.");
      const t0 = samples[0].t;
      const seconds = (samples[samples.length - 1].t - t0) / 1000;
      let rotation = IDENTITY;
      let note: string | undefined;
      if (align === "auto") {
        const head = samples.filter((s) => s.t - t0 < 3000).map((s) => s.acc);
        const c = calibrate(head, model.meta.gravity_reference);
        rotation = c.rotation;
        if (c.stillness > 0.08) note = "The first 3 seconds were not still, so the phone's orientation may be estimated poorly. Results for sitting, standing and lying are less reliable.";
      }
      const pipe = new Pipeline({ gravitySos: model.meta.filters.gravity_sos, noiseSos: model.meta.filters.noise_sos, rotation, hop: HOP });
      const items: RibbonItem[] = [], truth: RibbonItem[] = [];
      const confusion = ACTIVITIES.map(() => ACTIVITIES.map(() => 0));
      let correct = 0, scored = 0;
      let i = 0;
      for (const s of samples) {
        for (const w of pipe.push(s)) {
          const p = model.predict(w.data);
          let c = 0;
          for (let k = 1; k < 6; k++) if (p[k] > p[c]) c = k;
          const tEnd = (w.tEnd - t0) / 1000;
          items.push({ t0: tEnd - HOP / 50, t1: tEnd, cls: c, conf: p[c] });
          // truth: the label at the window's centre
          while (i < samples.length - 1 && samples[i].t < w.tEnd - 1280) i++;
          const lab = samples[i].label;
          if (lab !== undefined) {
            truth.push({ t0: tEnd - HOP / 50, t1: tEnd, cls: lab });
            confusion[lab][c]++;
            scored++;
            if (lab === c) correct++;
          }
        }
      }
      if (!items.length) throw new Error("No complete 2.56-second windows were found. Is the time column right?");
      setRes({ items, truth, seconds, samples: samples.length, rate: samples.length / Math.max(seconds, 1e-3), correct, scored, confusion, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => (res ? ACTIVITIES.map((_, k) => res.items.filter((x) => x.cls === k).length * (HOP / 50)) : []), [res]);
  const colSelect = (value: number, onChange: (v: number) => void, label: string, allowNone = false) => (
    <label className="block text-[0.85rem]">
      <span className="faint">{label}</span>
      <select className="field mt-1 !min-h-[2.5rem] text-[0.9rem]" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {allowNone && <option value={-1}>None</option>}
        {file?.parsed.header.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-6">
      <div
        className={`panel grid place-items-center gap-4 border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-[var(--accent)] bg-[var(--surface-2)]" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
      >
        <p className="t-h3">Drop a sensor recording (CSV)</p>
        <p className="muted max-w-lg text-[0.95rem]">A time column plus accelerometer x, y, z (including gravity) and, ideally, gyroscope x, y, z. Recordings from TinyMotion&apos;s Live and Record pages work as they are. The file is read on this device and never uploaded.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <label className="btn btn-primary cursor-pointer">
            Choose a file
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn btn-ghost" onClick={async () => load("sample-recording.csv", await (await fetch("/demo/sample-recording.csv")).text(), "study")}>
            Try a sample recording
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-[#ff8a7a]/40 bg-[#ff8a7a]/10 px-4 py-3">{error}</p>}

      {file && map && units && (
        <div className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-h3">{file.name}</h2>
            <span className="mono faint text-[0.8rem]">{file.parsed.rows.length.toLocaleString("en")} rows · {file.parsed.header.length} columns</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {colSelect(map.time, (v) => setMap({ ...map, time: v }), "Time")}
            {(["x", "y", "z"] as const).map((ax, k) => (
              <div key={ax}>{colSelect(map.acc[k], (v) => { const acc = [...map.acc] as Mapping["acc"]; acc[k] = v; setMap({ ...map, acc }); }, `Acceleration ${ax}`)}</div>
            ))}
            {(["x", "y", "z"] as const).map((ax, k) => (
              <div key={ax}>{colSelect(map.gyro ? map.gyro[k] : -1, (v) => { const g = [...(map.gyro ?? [-1, -1, -1])] as [number, number, number]; g[k] = v; setMap({ ...map, gyro: g.every((x) => x >= 0) ? g : null }); }, `Rotation ${ax}`, true)}</div>
            ))}
            {colSelect(map.label ?? -1, (v) => setMap({ ...map, label: v < 0 ? null : v }), "Activity label (optional)", true)}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block text-[0.85rem]">
              <span className="faint">Time unit</span>
              <select className="field mt-1 !min-h-[2.5rem] text-[0.9rem]" value={units.timeScaleMs} onChange={(e) => setUnits({ ...units, timeScaleMs: Number(e.target.value) })}>
                <option value={1000}>seconds</option><option value={1}>milliseconds</option><option value={0.001}>microseconds</option><option value={0.000001}>nanoseconds</option>
              </select>
            </label>
            <label className="block text-[0.85rem]">
              <span className="faint">Acceleration unit</span>
              <select className="field mt-1 !min-h-[2.5rem] text-[0.9rem]" value={units.accScale} onChange={(e) => setUnits({ ...units, accScale: Number(e.target.value) })}>
                <option value={1}>m/s²</option><option value={9.80665}>g</option>
              </select>
            </label>
            <label className="block text-[0.85rem]">
              <span className="faint">Rotation unit</span>
              <select className="field mt-1 !min-h-[2.5rem] text-[0.9rem]" value={units.gyroScale} onChange={(e) => setUnits({ ...units, gyroScale: Number(e.target.value) })}>
                <option value={1}>rad/s</option><option value={Math.PI / 180}>deg/s</option>
              </select>
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className="faint text-[0.85rem]">Phone orientation</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="inline-flex items-center gap-2"><input type="radio" name="align" checked={align === "auto"} onChange={() => setAlign("auto")} /> Line up from the first 3 seconds (stand still at the start)</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="align" checked={align === "study"} onChange={() => setAlign("study")} /> Already in the study&apos;s frame</label>
            </div>
          </fieldset>
          {!map.gyro && <p className="t-small mt-4 text-[#f3b56b]">No gyroscope columns were found. The model can still run, but expect lower accuracy, especially on stairs.</p>}
          <button type="button" className="btn btn-primary mt-6" onClick={analyse} disabled={busy}>{busy ? "Analysing…" : "Analyse recording"}</button>
        </div>
      )}

      {res && (
        <div className="panel space-y-5 p-5 sm:p-6" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="t-h3">Timeline</h2>
            <span className="mono faint text-[0.8rem]">{fmt(res.seconds)} · {res.samples.toLocaleString("en")} readings · {res.rate.toFixed(0)} Hz</span>
          </div>
          {res.note && <p className="t-small text-[#f3b56b]">{res.note}</p>}
          {res.truth.length > 0 && <Ribbon items={res.truth} label="Labels in the file" total={res.seconds} />}
          <Ribbon items={res.items} label="What the model says" total={res.seconds} />
          <Legend />
          <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {ACTIVITIES.map((a, k) => (
              <div key={a.id} className="spec"><dt>{a.label}</dt><dd>{fmt(totals[k])}</dd></div>
            ))}
          </dl>
          {res.scored > 0 && (
            <p className="text-[1.05rem]">
              Agreement with the file&apos;s labels: <span className="mono num font-[650]">{((res.correct / res.scored) * 100).toFixed(1)}%</span> of {res.scored.toLocaleString("en")} decisions.
            </p>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => download("tinymotion-analysis.csv", ["start_s,end_s,activity,confidence", ...res.items.map((x) => `${x.t0.toFixed(2)},${x.t1.toFixed(2)},${ACTIVITIES[x.cls].id},${(x.conf ?? 0).toFixed(3)}`)].join("\n") + "\n")}>
            Download timeline (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
