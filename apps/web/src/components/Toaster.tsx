"use client";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { subscribe, type Toast } from "@/lib/toast";

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribe(setItems), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      {items.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span>{t.text}</span>
          {t.href && <Link href={t.href} className="font-[650] text-[var(--accent)] underline-offset-4 hover:underline">{t.action ?? "Open"}</Link>}
        </div>
      ))}
    </div>
  );
}
