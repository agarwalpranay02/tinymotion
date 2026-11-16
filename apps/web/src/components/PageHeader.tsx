import type { ReactNode } from "react";

/** Standard page opening: a short kicker line, a condensed display title and a lead. */
export function PageHeader({ title, sub, kicker, children }: { title: ReactNode; sub?: ReactNode; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <section className="wrap pb-10 pt-10 sm:pt-16">
      {kicker && <p className="mono mb-5 text-[0.85rem] text-[var(--accent)]">{kicker}</p>}
      <h1 className="display t-h1 max-w-[18ch]">{title}</h1>
      {sub && <p className="t-lead measure mt-5">{sub}</p>}
      {children}
    </section>
  );
}
