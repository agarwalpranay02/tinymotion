import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { Playground } from "@/components/Playground";
import { Link } from "@/i18n/navigation";
import { MODELS } from "@/lib/activities";
import { share } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = share({
  title: "Developer API",
  description: "Classify 2.56-second accelerometer and gyroscope windows over HTTP. Free with an API key. JSON in, activity probabilities out.",
  alternates: { canonical: "/developers" },
});

export default async function Developers({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const base = SITE.url;
  const response = JSON.stringify(
    {
      model: "tinymotion-anywhere",
      version: "2026.11",
      predictions: [{ activity: "walking", confidence: 0.9309, probabilities: { walking: 0.9309, walking_upstairs: 0.0157, walking_downstairs: 0.0127, sitting: 0.0131, standing: 0.0121, laying: 0.0155 } }],
      latency_ms: 0.61,
    },
    null,
    2,
  );
  const errors = [
    ["400", "invalid_request", "The body didn't match: `window` must be 128 rows of 9 finite numbers, `windows` at most 64 of those, and only one of the two."],
    ["401", "invalid_api_key", "Missing, malformed, revoked or unknown key."],
    ["413", "too_large", "Body larger than 2 MB."],
    ["415", "unsupported_media_type", "Send JSON with Content-Type: application/json."],
    ["429", "rate_limited / quota_exceeded", "Per-minute limit reached (wait the Retry-After seconds), or the monthly fair-use limit is used up (it resets on the 1st)."],
  ];
  return (
    <>
      <PageHeader kicker="api · v1" title="Classify motion over HTTP" sub="Send 2.56-second windows of accelerometer and gyroscope data, get activity probabilities back. The same models and code as the website. Free with a key.">
        <Link href="/account" className="btn btn-primary mt-8">Get a free API key</Link>
      </PageHeader>
      <div className="wrap grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-12">
          <section>
            <h2 className="t-h3">Endpoint</h2>
            <pre className="codeblock mt-3"><code>{`POST ${base}/api/v1/classify`}</code></pre>
            <p className="muted mt-3">Authenticate with <code>Authorization: Bearer tm_live_…</code>. Keys are shown once and stored only as a hash.</p>
          </section>
          <section>
            <h2 className="t-h3">Input</h2>
            <p className="muted mt-3">One window is 128 samples at 50 Hz (2.56 s), each a row of 9 numbers in this order, in the UCI HAR device frame:</p>
            <dl className="mt-3">
              <div className="spec"><dt>0–2</dt><dd>body acceleration x, y, z (g, gravity removed)</dd></div>
              <div className="spec"><dt>3–5</dt><dd>angular velocity x, y, z (rad/s)</dd></div>
              <div className="spec"><dt>6–8</dt><dd>total acceleration x, y, z (g, gravity included)</dd></div>
            </dl>
            <p className="t-small faint mt-3">Gravity is separated with a 3rd-order 0.3 Hz Butterworth low-pass; the coefficients are in each model&apos;s <Link className="link" href="/studio">model.json</Link>. Send <code>{"{ \"window\": [[…9 numbers], …128 rows] }"}</code> or up to 64 at once as <code>{"{ \"windows\": [ … ] }"}</code>. Optional <code>model</code>: {MODELS.map((m) => <code key={m.id} className="mr-1">{m.id}</code>)}.</p>
          </section>
          <section className="space-y-3">
            <h2 className="t-h3">Request</h2>
            <pre className="codeblock"><code>{`curl -X POST ${base}/api/v1/classify \\
  -H "Authorization: Bearer $TINYMOTION_KEY" \\
  -H "Content-Type: application/json" \\
  -d @window.json`}</code></pre>
            <pre className="codeblock"><code>{`import requests

r = requests.post(
    "${base}/api/v1/classify",
    headers={"Authorization": f"Bearer {TINYMOTION_KEY}"},
    json={"windows": windows},   # list of 128 x 9 lists
    timeout=10,
)
r.raise_for_status()
for p in r.json()["predictions"]:
    print(p["activity"], p["confidence"])`}</code></pre>
          </section>
          <section>
            <h2 className="t-h3">Response</h2>
            <pre className="codeblock mt-3"><code>{response}</code></pre>
            <p className="t-small faint mt-2">Predictions come back in the order the windows were sent. <code>latency_ms</code> is the model time on the server.</p>
          </section>
          <section>
            <h2 className="t-h3">Limits</h2>
            <p className="muted mt-3">Free for everyone: 64 windows per request, 30 requests a minute and 5,000 a month per key. Successful responses carry <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Reset</code>, <code>X-Quota-Used</code> and <code>X-Quota-Limit</code>. CORS is open, so you can call it from a web page.</p>
          </section>
          <section>
            <h2 className="t-h3">Errors</h2>
            <p className="muted mt-3">One shape: <code>{`{"error": {"code": "…", "message": "…"}}`}</code></p>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[22rem] text-left text-[0.93rem]">
              <tbody>
                {errors.map(([s, c, d]) => (
                  <tr key={c} className="border-t border-dashed border-[var(--rule)]">
                    <td className="mono num py-2.5 pr-3 align-top">{s}</td>
                    <td className="mono py-2.5 pr-3 align-top text-[0.85rem]">{c}</td>
                    <td className="muted py-2.5">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Playground />
        </div>
      </div>
    </>
  );
}
