/**
 * OpenTelemetry tracing for server rendering, route handlers and outgoing fetches
 * (database, inference service, email). Off unless an OTLP endpoint is set, e.g.
 * Grafana Cloud, Honeycomb or a local collector:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com  OTEL_EXPORTER_OTLP_HEADERS=...
 */
export async function register() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({ serviceName: "tinymotion-web" });
}
