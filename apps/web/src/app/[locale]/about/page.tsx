import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/ContactForm";
import { PageHeader } from "@/components/PageHeader";
import { share } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = share({
  title: "About",
  description: "Why TinyMotion exists, who built it, and how it is put together.",
  alternates: { canonical: "/about" },
});

const STACK: [string, string][] = [
  ["Models", "TensorFlow / Keras, a residual depthwise-separable 1D CNN, TensorFlow Lite with full-integer INT8 quantisation"],
  ["On the device", "A dependency-free TypeScript inference engine and signal pipeline (Butterworth filters, resampling, gravity alignment); the same program generated as C99 for microcontrollers"],
  ["Web", "Next.js 16, React 19, TypeScript, Tailwind CSS 4, an installable PWA that works offline"],
  ["Sensors", "DeviceMotion (accelerometer and gyroscope), Screen Wake Lock, iOS motion permission"],
  ["Back end", "Next.js route handlers, better-auth (Google), Drizzle ORM, Postgres, hashed API keys, rate limits"],
  ["Security", "Nonce-based Content-Security-Policy with connect-src locked to the site, HSTS, strict Permissions-Policy, CodeQL and secret scanning in CI"],
  ["Quality", "Vitest unit tests (engine parity against TensorFlow, signal pipeline), Playwright end-to-end tests on desktop and mobile"],
];

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <>
      <PageHeader kicker="about" title="Small models, for everyone's pocket" sub="Most activity-recognition demos stop at a number in a paper. TinyMotion is the whole path: a model you can watch work on your own phone, the evidence behind it, and files you can flash onto a microcontroller." />
      <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="why">
          <h2 id="why" className="display t-h2">Why</h2>
          <div className="muted mt-5 space-y-4 measure">
            <p>Recognising what someone is doing from a phone or a wristband is the basis of step counters, fitness trackers, fall alerts and rehabilitation tools. Doing it on the device keeps that very personal data private and works without a connection, but only if the model is tiny.</p>
            <p>TinyMotion shows how small that model can be: tens of thousands of parameters, about a hundred kilobytes, quick enough to run in plain JavaScript and on a microcontroller. It is honest about where it struggles, too: the research page lists every training run, every confusion and every limit.</p>
          </div>
          <h2 className="display t-h2 mt-16">Who</h2>
          <div className="muted mt-5 space-y-4 measure">
            <p>
              I&apos;m {SITE.founder}, a computer science graduate of Birla Institute of Technology, Mesra. My research is in edge AI and computer vision, and I co-authored the WCAIAA 2026 paper this project builds on.
            </p>
            <p>If you work on wearables, embedded ML or health research and want to use or extend these models, I&apos;d like to hear from you.</p>
          </div>
        </section>
        <section aria-labelledby="stack" className="self-start">
          <h2 id="stack" className="t-h3">How it is built</h2>
          <dl className="mt-4">
            {STACK.map(([k, v]) => (
              <div key={k} className="border-t border-dashed border-[var(--rule)] py-3">
                <dt className="font-[650]">{k}</dt>
                <dd className="t-small muted mt-1">{v}</dd>
              </div>
            ))}
          </dl>
          <a className="btn btn-ghost mt-6" href={SITE.github} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
        </section>
      </div>
      <section className="wrap pt-20" aria-labelledby="contact">
        <div className="panel p-6 sm:p-10">
          <h2 id="contact" className="display t-h2">Get in touch</h2>
          <p className="muted mt-3">Questions, collaborations or corrections: write here or to <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
          <div className="mt-8 max-w-2xl">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
