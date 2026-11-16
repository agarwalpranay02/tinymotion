"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITIES, activityColor } from "@/lib/activities";
import { loadModel } from "@/lib/engine/load";
import type { Model } from "@/lib/engine/model";
import { calibrate, Pipeline, type RawSample, type Vec3 } from "@/lib/engine/pipeline";
import { checkMotion, download, keepAwake, subscribeMotion, toCsv } from "@/lib/sensors";
import { Link } from "@/i18n/navigation";
import { QrCode } from "./QrCode";
import { ActivityGlyph, Legend, ProbBars, Ribbon, Trace, type RibbonItem } from "./viz";

type Phase = "intro" | "checking" | "nosensor" | "denied" | "calibrating" | "running" | "done";
const HOP = 25;
const CAL_MS = 3000;
const MAX_RAW = 60 * 60 * 120; // keep up to ~1 hour of raw readings for export

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Live() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [model, setModel] = useState<Model | null>(null);
  const [calLeft, setCalLeft] = useState(0);
  const [calNote, setCalNote] = useState<string | null>(null);
  const [probs, setProbs] = useState<Float32Array | null>(null);
  const [cls, setCls] = useState(-1);
  const [items, setItems] = useState<RibbonItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [rawCount, setRawCount] = useState(0);
  const r = useRef({
    stop: () => {},
    release: () => {},
    pipe: null as Pipeline | null,
    raw: [] as RawSample[],
    cal: [] as Vec3[],
    hist: [] as Float32Array[],
    t0: 0,
    trace: [new Float32Array(0), new Float32Array(0), new Float32Array(0)],
    pending: [[], [], []] as number[][],
  });

  useEffect(() => {
    loadModel("tinymotion-anywhere").then(setModel).catch(() => {});
    const ref = r.current;
    return () => {
      ref.stop();
      ref.release();
    };
  }, []);

  const flushTrace = useCallback(() => {
    const t = r.current;
    for (let k = 0; k < 3; k++) {
      if (!t.pending[k].length) continue;
      const all = [...t.trace[k], ...t.pending[k]];
      t.trace[k] = Float32Array.from(all.slice(-300));
      t.pending[k] = [];
    }
    return t.trace;
  }, []);

  const startRunning = useCallback(
    (m: Model, rotation: ReturnType<typeof calibrate>["rotation"]) => {
      const t = r.current;
      t.hist = [];
      t.t0 = performance.now();
      t.pipe = new Pipeline({
        gravitySos: m.meta.filters.gravity_sos,
        noiseSos: m.meta.filters.noise_sos,
        rotation,
        hop: HOP,
        onRow: (row) => {
          for (let k = 0; k < 3; k++) t.pending[k].push(row[k]);
        },
      });
      t.stop();
      t.stop = subscribeMotion((s) => {
        if (t.raw.length < MAX_RAW) t.raw.push(s);
        for (const w of t.pipe!.push(s)) {
          const p = m.predict(w.data);
          t.hist.push(p);
          if (t.hist.length > 3) t.hist.shift();
          const avg = new Float32Array(6);
          for (const h of t.hist) for (let k = 0; k < 6; k++) avg[k] += h[k] / t.hist.length;
          let c = 0;
          for (let k = 1; k < 6; k++) if (avg[k] > avg[c]) c = k;
          const sec = (performance.now() - t.t0) / 1000;
          setProbs(avg);
          setCls(c);
          setElapsed(sec);
          setItems((it) => [...it, { t0: Math.max(0, sec - HOP / 50), t1: sec, cls: c, conf: avg[c] }]);
        }
      });
      setPhase("running");
    },
    [],
  );

  const runCalibration = useCallback(
    (m: Model) => {
      const t = r.current;
      t.cal = [];
      setCalNote(null);
      setPhase("calibrating");
      t.stop();
      t.stop = subscribeMotion((s) => {
        t.cal.push(s.acc);
        if (t.raw.length < MAX_RAW) t.raw.push(s);
      });
      const started = performance.now();
      const iv = setInterval(() => {
        const left = Math.max(0, CAL_MS - (performance.now() - started));
        setCalLeft(Math.ceil(left / 1000));
        if (left > 0) return;
        clearInterval(iv);
        t.stop();
        const c = calibrate(t.cal, m.meta.gravity_reference);
        if (t.cal.length < 20 || c.stillness > 0.08 || Math.abs(c.magnitude - 1) > 0.25) {
          setCalNote(t.cal.length < 20 ? "Too few readings arrived. Keep this page in front and try again." : "The phone moved during calibration. Hold still and try again.");
          setPhase("intro");
          return;
        }
        startRunning(m, c.rotation);
      }, 200);
    },
    [startRunning],
  );

  const begin = async () => {
    if (!model) return;
    setPhase("checking");
    const motion = await checkMotion();
    if (motion !== "ok") return setPhase(motion);
    r.current.release = await keepAwake();
    r.current.raw = [];
    setItems([]);
    setProbs(null);
    setCls(-1);
    runCalibration(model);
  };

  const finish = () => {
    r.current.stop();
    r.current.release();
    setRawCount(r.current.raw.length);
    setPhase("done");
  };

  const totals = ACTIVITIES.map((_, i) => items.filter((x) => x.cls === i).length * (HOP / 50));
  const a = cls >= 0 ? ACTIVITIES[cls] : null;
  const source = useCallback(() => flushTrace(), [flushTrace]);

  // ------------------------------------------------------------------ screens
  if (phase === "nosensor")
    return (
      <div className="panel grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <QrCode path="/live" />
        <div>
          <h2 className="t-h3">This device doesn&apos;t send motion data</h2>
          <p className="muted mt-3 measure">Live recognition needs a phone&apos;s accelerometer and gyroscope. Scan the code with your phone to open this page there, or watch the model work on a real recording right now. Already on a phone? Check that motion sensors aren&apos;t blocked for this site in your browser&apos;s site settings.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/#replay" className="btn btn-primary">Watch the replay</Link>
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("intro")}>Back</button>
          </div>
        </div>
      </div>
    );

  if (phase === "denied")
    return (
      <div className="panel p-6 sm:p-8">
        <h2 className="t-h3">Motion access was turned off</h2>
        <p className="muted mt-3 measure">On iPhone, motion access is asked once per site. To allow it again, close this tab, open the page in a new tab, and tap Allow when asked. Nothing you record leaves the phone.</p>
        <button type="button" className="btn btn-ghost mt-6" onClick={() => setPhase("intro")}>Try again</button>
      </div>
    );

  if (phase === "intro" || phase === "checking")
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="panel p-6 sm:p-8">
          <h2 className="t-h3">Before you start</h2>
          <ol className="mt-5 space-y-4">
            {[
              ["Put the phone where it moves with you", "A front trouser pocket or clipped at the waist, like the study's volunteers. In your hand works for walking, but not for telling sitting from standing."],
              ["Stand still for three seconds", "TinyMotion measures which way gravity points to line your phone up with the study's."],
              ["Then just move", "Walk, take the stairs, sit, stand or lie down. A new reading arrives every half second."],
            ].map(([h, b], i) => (
              <li key={h} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="mono grid h-8 w-8 place-items-center rounded border border-[var(--rule-2)] text-[0.85rem] text-[var(--accent)]">{i + 1}</span>
                <span>
                  <span className="font-[650]">{h}</span>
                  <span className="t-small muted mt-0.5 block">{b}</span>
                </span>
              </li>
            ))}
          </ol>
          {calNote && <p role="alert" className="mt-6 rounded-md border border-[#ff8a7a]/40 bg-[#ff8a7a]/10 px-4 py-3 text-[0.95rem]">{calNote}</p>}
          <button type="button" className="btn btn-primary mt-7 w-full sm:w-auto" onClick={begin} disabled={!model || phase === "checking"}>
            {!model ? "Loading the model…" : phase === "checking" ? "Checking sensors…" : "Start live recognition"}
          </button>
          <p className="t-small faint mt-4">Everything runs on this device. No sensor data is uploaded.</p>
        </div>
        <div className="panel hidden flex-col items-center justify-center gap-4 p-8 text-center lg:flex">
          <QrCode path="/live" />
          <p className="muted max-w-xs text-[0.95rem]">On a laptop? Scan this to open Live on your phone, where the motion sensors are.</p>
        </div>
      </div>
    );

  if (phase === "calibrating")
    return (
      <div className="panel grid place-items-center gap-4 px-6 py-16 text-center">
        <p className="faint">Stand still with the phone in place</p>
        <p className="display mono num text-[6rem] leading-none" aria-live="assertive">{calLeft || "…"}</p>
        <p className="muted max-w-sm">Measuring the direction of gravity so the readings line up with how the study&apos;s phones were worn.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="panel glow overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2.5">
            <span className="mono inline-flex items-center gap-2 text-[0.78rem] text-[var(--fg-3)]">
              <span className={phase === "running" ? "led" : "led led-off"} aria-hidden="true" />
              {phase === "running" ? "live · body acceleration (g)" : "session ended"}
            </span>
            <span className="mono num text-[0.78rem] text-[var(--fg-3)]">{fmt(elapsed)}</span>
          </div>
          <Trace source={source} range={0.8} labels={["x", "y", "z"]} className="h-52" />
          <div className="border-t border-[var(--rule)] px-5 py-5">
            <p className="faint text-[0.85rem]">You are</p>
            <p className="display mt-1 flex items-center gap-3 text-[clamp(2.4rem,9vw,4.4rem)]" aria-live="polite" style={{ color: a ? activityColor(a.id) : "var(--fg-3)" }}>
              {a && <ActivityGlyph id={a.id} className="h-[0.8em] w-[0.8em] shrink-0" />}
              <span className="text-[var(--fg)]">{a ? a.label : "Listening…"}</span>
            </p>
            <p className="muted mt-2 text-[0.95rem]">
              Confidence <span className="mono num text-[var(--fg)]">{probs && a ? `${(probs[cls] * 100).toFixed(0)}%` : "–"}</span>
            </p>
          </div>
        </div>
        <div className="panel p-5">
          <ProbBars probs={probs} highlight={cls} />
        </div>
      </div>
      <div className="panel space-y-5 p-5">
        <Ribbon items={items} label="This session" />
        <Legend />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {ACTIVITIES.map((x, i) => (
            <div key={x.id} className="spec">
              <dt>{x.label}</dt>
              <dd>{fmt(totals[i])}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          {phase === "running" ? (
            <>
              <button type="button" className="btn btn-primary" onClick={finish}>End session</button>
              <button type="button" className="btn btn-ghost" onClick={() => model && runCalibration(model)}>Recalibrate</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={begin}>New session</button>
              <button type="button" className="btn btn-ghost" disabled={!rawCount} onClick={() => download(`tinymotion-session-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`, toCsv(r.current.raw))}>
                Download raw sensor data (CSV)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!items.length}
                onClick={() => download("tinymotion-timeline.csv", ["start_s,end_s,activity,confidence", ...items.map((x) => `${x.t0.toFixed(2)},${x.t1.toFixed(2)},${ACTIVITIES[x.cls].id},${(x.conf ?? 0).toFixed(3)}`)].join("\n") + "\n")}
              >
                Download timeline (CSV)
              </button>
            </>
          )}
        </div>
        <p className="t-small faint">The raw CSV opens in <Link className="link" href="/analyze">Analyze</Link>, so you can review a session later.</p>
      </div>
    </div>
  );
}
