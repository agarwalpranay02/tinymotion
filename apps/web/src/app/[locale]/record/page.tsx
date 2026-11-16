import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Recorder } from "@/components/Recorder";
import { share } from "@/lib/seo";

export const metadata: Metadata = share({
  title: "Record labelled motion data",
  description: "Record your phone's accelerometer and gyroscope with activity labels and export a CSV dataset. Nothing is uploaded.",
  alternates: { canonical: "/record" },
});

export default async function RecordPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <>
      <PageHeader kicker="record · dataset builder" title="Build your own motion dataset" sub={<>Pick an activity, record a take, repeat. You get a labelled CSV that <Link className="link" href="/analyze">Analyze</Link> can score the model against, or that you can train your own model on.</>} />
      <div className="wrap">
        <Recorder />
      </div>
    </>
  );
}
