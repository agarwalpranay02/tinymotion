"use client";
import { useEffect, useId, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Mode = "prompt" | "ios" | "mac-safari" | "firefox-android" | null;

/** Steps for browsers that install web apps from their own menu instead of a prompt. */
const STEPS: Record<"ios" | "mac-safari" | "firefox-android", { title: string; steps: string[] }> = {
  ios: {
    title: "Install on iPhone or iPad",
    steps: [
      "Open this page in Safari (or Chrome, on iOS 16.4 and later).",
      "Tap the Share button (the square with an arrow pointing up).",
      "Scroll down and tap “Add to Home Screen”, then “Add”.",
    ],
  },
  "firefox-android": {
    title: "Install on Android",
    steps: ["Tap the menu button (⋮) in Firefox.", "Tap “Add app to Home screen” (or “Install”), then “Add”."],
  },
  "mac-safari": {
    title: "Install on Mac",
    steps: ["In Safari, open the File menu (or the Share button).", "Choose “Add to Dock”, then “Add”."],
  },
};

function detect(): Mode {
  if (typeof window === "undefined") return null;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  const macSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|OPR/.test(ua);
  if (macSafari) return "mac-safari";
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return "firefox-android";
  return null;
}

/**
 * "Install app": uses the browser's install prompt where there is one (Chrome, Edge,
 * Samsung Internet, Android), and shows the Add to Home Screen / Add to Dock steps on
 * Safari, which installs web apps from its Share menu instead.
 */
export function InstallButton({ className = "", label = "Install app" }: { className?: string; label?: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setMode("prompt"); };
    const done = () => { setEvt(null); setMode(null); setOpen(false); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    const t = setTimeout(() => setMode((m) => m ?? detect()), 0);
    return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); };
  }, []);

  if (!mode) return null;
  const icon = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );

  if (mode === "prompt" && evt) {
    return (
      <button type="button" className={className} onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); setMode(null); }}>
        {icon}
        {label}
      </button>
    );
  }
  if (mode === "prompt") return null;

  const guide = STEPS[mode];
  return (
    <span className="relative inline-flex flex-col">
      <button type="button" className={className} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label}
      </button>
      {open && (
        <span
          id={panelId}
          role="dialog"
          aria-label={guide.title}
          className="z-50 mt-2 block w-72 max-w-[calc(100vw-2rem)] rounded-[8px] bg-[var(--surface)] p-4 text-left text-[0.95rem] text-[var(--fg)] shadow-xl ring-1 ring-[var(--rule)] lg:absolute lg:right-0 lg:top-full"
        >
          <span className="t-h3 block text-lg">{guide.title}</span>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            {guide.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <span className="mt-2 block text-sm text-[var(--fg-2)]">It opens full screen like an app and works offline.</span>
        </span>
      )}
    </span>
  );
}
