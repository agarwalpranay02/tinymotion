"use client";
/** Tiny toast bus: toast("Saved", { href: "/history", action: "Open" }) from anywhere on the client. */
export type Toast = { id: number; text: string; href?: string; action?: string };
type Listener = (t: Toast[]) => void;
let items: Toast[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(items));

export function toast(text: string, opts: { href?: string; action?: string; ms?: number } = {}) {
  const t: Toast = { id: ++seq, text, href: opts.href, action: opts.action };
  items = [...items.slice(-2), t];
  emit();
  setTimeout(() => { items = items.filter((x) => x.id !== t.id); emit(); }, opts.ms ?? 3800);
}

export function subscribe(l: Listener) {
  listeners.add(l);
  l(items);
  return () => { listeners.delete(l); };
}
