"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export function ContactForm() {
  const t = useTranslations("contact");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  return state === "sent" ? (
    <p role="status" className="t-h3 rounded-[10px] border border-[var(--color-led)]/40 bg-[var(--color-led)]/10 p-6">{t("sent")}</p>
  ) : (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fd, locale }) });
        if (r.ok) setState("sent");
        else { setErr((await r.json()).error?.message ?? "Error"); setState("error"); }
      }}
    >
      <label className="block"><span className="font-[600]">{t("name")}</span><input name="name" required maxLength={100} autoComplete="name" className="field mt-2" /></label>
      <label className="block"><span className="font-[600]">{t("email")}</span><input name="email" type="email" required maxLength={200} autoComplete="email" className="field mt-2" /></label>
      <label className="block sm:col-span-2"><span className="font-[600]">{t("org")}</span><input name="org" maxLength={150} autoComplete="organization" className="field mt-2" /></label>
      <label className="block sm:col-span-2"><span className="font-[600]">{t("message")}</span><textarea name="message" required minLength={5} maxLength={4000} rows={5} className="field mt-2" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={state === "busy"}>{t("send")}</button>
        {state === "error" && <p role="alert" className="mt-2 text-[#ff8a7a]">{err}</p>}
      </div>
    </form>
  );
}
