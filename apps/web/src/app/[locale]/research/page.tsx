import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/PageHeader";
import { ActivityGlyph } from "@/components/viz";
import { ACTIVITIES, activityColor } from "@/lib/activities";
import { allModels, kb, pct, researchFacts } from "@/lib/metrics";
import { share } from "@/lib/seo";
import { RESEARCH } from "@/lib/site";

export const metadata: Metadata = share({
  title: "Research: protocol, results and data",
  description: "How TinyMotion's activity recognition models were trained and tested on UCI HAR: split by person, test set used once, five seeds per model, every format verified.",
  alternates: { canonical: "/research" },
});

const VAL_SUBJECTS = [1, 7, 22, 30];

function Confusion({ m, title }: { m: number[][]; title: string }) {
  const max = Math.max(...m.flat());
  return (
    <div className="panel overflow-x-auto p-4 sm:p-5">
      <table className="w-full min-w-[34rem] border-separate border-spacing-[2px] text-center text-[0.85rem]">
        <caption className="mb-3 text-left font-[650]">{title}</caption>
        <thead>
          <tr>
            <th className="faint p-1 text-left text-[0.75rem] font-[500]">Truth ↓ / model →</th>
            {ACTIVITIES.map((a) => (
              <th key={a.id} scope="col" className="p-1 font-[500]" title={a.label}>
                <span className="inline-flex flex-col items-center gap-0.5" style={{ color: activityColor(a.id) }}>
                  <ActivityGlyph id={a.id} className="h-4 w-4" />
                  <span className="text-[0.72rem] text-[var(--fg-2)]">{a.short}</span>
                </span>
              </th>
            ))}
            <th className="faint p-1 text-[0.75rem] font-[500]">Recall</th>
          </tr>
        </thead>
        <tbody>
          {m.map((row, i) => {
            const n = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={i}>
                <th scope="row" className="whitespace-nowrap p-1 text-left font-[500] text-[var(--fg-2)]">{ACTIVITIES[i].label}</th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    title={`${ACTIVITIES[i].label} classified as ${ACTIVITIES[j].label}: ${v} of ${n} windows`}
                    className="mono num rounded-[3px] p-1.5"
                    style={{ background: v === 0 ? "var(--bg-2)" : i === j ? `color-mix(in oklab, var(--accent) ${20 + Math.round((v / max) * 55)}%, var(--bg-2))` : `color-mix(in oklab, #ff8a7a ${15 + Math.round((v / max) * 400)}%, var(--bg-2))`, color: v === 0 ? "var(--fg-3)" : "var(--fg)" }}
                  >
                    {v}
                  </td>
                ))}
                <td className="mono num p-1 text-[var(--fg-2)]">{pct(row[i] / n)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Research({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const models = allModels();
  const facts = researchFacts();
  const byId = Object.fromEntries(models.map((m) => [m.id, m]));
  const study = byId["tinymotion-study"], anywhere = byId["tinymotion-anywhere"];
  const pp = facts.paper_protocol;

  return (
    <>
      <PageHeader kicker="research · methods and results" title="Every number, and how it was measured" sub="TinyMotion's models are trained and tested on the UCI HAR dataset under a strict protocol. This page lists the protocol, every result including the spread between training runs, and the limits." />

      <section id="paper" className="wrap scroll-mt-24" aria-labelledby="paper-title">
        <div className="panel grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <h2 id="paper-title" className="faint text-[0.9rem] font-[500]">The paper</h2>
            <p className="t-h3 mt-2">{RESEARCH.paper.title}</p>
            <p className="muted mt-3">{RESEARCH.paper.venue}. {RESEARCH.paper.series}, {RESEARCH.paper.year}. {RESEARCH.paper.status}.</p>
            <p className="muted mt-4 measure">The paper compares three 1D networks for activity recognition on edge devices and finds a MobileNet-style depthwise-separable network the best trade-off. TinyMotion takes that idea further with a residual depthwise-separable network, a stricter evaluation, and deployable exports.</p>
          </div>
          <div className="panel-inset self-start p-5">
            <dl>
              <div className="spec"><dt>Conference</dt><dd><a className="link" href={RESEARCH.paper.conference} target="_blank" rel="noopener noreferrer">WCAIAA 2026</a></dd></div>
              <div className="spec"><dt>Proceedings</dt><dd>Springer LNNS</dd></div>
              <div className="spec"><dt>Status</dt><dd>{RESEARCH.paper.status}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="wrap pt-16" aria-labelledby="protocol">
        <h2 id="protocol" className="display t-h2">Protocol</h2>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--rule)] md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Split by person", `UCI's official split: ${RESEARCH.dataset.trainSubjects} volunteers for training (${RESEARCH.dataset.trainWindows.toLocaleString("en")} windows), ${RESEARCH.dataset.testSubjects} different volunteers for testing (${RESEARCH.dataset.testWindows.toLocaleString("en")} windows). No person appears in both.`],
            ["Validate on held-out people", `Training length is chosen on 4 training volunteers (subjects ${VAL_SUBJECTS.join(", ")}), fixed in advance. The model is then retrained on all ${RESEARCH.dataset.trainSubjects} for that many epochs.`],
            ["Test once", "The test set is never used for early stopping, checkpoints or tuning. Each trained model is evaluated on it exactly once."],
            ["Five seeds", "Every model is trained five times with different seeds. Pages report the mean and spread; the shipped file is seed 0, chosen in advance rather than the best run."],
          ].map(([h, b], i) => (
            <li key={h} className="bg-[var(--surface)] p-6">
              <span className="mono text-[0.85rem] text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
              <p className="t-h3 mt-3">{h}</p>
              <p className="muted mt-2 text-[0.96rem]">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap pt-16" aria-labelledby="results">
        <h2 id="results" className="display t-h2">Results on unseen people</h2>
        <div className="panel mt-8 overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left text-[0.95rem]">
            <caption className="sr-only">Test results for each model</caption>
            <thead className="faint text-[0.8rem]">
              <tr className="border-b border-[var(--rule)]">
                <th className="px-5 py-3 font-[500]">Model</th>
                <th className="px-3 py-3 text-right font-[500]">Accuracy, mean ± sd (5 runs)</th>
                <th className="px-3 py-3 text-right font-[500]">Macro F1, seed 0</th>
                <th className="px-3 py-3 text-right font-[500]">Phone rotated</th>
                <th className="px-3 py-3 text-right font-[500]">Parameters</th>
                <th className="px-5 py-3 text-right font-[500]">INT8 size · accuracy</th>
              </tr>
            </thead>
            <tbody className="mono num">
              {models.map((m) => (
                <tr key={m.id} className="border-t border-dashed border-[var(--rule)]">
                  <th scope="row" className="px-5 py-3 font-sans font-[650]">{m.title}</th>
                  <td className="px-3 py-3 text-right">{pct(m.meta.metrics.mean_accuracy)} ± {pct(m.meta.metrics.std_accuracy)}</td>
                  <td className="px-3 py-3 text-right">{m.meta.metrics.test_macro_f1.toFixed(3)}</td>
                  <td className="px-3 py-3 text-right">{pct(m.meta.metrics.mean_rotated_accuracy)}</td>
                  <td className="px-3 py-3 text-right">{m.meta.params.toLocaleString("en")}</td>
                  <td className="px-5 py-3 text-right">{kb(m.meta.formats.tflite_int8.bytes ?? 0)} · {pct(m.meta.formats.tflite_int8.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small faint mt-3 measure">&ldquo;Phone rotated&rdquo; re-tests every window after turning the phone by a random angle about the vertical axis, sometimes mirrored, as happens when a phone sits in a pocket differently. Only the Anywhere model was trained for that.</p>
        <details className="mt-6">
          <summary className="cursor-pointer font-[650] text-[var(--accent)]">Every training run</summary>
          <div className="panel mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[34rem] text-left text-[0.9rem]">
              <thead className="faint text-[0.78rem]"><tr className="border-b border-[var(--rule)]"><th className="px-5 py-2.5 font-[500]">Model</th><th className="px-3 py-2.5 font-[500]">Seed</th><th className="px-3 py-2.5 text-right font-[500]">Accuracy</th><th className="px-3 py-2.5 text-right font-[500]">Macro F1</th><th className="px-5 py-2.5 text-right font-[500]">Rotated</th></tr></thead>
              <tbody className="mono num">
                {models.flatMap((m) =>
                  (facts.per_seed[m.id] ?? []).map((r) => (
                    <tr key={`${m.id}-${r.seed}`} className="border-t border-dashed border-[var(--rule)]">
                      <td className="px-5 py-2 font-sans">{m.title}</td><td className="px-3 py-2">{r.seed}</td><td className="px-3 py-2 text-right">{pct(r.accuracy, 2)}</td><td className="px-3 py-2 text-right">{r.macro_f1.toFixed(3)}</td><td className="px-5 py-2 text-right">{pct(r.rotated, 2)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="wrap grid gap-6 pt-16 lg:grid-cols-2" aria-labelledby="errors">
        <h2 id="errors" className="sr-only">Where the models go wrong</h2>
        <Confusion m={study.meta.metrics.confusion} title={`${study.title}, seed 0: ${pct(study.meta.metrics.test_accuracy)} on ${RESEARCH.dataset.testWindows.toLocaleString("en")} test windows`} />
        <Confusion m={anywhere.meta.metrics.confusion} title={`${anywhere.title}, seed 0: ${pct(anywhere.meta.metrics.test_accuracy)}`} />
        <p className="muted lg:col-span-2 measure">Almost every mistake is one of two pairs. Sitting and standing look alike to a hip-worn phone, because the hips barely move and only the phone&apos;s tilt differs. Climbing and descending stairs share the same stride rhythm. These are the classic hard cases on this dataset.</p>
      </section>

      <section className="wrap grid gap-6 pt-16 lg:grid-cols-2" aria-labelledby="checks">
        <h2 id="checks" className="sr-only">Deployment checks</h2>
        <div className="panel p-6">
          <h3 className="t-h3">The live pipeline holds up</h3>
          <p className="muted mt-3">The phone has to separate gravity from body motion itself. Re-running all {facts.pipeline_check.n.toLocaleString("en")} test windows with body acceleration computed by the site&apos;s own causal filter, instead of the dataset&apos;s precomputed signal:</p>
          <dl className="mt-4">
            <div className="spec"><dt>Dataset&apos;s preprocessing</dt><dd>{pct(facts.pipeline_check.official, 2)}</dd></div>
            <div className="spec"><dt>TinyMotion&apos;s on-device filter</dt><dd>{pct(facts.pipeline_check.live_pipeline, 2)}</dd></div>
          </dl>
        </div>
        <div className="panel p-6">
          <h3 className="t-h3">Every format agrees</h3>
          <p className="muted mt-3">During export the browser engine&apos;s program, the generated C code and both TensorFlow Lite files run on the whole test set:</p>
          <dl className="mt-4">
            {(["engine", "c", "tflite_fp32", "tflite_int8"] as const).map((k) => (
              <div key={k} className="spec"><dt>{{ engine: "Browser engine", c: "C header (gcc)", tflite_fp32: "TFLite float32", tflite_int8: "TFLite INT8" }[k]}</dt><dd>{pct(anywhere.meta.formats[k].accuracy, 2)}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="wrap pt-16" aria-labelledby="paper-models">
        <h2 id="paper-models" className="display t-h2">The paper&apos;s networks, measured</h2>
        <p className="muted mt-4 measure">The paper&apos;s code trains its networks for ten epochs and reports test accuracy at the end. Re-running that code here gives the following. Sizes are the TensorFlow Lite files the code produces.</p>
        <div className="panel mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[34rem] text-left text-[0.95rem]">
            <thead className="faint text-[0.8rem]"><tr className="border-b border-[var(--rule)]"><th className="px-5 py-3 font-[500]">Network</th><th className="px-3 py-3 text-right font-[500]">Parameters</th><th className="px-3 py-3 text-right font-[500]">Accuracy</th><th className="px-3 py-3 text-right font-[500]">TFLite float32</th><th className="px-5 py-3 text-right font-[500]">TFLite dynamic INT8</th></tr></thead>
            <tbody className="mono num">
              {Object.entries(pp).map(([name, r]) => (
                <tr key={name} className="border-t border-dashed border-[var(--rule)]"><th scope="row" className="px-5 py-3 font-sans font-[650]">{name}</th><td className="px-3 py-3 text-right">{r.params.toLocaleString("en")}</td><td className="px-3 py-3 text-right">{r.accuracy.toFixed(2)}%</td><td className="px-3 py-3 text-right">{r.tflite_fp32_kb.toFixed(1)} KB</td><td className="px-5 py-3 text-right">{r.tflite_int8_dynamic_kb.toFixed(1)} KB</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small faint mt-3 measure">The &ldquo;Paper MobileNet1D&rdquo; row in the results table above is the same network retrained under TinyMotion&apos;s protocol, so the two tables are not directly comparable.</p>
      </section>

      <section className="wrap grid gap-6 pt-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-labelledby="limits">
        <div>
          <h2 id="limits" className="display t-h2">Limits</h2>
          <ul className="muted mt-6 list-disc space-y-2 pl-5 measure">
            <li>30 volunteers aged 19 to 48, in a lab, with one phone model worn on the waist. Children, older adults and people with mobility impairments are not represented.</li>
            <li>Six activities only. Running, cycling, driving and the transitions between postures are not recognised; the model always picks one of the six.</li>
            <li>Benchmark accuracy is for the study&apos;s placement. Real phones in real pockets do worse, especially on sitting versus standing.</li>
            <li>Not a medical device, and not suitable for safety decisions such as fall detection.</li>
          </ul>
        </div>
        <div className="panel-inset self-start p-6">
          <h3 className="font-[650]">Dataset and licence</h3>
          <p className="t-small muted mt-2">
            {RESEARCH.dataset.authors} ({RESEARCH.dataset.year}). <em>{RESEARCH.dataset.title}</em>. {RESEARCH.dataset.publisher}. <a className="link" href={RESEARCH.dataset.url} target="_blank" rel="noopener noreferrer">doi.org/{RESEARCH.dataset.doi}</a>. Licensed under <a className="link" href={RESEARCH.dataset.licenseUrl} target="_blank" rel="noopener noreferrer">{RESEARCH.dataset.license}</a>. The replay recordings on this site are reconstructed from the dataset&apos;s test windows.
          </p>
        </div>
      </section>
    </>
  );
}
