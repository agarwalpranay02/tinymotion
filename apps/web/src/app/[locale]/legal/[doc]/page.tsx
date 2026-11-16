import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RESEARCH, SITE } from "@/lib/site";
import { share } from "@/lib/seo";

const UPDATED = "17 November 2026";

const P = ({ children }: { children: ReactNode }) => <p className="muted measure mt-3">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h2 className="t-h3 mt-10">{children}</h2>;
const UL = ({ items }: { items: ReactNode[] }) => (
  <ul className="muted measure mt-3 list-disc space-y-1.5 pl-6">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
);

const DOCS: Record<string, { title: string; body: ReactNode }> = {
  privacy: {
    title: "Privacy policy",
    body: (
      <>
        <P>TinyMotion is built so that your movement data stays with you. This policy explains exactly what is processed, where, and why. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023.</P>
        <H>Motion sensor data and files</H>
        <P>Live, Record and Analyze run entirely inside your browser. Accelerometer and gyroscope readings, the activity timeline and any CSV file you open are processed on your device and are never uploaded to us. A recording only leaves the device if you download it yourself. The site&apos;s Content-Security-Policy only allows the page to talk to its own server, so the code cannot quietly send sensor data elsewhere.</P>
        <P>If you call the developer API, the windows you send are processed in memory to return a result and are not stored. We log the time, key identifier, response code and latency for quotas and abuse prevention.</P>
        <H>Accounts</H>
        <P>You only need an account to create API keys. We store your name, email address, profile picture URL (if you sign in with Google) and session records (including IP address and browser user agent, used to protect your account). Google sign-in is handled by Google.</P>
        <H>Other data</H>
        <UL items={[
          "Contact form: your name, email, organisation and message, stored so we can reply.",
          "Rate limiting: a salted hash of your IP address, kept briefly in memory or in our cache provider.",
          "Security reports: browsers may send us Content-Security-Policy violation reports, which contain the page URL.",
          "Visit counts: Vercel Web Analytics, our host's privacy-friendly analytics, counts page views without cookies. It records the page, referrer, country, browser, operating system and device type; visitors are told apart only by a hash that is discarded after a day. Sensor data is never included.",
        ]} />
        <H>Service providers</H>
        <P>The site and API are hosted by Vercel, and account data is stored in a Neon Postgres database, both in the United States (Washington, D.C. region). Google handles Google sign-in. Each processes data only to provide its service to us.</P>
        <H>What we don&apos;t do</H>
        <UL items={["No advertising, no ad trackers, no selling or sharing of personal data.", "No cross-site tracking: visit counts stay with our host and are never combined with other sites.", "Your sensor data is never used to train models."]} />
        <H>Cookies</H>
        <P>Only essential cookies: a session cookie when you sign in, and a language preference. Visit counting uses no cookies, and nothing non-essential is set.</P>
        <H>Retention and your rights</H>
        <P>Account data is kept while your account is active and deleted within 30 days of a deletion request; contact messages are kept for up to two years. You can ask to access, correct or erase your data, withdraw consent, or nominate someone to act for you, by writing to {SITE.email}. We reply within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India.</P>
      </>
    ),
  },
  terms: {
    title: "Terms of use",
    body: (
      <>
        <P>TinyMotion is a free research demonstration of on-device human activity recognition. By using the site, the API or the downloadable models you agree to these terms.</P>
        <H>Not a medical or safety device</H>
        <P>Predictions can be wrong, especially when the phone is not placed like the study&apos;s (worn on the waist). Do not use TinyMotion for medical diagnosis, fall detection, workplace safety, insurance, employment or any decision with legal or similarly significant effects on a person.</P>
        <H>Monitoring other people</H>
        <P>Only record or analyse motion data of people who know and agree. Do not use TinyMotion to track someone covertly.</P>
        <H>The API</H>
        <UL items={["Free within the published fair-use limits. Keys are personal; keep them secret.", "Don't attempt to overload, probe or circumvent the service's limits and security.", "The service is provided as is, may change, and may be unavailable at times."]} />
        <H>Models and code</H>
        <P>The downloadable models and the site&apos;s source are © {SITE.founder}, all rights reserved, except third-party components credited on the licences page. You may download and use the models for personal, educational and research projects; for commercial use, please write to {SITE.email} first. The training data is © its authors under {RESEARCH.dataset.license}.</P>
        <H>Liability</H>
        <P>To the extent permitted by law, TinyMotion is provided without warranties, and we are not liable for losses arising from its use.</P>
      </>
    ),
  },
  licences: {
    title: "Licences and credits",
    body: (
      <>
        <H>Training data</H>
        <UL items={[
          <>{RESEARCH.dataset.authors} ({RESEARCH.dataset.year}). <em>{RESEARCH.dataset.title}</em>. {RESEARCH.dataset.publisher}. <a className="link" href={RESEARCH.dataset.url}>https://doi.org/{RESEARCH.dataset.doi}</a>. Licensed under Creative Commons Attribution 4.0 International. The replay recordings and the sample CSV on this site are reconstructed from the dataset&apos;s test windows; the models are trained on its training windows.</>,
        ]} />
        <H>Software</H>
        <UL items={[
          "TensorFlow and Keras (model training and TensorFlow Lite export), Apache 2.0.",
          "Next.js and React, MIT licence. better-auth, MIT licence. Drizzle ORM, Apache 2.0.",
          "qrcode-generator by Kazuhiko Arase, MIT licence.",
          "Bricolage Grotesque (Ateliertriay), Hanken Grotesk (Hanken Design Co.) and JetBrains Mono (JetBrains), SIL Open Font Licence 1.1.",
        ]} />
        <H>Research</H>
        <P>The approach builds on the paper <em>{RESEARCH.paper.title}</em> ({RESEARCH.paper.venue}, {RESEARCH.paper.series}).</P>
      </>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return DOCS[doc] ? share({ title: DOCS[doc].title, alternates: { canonical: `/legal/${doc}` } }) : {};
}

export default async function Legal({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  setRequestLocale(locale);
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <>
      <PageHeader title={d.title} sub={`Last updated ${UPDATED}`} />
      <div className="wrap" lang="en">{d.body}</div>
    </>
  );
}
