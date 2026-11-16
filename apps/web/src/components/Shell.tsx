"use client";

import { useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { MODEL_VERSION } from "@/lib/engine/version";
import { InstallButton } from "./InstallButton";
import { LogoMark, Wordmark } from "./Logo";

export const MODES = [
  { href: "/", label: "Overview", hint: "What TinyMotion is", icon: "M4 5h16v14H4zM4 10h16M9 10v9" },
  { href: "/live", label: "Live", hint: "Recognise your movement now", icon: "M2.5 12h3.5l2.5-6 4 12 3-9 2 3h4" },
  { href: "/analyze", label: "Analyze", hint: "Recording to timeline", icon: "M4 19h16M7 16V10M12 16V6M17 16v-4" },
  { href: "/record", label: "Record", hint: "Build a labelled dataset", icon: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 3v2M12 19v2M3 12h2M19 12h2" },
  { href: "/studio", label: "Studio", hint: "Models for microcontrollers", icon: "M8 8h8v8H8zM10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4" },
  { href: "/research", label: "Research", hint: "Protocol and every result", icon: "M6 3h9l3 3v15H6zM9 11h6M9 15h6" },
  { href: "/developers", label: "API", hint: "Classify over HTTP", icon: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" },
  { href: "/about", label: "About", hint: "Who and why", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" },
] as const;

const Icon = ({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const useActive = () => {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
};

/** Desktop: a fixed instrument rail with number-key shortcuts and a status readout. */
export function Rail() {
  const isActive = useActive();
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      const n = Number(e.key);
      if (n >= 1 && n <= MODES.length) router.push(MODES[n - 1].href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-[var(--rule)] bg-[var(--bg-2)]/80 backdrop-blur lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:m-3 focus:rounded focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-[var(--accent-ink)]">Skip to content</a>
      <Link href="/" className="flex h-[4.25rem] items-center border-b border-[var(--rule)] px-5" aria-label="TinyMotion overview">
        <Wordmark />
      </Link>
      <nav aria-label="Modes" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {MODES.map((m, i) => (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={isActive(m.href) ? "page" : undefined}
                className="group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.97rem] font-[560] text-[var(--fg-2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] aria-[current=page]:bg-[var(--surface)] aria-[current=page]:text-[var(--fg)] aria-[current=page]:before:absolute aria-[current=page]:before:-left-3 aria-[current=page]:before:top-2 aria-[current=page]:before:bottom-2 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-r aria-[current=page]:before:bg-[var(--accent)]"
              >
                <Icon d={m.icon} />
                <span className="flex-1">{m.label}</span>
                <kbd className="mono rounded border border-[var(--rule-2)] px-1.5 text-[0.7rem] text-[var(--fg-3)]" aria-label={`shortcut ${i + 1}`}>{i + 1}</kbd>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-3 border-t border-[var(--rule)] p-4">
        <Link href="/account" className="flex items-center justify-between rounded-md px-2 py-1.5 text-[0.9rem] text-[var(--fg-2)] hover:text-[var(--fg)]">
          Account and API keys <span aria-hidden="true" className="mono">→</span>
        </Link>
        <InstallButton className="btn btn-ghost btn-sm w-full" />
        <p className="mono flex items-center gap-2 px-2 text-[0.7rem] text-[var(--fg-3)]">
          <span className="led" aria-hidden="true" /> on-device · model {MODEL_VERSION}
        </p>
      </div>
    </aside>
  );
}

/** Phones and tablets: a slim status bar that opens a full-screen console of mode tiles. */
export function TopBar() {
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="sticky top-0 z-40 lg:hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-[var(--accent-ink)]">Skip to content</a>
      <div className="flex h-14 items-center gap-3 border-b border-[var(--rule)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 backdrop-blur-md">
        <Link href="/" aria-label="TinyMotion overview" className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="font-[family-name:var(--font-display)] text-[1.3rem] leading-none" style={{ fontStretch: "78%", fontWeight: 740 }}>TinyMotion</span>
        </Link>
        <span className="mono ml-auto hidden items-center gap-1.5 text-[0.68rem] text-[var(--fg-3)] min-[400px]:inline-flex"><span className="led" aria-hidden="true" />on-device</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="console"
          aria-label={open ? "Close modes" : "Open modes"}
          className="mono ml-auto grid h-10 min-w-10 place-items-center rounded-md border border-[var(--rule-2)] px-2.5 text-[0.75rem] min-[400px]:ml-2"
        >
          {open ? "✕" : "MODES"}
        </button>
      </div>
      {open && (
        <div id="console" className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto bg-[var(--bg)] p-4 pb-28">
          <nav aria-label="Modes" className="grid grid-cols-2 gap-2.5">
            {MODES.map((m) => (
              <Link key={m.href} href={m.href} aria-current={isActive(m.href) ? "page" : undefined} className="panel flex min-h-28 flex-col justify-between p-4 aria-[current=page]:border-[var(--accent)]">
                <span className="text-[var(--accent)]"><Icon d={m.icon} className="h-6 w-6" /></span>
                <span>
                  <span className="block font-[650]">{m.label}</span>
                  <span className="t-small faint block leading-snug">{m.hint}</span>
                </span>
              </Link>
            ))}
            <Link href="/account" className="panel col-span-2 flex items-center justify-between p-4">
              <span className="font-[650]">Account and API keys</span>
              <span aria-hidden="true" className="mono text-[var(--fg-3)]">→</span>
            </Link>
          </nav>
          <InstallButton className="btn btn-ghost mt-4 w-full" />
        </div>
      )}
    </div>
  );
}

/** A floating capsule that starts live recognition, on phones, everywhere except the Live page. */
export function LiveCapsule() {
  const pathname = usePathname();
  if (pathname.startsWith("/live")) return null;
  return (
    <Link
      href="/live"
      className="mono fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-3 text-[0.82rem] font-[700] tracking-wide text-[var(--accent-ink)] shadow-[0_10px_30px_-8px_rgb(154_140_242/0.85)] active:translate-y-px lg:hidden"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--accent-ink)]" aria-hidden="true" />
      GO LIVE
    </Link>
  );
}
