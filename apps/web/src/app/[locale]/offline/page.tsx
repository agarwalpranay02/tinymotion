import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata = { robots: { index: false } };

export default async function Offline({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="display t-h1">{t("offlineTitle")}</h1>
      <p className="mt-4 text-[1.15rem] muted">{t("offlineBody")}</p>
      <Link href="/live" className="btn btn-primary mt-8">Go live</Link>
    </div>
  );
}
