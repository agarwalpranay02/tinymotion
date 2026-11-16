"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; calls: number };

export function SignInPanel({ google, email, dev }: { google: boolean; email: boolean; dev: boolean }) {
  const t = useTranslations("account");
  const [addr, setAddr] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const callbackURL = "/account";

  if (!google && !email) return <p className="text-[var(--fg-2)]">{t("authUnavailable")}</p>;
  return (
    <div className="max-w-md space-y-6">
      {google && (
        <button type="button" className="btn btn-ghost w-full" onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1 4.9L5.7 14Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.6 3.4-4.6 6.3-4.6Z"/></svg>
          {t("google")}
        </button>
      )}
      {email && (sent ? (
        <p role="status" className="rounded-[8px] border border-[var(--color-led)]/40 bg-[var(--color-led)]/10 p-4 text-[var(--fg)]">{t("magicSent")}{dev && <> · <a className="link" href="/api/dev/outbox" target="_blank" rel="noreferrer">dev outbox</a></>}</p>
      ) : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr(null);
          const { error } = await authClient.signIn.magicLink({ email: addr.trim(), callbackURL });
          setBusy(false);
          if (error) setErr(error.message ?? "Error"); else setSent(true);
        }}>
          <label className="block">
            <span className="font-[600]">{t("emailLabel")}</span>
            <input type="email" required autoComplete="email" className="field mt-2" value={addr} onChange={(e) => setAddr(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>{t("magic")}</button>
          {err && <p role="alert" className="text-[#ff8a7a]">{err}</p>}
        </form>
      ))}
    </div>
  );
}

export function Dashboard({ name, email }: { name: string; email: string }) {
  const t = useTranslations("account");
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [newName, setNewName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => fetch("/api/keys").then((r) => r.json()).then((d) => setKeys(d.keys ?? []));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    const d = await r.json();
    if (!r.ok) return setErr(d.error?.message ?? "Error");
    setFresh(d.key);
    setNewName("");
    load();
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
      <section className="space-y-4 rounded-[var(--radius-frame)] bg-[var(--surface)] p-6 ring-1 ring-[var(--rule)]">
        <p className="t-h3 text-2xl">{name}</p>
        <p className="text-[var(--fg-2)]">{email}</p>
        <p className="muted">{t("plan")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={async () => { await authClient.signOut(); location.reload(); }}>{t("signOut")}</button>
        </div>
      </section>
      <section>
        <h2 className="display t-h2">{t("keys")}</h2>
        <p className="mt-2 text-[var(--fg-2)]">{t("keysSub")}</p>
        {fresh && (
          <div role="status" className="mt-4 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--surface-2)] p-4 text-[var(--fg)]">
            <p className="font-[600]">{t("keyCreated")}</p>
            <code className="mt-2 block break-all rounded-[6px] border border-[var(--rule)] bg-[var(--bg)] p-3 font-mono text-sm text-[var(--fg)]">{fresh}</code>
            <button type="button" className="btn btn-ghost mt-2 min-h-10" onClick={() => navigator.clipboard.writeText(fresh)}>Copy</button>
          </div>
        )}
        <form className="mt-4 flex gap-2" onSubmit={create}>
          <label className="flex-1"><span className="sr-only">{t("keyName")}</span>
            <input className="field" required maxLength={60} placeholder={t("keyName")} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">{t("newKey")}</button>
        </form>
        {err && <p role="alert" className="mt-2 text-[#ff8a7a]">{err}</p>}
        <ul className="mt-6 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
          {keys === null ? <li className="py-4 text-[var(--fg-2)]">…</li> : keys.length === 0 ? <li className="py-4 text-[var(--fg-2)]">{t("noKeys")}</li> : keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-[600]">{k.name}</p>
                <p className="font-mono text-sm text-[var(--fg-2)]">{k.prefix}…</p>
              </div>
              <p className="text-sm text-[var(--fg-2)]">{t("usage")}: <span className="num">{k.calls}</span></p>
              <button type="button" className="btn btn-ghost min-h-10 px-4 text-sm" onClick={async () => { await fetch(`/api/keys/${k.id}`, { method: "DELETE" }); setFresh(null); load(); }}>{t("revoke")}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
