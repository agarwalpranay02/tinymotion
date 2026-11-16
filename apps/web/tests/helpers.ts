/** A recording laid out like many phone loggers: time in seconds, acceleration in g, rotation in deg/s. */
export function csvFixture(): string {
  const rows = ["Time (s);Acceleration x (g);Acceleration y (g);Acceleration z (g);Gyroscope x (deg/s);Gyroscope y (deg/s);Gyroscope z (deg/s)"];
  for (let i = 0; i < 600; i++) {
    const t = i * 0.01;
    rows.push([t.toFixed(3), (Math.sin(t * 9) * 0.3).toFixed(4), (1 + Math.cos(t * 9) * 0.2).toFixed(4), "0.05", (Math.sin(t * 6) * 90).toFixed(2), (Math.cos(t * 6) * 60).toFixed(2), "4.0"].join(";"));
  }
  return rows.join("\n");
}
