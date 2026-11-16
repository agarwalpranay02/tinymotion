/**
 * TinyMotion mark: a microcontroller with a stride signal running through it. The trace enters
 * at one side, becomes the rhythm of a walk on the die, and leaves at the other: motion in,
 * understanding out, all on the chip.
 */
export const LOGO_PATHS = {
  body: "M11 8.5h18a2.5 2.5 0 0 1 2.5 2.5v18a2.5 2.5 0 0 1-2.5 2.5H11A2.5 2.5 0 0 1 8.5 29V11A2.5 2.5 0 0 1 11 8.5Z",
  pins: "M14.5 3.5v5M20 3.5v5M25.5 3.5v5M14.5 31.5v5M20 31.5v5M25.5 31.5v5",
  trace: "M2.5 20.5h8.5l2.6-6.5 3.6 13 3.4-10.5 2.6 7 2.4-4.5h11.9",
};

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <path d={LOGO_PATHS.pins} stroke="var(--fg-3)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d={LOGO_PATHS.body} fill="var(--surface)" stroke="var(--fg)" strokeWidth="2.2" />
      <path d={LOGO_PATHS.trace} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9" />
      <span className="font-[family-name:var(--font-display)] text-[1.5rem] leading-none tracking-[-0.025em]" style={{ fontStretch: "78%", fontWeight: 740 }}>
        TinyMotion
      </span>
    </span>
  );
}
