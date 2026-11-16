"use client";

import { useEffect, useRef, useState } from "react";
import { ACTIVITIES, activityColor } from "@/lib/activities";

// ------------------------------------------------------------------ glyphs
const GLYPH: Record<string, string> = {
  walking: "M13 4.5a1.6 1.6 0 1 0 0-.1M11.5 8l-2.5 4 3 1.5-1.5 6M11.5 8l3 3.5 3 .5M11.5 8l1 5 3 2 1 4.5",
  walking_upstairs: "M3 20h4v-4h4v-4h4V8h5M15.5 3.5l3 3-3 3",
  walking_downstairs: "M3 6h4v4h4v4h4v4h5M17.5 3.5l3 3-3 3",
  sitting: "M7 4v9h8l1 7M7 13l-1 7M10 9h6",
  standing: "M12 4.5a1.6 1.6 0 1 0 0-.1M12 8v7M12 15l-2 5M12 15l2 5M9 10.5h6",
  laying: "M3 15h18M3 11v8M21 15v4M7 12.5a1.6 1.6 0 1 0 0-.1M10 12.5h9",
};

export function ActivityGlyph({ id, className = "h-5 w-5" }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={GLYPH[id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ probability bars
/** Six labelled bars; text stays in ink colours, the bar carries the activity colour. */
export function ProbBars({ probs, highlight }: { probs: ArrayLike<number> | null; highlight?: number }) {
  return (
    <ul className="space-y-2" aria-label="Probability for each activity">
      {ACTIVITIES.map((a, i) => {
        const p = probs ? probs[i] : 0;
        return (
          <li key={a.id} className="grid grid-cols-[1.5rem_8.5rem_1fr_3.2rem] items-center gap-2 text-[0.92rem]">
            <span style={{ color: activityColor(a.id) }}>
              <ActivityGlyph id={a.id} />
            </span>
            <span className={i === highlight ? "font-[650] text-[var(--fg)]" : "text-[var(--fg-2)]"}>{a.label}</span>
            <span className="h-2 overflow-hidden rounded-[2px] bg-[var(--bg-2)]">
              <span className="block h-full rounded-[2px] transition-[width] duration-300" style={{ width: `${Math.max(p * 100, p > 0 ? 1 : 0)}%`, background: activityColor(a.id) }} />
            </span>
            <span className="mono num text-right text-[0.85rem] text-[var(--fg-2)]">{probs ? `${(p * 100).toFixed(0)}%` : "–"}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ timeline ribbon
export type RibbonItem = { t0: number; t1: number; cls: number; conf?: number };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A horizontal activity timeline. Consecutive windows of the same class merge into one segment. */
export function Ribbon({ items, label, total, height = 26 }: { items: RibbonItem[]; label: string; total?: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const segs: RibbonItem[] = [];
  for (const it of items) {
    const last = segs[segs.length - 1];
    if (last && last.cls === it.cls && Math.abs(last.t1 - it.t0) < 1.5) last.t1 = it.t1;
    else segs.push({ ...it });
  }
  const start = items[0]?.t0 ?? 0;
  const span = Math.max((total ?? (items.length ? items[items.length - 1].t1 : 1)) - start, 1);
  const h = hover === null ? null : segs[hover];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.82rem]">
        <span className="text-[var(--fg-2)]">{label}</span>
        <span className="mono num faint">{h ? `${ACTIVITIES[h.cls].label} · ${fmt(h.t0 - start)}–${fmt(h.t1 - start)}` : items.length ? fmt(span) : "–"}</span>
      </div>
      <div className="relative w-full overflow-hidden rounded-[3px] bg-[var(--bg-2)]" style={{ height }} role="img" aria-label={`${label}: ${segs.map((s) => `${ACTIVITIES[s.cls].label} ${Math.round(s.t1 - s.t0)} s`).join(", ") || "no data yet"}`}>
        {segs.map((s, i) => (
          <span
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="absolute top-0 h-full border-r-2 border-[var(--bg)] transition-opacity"
            style={{ left: `${((s.t0 - start) / span) * 100}%`, width: `${((s.t1 - s.t0) / span) * 100}%`, background: activityColor(ACTIVITIES[s.cls].id), opacity: hover === null || hover === i ? 1 : 0.45 }}
          />
        ))}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.82rem] text-[var(--fg-2)]" aria-label="Activity colours">
      {ACTIVITIES.map((a) => (
        <li key={a.id} className="inline-flex items-center gap-1.5">
          <span className="swatch" style={{ background: activityColor(a.id) }} />
          {a.label}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ oscilloscope trace
/**
 * Draws the most recent seconds of up to three channels like an oscilloscope.
 * `source` returns the latest samples; the canvas redraws every animation frame.
 */
export function Trace({
  source,
  seconds = 5,
  rate = 50,
  range = 1.2,
  labels = ["x", "y", "z"],
  className = "h-48",
}: {
  source: () => Float32Array[] | null;
  seconds?: number;
  rate?: number;
  range?: number;
  labels?: string[];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const colors = ["#9a8cf2", "#eceef9", "#6f7bd8"];
    let raf = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // graticule: 10 x 6 divisions
      ctx.strokeStyle = "rgba(236,238,249,0.07)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo((w * i) / 10, 0); ctx.lineTo((w * i) / 10, h); ctx.stroke(); }
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, (h * i) / 6); ctx.lineTo(w, (h * i) / 6); ctx.stroke(); }
      ctx.strokeStyle = "rgba(236,238,249,0.16)";
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      const data = source();
      if (data) {
        const n = seconds * rate;
        data.forEach((ch, k) => {
          ctx.strokeStyle = colors[k % 3];
          ctx.globalAlpha = k === 0 ? 1 : 0.75;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = colors[k % 3];
          ctx.shadowBlur = k === 0 ? 8 : 0;
          ctx.beginPath();
          const off = Math.max(0, ch.length - n);
          for (let i = off; i < ch.length; i++) {
            const x = ((i - off + (n - (ch.length - off))) / (n - 1)) * w;
            const y = h / 2 - (ch[i] / range) * (h / 2) * 0.92;
            if (i === off) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, seconds, rate, range]);
  return (
    <div className="relative">
      <canvas ref={ref} className={`block w-full ${className}`} aria-hidden="true" />
      <ul className="mono pointer-events-none absolute right-2 top-2 flex gap-3 text-[0.7rem] text-[var(--fg-3)]" aria-hidden="true">
        {labels.map((l, i) => (
          <li key={l} className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ background: ["#9a8cf2", "#eceef9", "#6f7bd8"][i] }} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
