import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Analyzer } from "@/components/Analyzer";
import { PageHeader } from "@/components/PageHeader";
import { share } from "@/lib/seo";

export const metadata: Metadata = share({
  title: "Analyze a sensor recording",
  description: "Turn a phone accelerometer and gyroscope recording (CSV) into an activity timeline, in your browser. Files are never uploaded.",
  alternates: { canonical: "/analyze" },
});

export default async function AnalyzePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <>
      <PageHeader kicker="analyze · offline" title="Turn a recording into a timeline" sub="Drop a CSV from TinyMotion or any phone sensor logger. Columns and units are detected for you; check them, then analyse. The file stays on this device." />
      <div className="wrap">
        <Analyzer />
      </div>
    </>
  );
}
