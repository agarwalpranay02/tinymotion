import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TinyMotion: AI that knows how you move, small enough for a microcontroller";

const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"];

export default function OG() {
  // a stride-like trace, coloured stretch by stretch with the six activity colours
  const pts = Array.from({ length: 61 }, (_, i) => {
    const x = 72 + i * 17.6;
    const amp = i < 30 ? 70 : i < 40 ? 26 : 6;
    return [x, 470 + Math.sin(i * 0.9) * amp * (i % 3 === 0 ? 1 : 0.55)];
  });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#10122a", color: "#eceef9", padding: 72, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 38, fontWeight: 700 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, border: "4px solid #eceef9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 22, height: 4, background: "#9a8cf2" }} />
          </div>
          TinyMotion
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>AI that knows how you move.</div>
          <div style={{ fontSize: 44, marginTop: 22, color: "#b6bad6" }}>On your phone. Small enough for a microcontroller.</div>
        </div>
        <svg width="1200" height="630" style={{ position: "absolute", left: 0, top: 0 }}>
          {pts.slice(0, -1).map(([x, y], i) => (
            <line key={i} x1={x} y1={y} x2={pts[i + 1][0]} y2={pts[i + 1][1]} stroke={COLORS[Math.min(5, Math.floor(i / 10))]} strokeWidth="6" strokeLinecap="round" />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
