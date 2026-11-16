"use client";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { SITE } from "@/lib/site";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="display t-h1">{t("errorTitle")}</h1>
      <p className="mt-4 text-[var(--fg-2)]">{t("errorBody", { email: SITE.email })}</p>
      {error.digest && <p className="mt-2 font-mono text-sm text-[var(--fg-2)]">ref {error.digest}</p>}
      <button type="button" onClick={reset} className="btn btn-primary mt-8">{t("retry")}</button>
    </div>
  );
}
