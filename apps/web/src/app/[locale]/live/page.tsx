import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Live } from "@/components/Live";
import { PageHeader } from "@/components/PageHeader";
import { share } from "@/lib/seo";

export const metadata: Metadata = share({
  title: "Live activity recognition",
  description: "Put your phone in your pocket and watch it recognise walking, stairs, sitting, standing and lying, every half second, on the device.",
  alternates: { canonical: "/live" },
});

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <>
      <PageHeader kicker="live · on-device" title="What are you doing right now?" sub="Your phone's accelerometer and gyroscope, read by a tiny neural network on the phone. Nothing is uploaded." />
      <div className="wrap">
        <Live />
      </div>
    </>
  );
}
