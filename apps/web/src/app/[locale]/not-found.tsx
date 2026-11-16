import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="display text-[8rem] leading-none text-[var(--accent)]">404</p>
      <p className="t-h3 mt-4 text-2xl">{t("notFound")}</p>
      <Link href="/" className="btn btn-primary mt-8">{t("goHome")}</Link>
    </div>
  );
}
