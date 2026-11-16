"use client";

import { useEffect, useRef, useState } from "react";
import { ACTIVITIES, activityColor } from "@/lib/activities";
import type { RawSample } from "@/lib/engine/pipeline";
import { checkMotion, download, keepAwake, subscribeMotion, toCsv } from "@/lib/sensors";
import { QrCode } from "./QrCode";
import { ActivityGlyph } from "./viz";

type Take = { label: string; samples: (RawSample & { label: string })[]; seconds: number };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Records labelled phone sensor data as CSV, the same format Live exports and Analyze reads. */
export function Recorder() {
  const [label, setLabel] = useState<string>("walking");
  const [takes, setTakes] = useState<Take[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<"idle" | "nosensor" | "denied">("idle");
  const [now, setNow] = useState({ n: 0, s: 0 });
  const cur = useRef<{ stop: () => void; release: () => void; buf: (RawSample & { label: string })[]; t0: number }>({ stop: () => {}, release: () => {}, buf: [], t0: 0 });

  useEffect(() => {
    const c = cur.current;
    return () => {
      c.stop();
      c.release();
    };
  }, []);

  const start = async () => {
    const motion = await checkMotion();
    if (motion !== "ok") return setStatus(motion);
    setStatus("idle");
    const c = cur.current;
    c.buf = [];
    c.t0 = performance.now();
    c.release = await keepAwake();
    c.stop = subscribeMotion((s) => {
      c.buf.push({ ...s, label });
      if (c.buf.length % 25 === 0) setNow({ n: c.buf.length, s: (performance.now() - c.t0) / 1000 });
    });
    setRecording(true);
  };

  const stop = () => {
    const c = cur.current;
    c.stop();
    c.release();
    setRecording(false);
    if (c.buf.length > 10) setTakes((t) => [...t, { label, samples: c.buf, seconds: (c.buf[c.buf.length - 1].t - c.buf[0].t) / 1000 }]);
    setNow({ n: 0, s: 0 });
  };

  const all = takes.flatMap((t) => t.samples);

  if (status === "nosensor")
    return (
      <div className="panel grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <QrCode path="/record" />
        <div>
          <h2 className="t-h3">This device doesn&apos;t send motion data</h2>
          <p className="muted mt-3 measure">Recording needs a phone. Scan the code to open this page on yours.</p>
          <button type="button" className="btn btn-ghost mt-6" onClick={() => setStatus("idle")}>Back</button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="panel p-5 sm:p-6">
        <h2 className="t-h3">What are you about to do?</h2>
        <div role="radiogroup" aria-label="Activity for this take" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACTIVITIES.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={label === a.id}
              disabled={recording}
              onClick={() => setLabel(a.id)}
              className="flex items-center gap-2 rounded-md border border-[var(--rule-2)] px-3 py-3 text-left text-[0.95rem] aria-checked:border-[var(--accent)] aria-checked:bg-[var(--surface-2)]"
            >
              <span style={{ color: activityColor(a.id) }}><ActivityGlyph id={a.id} /></span>
              {a.label}
            </button>
          ))}
        </div>
        {status === "denied" && <p role="alert" className="mt-4 text-[#ff8a7a]">Motion access was refused. Open the page in a new tab and tap Allow.</p>}
        <div className="mt-6 flex items-center gap-4">
          {recording ? (
            <button type="button" className="btn btn-primary" onClick={stop}>Stop take</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={start}>Start recording</button>
          )}
          <span className="mono num faint" aria-live="polite">{recording ? `${fmt(now.s)} · ${now.n} readings` : `${takes.length} takes`}</span>
        </div>
        <p className="t-small faint mt-4">Tip: start each take still for 3 seconds. Analyze uses that moment to line up the phone&apos;s orientation.</p>
      </div>
      <div className="panel p-5 sm:p-6">
        <h2 className="t-h3">Takes</h2>
        {takes.length === 0 ? (
          <p className="muted mt-3">No takes yet. Each take is saved here until you leave the page; nothing is uploaded.</p>
        ) : (
          <ul className="mt-3">
            {takes.map((t, i) => (
              <li key={i} className="spec items-center">
                <span className="inline-flex items-center gap-2"><span style={{ color: activityColor(t.label) }}><ActivityGlyph id={t.label} className="h-4 w-4" /></span>{ACTIVITIES.find((a) => a.id === t.label)?.label}</span>
                <span>{fmt(t.seconds)} · {t.samples.length}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn btn-ghost" disabled={!all.length} onClick={() => download(`tinymotion-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`, toCsv(all))}>Download CSV</button>
          <button type="button" className="btn btn-ghost" disabled={!takes.length || recording} onClick={() => setTakes([])}>Clear</button>
        </div>
      </div>
    </div>
  );
}
