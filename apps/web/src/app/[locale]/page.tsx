import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ReplayDemo } from "@/components/ReplayDemo";
import { ActivityGlyph } from "@/components/viz";
import { ACTIVITIES, activityColor } from "@/lib/activities";
import { kb, modelMeta, pct, researchFacts } from "@/lib/metrics";
import { RESEARCH } from "@/lib/site";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const live = modelMeta("tinymotion-anywhere");
  const facts = researchFacts();

  const steps = [
    ["Sense", "The phone's accelerometer and gyroscope, read about 60 times a second and resampled to 50 Hz."],
    ["Filter", "The study's own preprocessing: a 20 Hz noise filter and a 0.3 Hz Butterworth that separates gravity from body motion."],
    ["Window", "The last 2.56 seconds become one 128 × 9 window, a fresh one every half second."],
    ["Classify", `A ${live.params.toLocaleString("en")}-parameter residual 1D CNN, running in plain JavaScript on the device.`],
  ];
  const faq = [
    ["Is anything uploaded?", "No. Live, Analyze and Record run entirely in your browser. Sensor readings and files never leave the device. Only the developer API, which you call yourself, sends data to a server."],
    ["How accurate is it?", `On the 9 people in the UCI HAR test set, whom the models never saw, the default model, TinyMotion Anywhere, scores ${pct(live.metrics.mean_accuracy)} on average over ${live.metrics.seeds} training runs (± ${pct(live.metrics.std_accuracy)}), and ${pct(live.metrics.mean_rotated_accuracy)} when the phone sits at a different angle. Real life is messier than a lab: phone placement matters most, and sitting versus standing is the hardest pair.`],
    ["Where should the phone be?", "Where it moves with your hips: a front trouser pocket or clipped to a waistband, like the study's volunteers. Held in the hand, walking and stairs still work, but posture is guesswork."],
    ["Which phones work?", "Any phone with a modern browser and motion sensors: Android with Chrome, Samsung Internet or Firefox, and iPhone with Safari (it asks for motion access once). Laptops don't have the sensors, so they get the replay instead."],
    ["Can I run the model on a microcontroller?", `Yes. The Studio has the same model as dependency-free C (${kb(live.formats.c.bytes ?? 0)} of source, float32) and as a full-integer INT8 TensorFlow Lite file (${kb(live.formats.tflite_int8.bytes ?? 0)}) for TensorFlow Lite Micro. Both are checked against TensorFlow on the whole test set.`],
    ["Is this a medical device?", "No. It's a research demonstration of on-device activity recognition. Don't use it for safety-critical decisions such as fall detection."],
  ];

  return (
    <>
      <section className="wrap pt-10 sm:pt-16">
        <h1 className="display t-hero max-w-[12ch]">AI that knows how you move.</h1>
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p className="t-lead measure">
            Your phone&apos;s motion sensors recognise walking, climbing stairs, sitting, standing and lying down in real time, on the phone itself. The model is {kb(live.formats.engine.bytes ?? 0)}: small enough for a microcontroller.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/live" className="btn btn-primary">Try it on your phone</Link>
            <Link href="/studio" className="btn btn-ghost">Get the models</Link>
          </div>
        </div>
      </section>

      <section id="replay" className="wrap scroll-mt-24 pt-12" aria-labelledby="replay-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="replay-title" className="t-h3">A real recording, classified as you watch</h2>
          <p className="t-small faint">A volunteer the model never saw, from the UCI HAR test set, replayed through the live pipeline.</p>
        </div>
        <ReplayDemo />
      </section>

      <section className="wrap pt-20" aria-labelledby="spec-title">
        <h2 id="spec-title" className="sr-only">Key figures</h2>
        <dl className="grid gap-px overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            [pct(live.metrics.mean_accuracy), `mean accuracy on ${RESEARCH.dataset.testSubjects} unseen people`, `default model, ${live.metrics.seeds} training runs, ± ${pct(live.metrics.std_accuracy)}`],
            [live.params.toLocaleString("en"), "parameters", "a residual depthwise-separable 1D CNN"],
            [kb(live.formats.tflite_int8.bytes ?? 0), "INT8 TensorFlow Lite model", `${pct(live.formats.tflite_int8.accuracy)} accuracy after quantisation`],
            [pct(facts.pipeline_check.live_pipeline), "with the on-device filter", `vs ${pct(facts.pipeline_check.official)} with the dataset's own preprocessing`],
          ].map(([v, l, n]) => (
            <div key={l} className="bg-[var(--surface)] p-6">
              <dd className="display mono num text-[2.6rem]">{v}</dd>
              <dt className="mt-2 font-[600]">{l}</dt>
              <p className="t-small faint mt-1">{n}</p>
            </div>
          ))}
        </dl>
      </section>

      <section className="wrap pt-24" aria-labelledby="paths-title">
        <h2 id="paths-title" className="display t-h2 max-w-[18ch]">Three ways in</h2>
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          {[
            ["/live", "Live", "Put your phone in your pocket and watch it recognise what you're doing, every half second. Export the session when you're done.", "Go live"],
            ["/analyze", "Analyze & record", "Drop in a sensor recording from any phone logger and get an activity timeline. Or record and label your own data.", "Analyze a file"],
            ["/studio", "Studio", "Download the models as C, INT8 TensorFlow Lite or Keras, benchmark them on your device, and call them over HTTP.", "Open the studio"],
          ].map(([href, title, body, cta]) => (
            <Link key={href} href={href} className="chip group mx-2 flex flex-col p-6 transition-colors hover:border-[var(--accent)]">
              <span className="t-h3">{title}</span>
              <span className="muted mt-3 flex-1">{body}</span>
              <span className="mt-6 font-[650] text-[var(--accent)]">{cta} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap pt-24" aria-labelledby="how-title">
        <h2 id="how-title" className="display t-h2 max-w-[18ch]">From hip to verdict in four steps</h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--rule)] md:grid-cols-4">
          {steps.map(([h, b], i) => (
            <li key={h} className="bg-[var(--surface)] p-6">
              <span className="mono text-[0.85rem] text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
              <p className="t-h3 mt-3">{h}</p>
              <p className="muted mt-2 text-[0.97rem]">{b}</p>
            </li>
          ))}
        </ol>
        <ul className="mt-8 flex flex-wrap gap-2" aria-label="The six activities">
          {ACTIVITIES.map((a) => (
            <li key={a.id} className="tag !text-[0.9rem]">
              <span style={{ color: activityColor(a.id) }}><ActivityGlyph id={a.id} className="h-4 w-4" /></span>
              {a.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap pt-24" aria-labelledby="research-title">
        <div className="panel grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <h2 id="research-title" className="display t-h2">Built on published research</h2>
            <p className="muted mt-4 measure">
              TinyMotion grew out of <em>{RESEARCH.paper.title}</em>, accepted at {RESEARCH.paper.venue.split(",")[0]} ({RESEARCH.paper.series}). The models here were retrained under a strict protocol: validation on held-out training volunteers, the test set touched once, five seeds per model.
            </p>
            <Link href="/research" className="btn btn-ghost mt-7">See every result</Link>
          </div>
          <div className="panel-inset p-5">
            <p className="faint text-[0.85rem]">Trained on</p>
            <p className="t-h3 mt-1">{RESEARCH.dataset.title}</p>
            <p className="t-small muted mt-2">
              {RESEARCH.dataset.authors} ({RESEARCH.dataset.year}). {RESEARCH.dataset.publisher}. {RESEARCH.dataset.subjects} volunteers aged 19 to 48, a {RESEARCH.dataset.device}, {RESEARCH.dataset.rateHz} Hz. Licensed {RESEARCH.dataset.license}.
            </p>
            <a href={RESEARCH.dataset.url} className="link mt-2 inline-block py-2 text-[0.95rem]" target="_blank" rel="noopener noreferrer">doi.org/{RESEARCH.dataset.doi}</a>
          </div>
        </div>
      </section>

      <section className="wrap pt-24" aria-labelledby="faq-title">
        <h2 id="faq-title" className="display t-h2">Questions</h2>
        <dl className="mt-8 grid gap-4 md:grid-cols-2">
          {faq.map(([q, a]) => (
            <div key={q} className="panel p-5">
              <dt className="flex gap-3 font-[650]">
                <span aria-hidden="true" className="mono text-[var(--accent)]">?</span>
                {q}
              </dt>
              <dd className="muted mt-2 pl-6 text-[0.98rem]">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
