import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import { LiveCapsule, Rail, TopBar } from "@/components/Shell";
import { StatusBar } from "@/components/StatusBar";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Toaster } from "@/components/Toaster";
import { SITE } from "@/lib/site";
import { SHARE_CARD } from "@/lib/seo";

export const viewport: Viewport = {
  themeColor: "#10122a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t("title"), template: `%s · ${SITE.name}` },
    description: t("description"),
    applicationName: SITE.name,
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title: t("title"),
      description: t("description"),
      locale: "en_IN",
      images: [SHARE_CARD],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description"), images: [SHARE_CARD] },
    appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black" },
    // Older iOS versions only open full screen with the apple- prefixed tag
    other: { "apple-mobile-web-app-capable": "yes" },
    formatDetection: { telephone: false },
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
    robots: { index: true, follow: true },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const t = await getTranslations({ locale, namespace: "meta" });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: SITE.url,
        logo: `${SITE.url}/icons/icon-512.png`,
        founder: { "@type": "Person", name: SITE.founder },
        email: SITE.email,
      },
      {
        "@type": "WebApplication",
        name: SITE.name,
        url: SITE.url,
        applicationCategory: "HealthApplication",
        operatingSystem: "Any (web browser)",
        inLanguage: locale,
        description: t("description"),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${SITE.url}/#org` },
      },
    ],
  };

  return (
    <html lang={locale} dir="ltr" suppressHydrationWarning>
      <body className="antialiased">
        <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex min-h-dvh">
            <Rail />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main id="main" className="flex-1">
                {children}
              </main>
              <StatusBar />
            </div>
          </div>
          <LiveCapsule />
          <Toaster />
          <ServiceWorker />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
