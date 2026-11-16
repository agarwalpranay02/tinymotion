import { Link } from "@/i18n/navigation";
import { RESEARCH, SITE } from "@/lib/site";

/** The footer, as an instrument status line. */
export function StatusBar() {
  const items: { href: string; label: string; ext?: boolean }[] = [
    { href: "/legal/privacy", label: "Privacy" },
    { href: "/legal/terms", label: "Terms" },
    { href: "/legal/licences", label: "Licences" },
    { href: SITE.github, label: "GitHub", ext: true },
    { href: `mailto:${SITE.email}`, label: "Contact", ext: true },
  ];
  return (
    <footer className="mt-24 border-t border-[var(--rule)] bg-[var(--bg-2)] pb-24 lg:pb-0">
      <div className="mono flex flex-col gap-3 px-5 py-4 text-[0.74rem] text-[var(--fg-3)] sm:px-8 xl:flex-row xl:items-center xl:gap-6">
        <span className="text-[var(--fg-2)]">© {new Date().getFullYear()} TinyMotion</span>
        <span className="hidden xl:inline" aria-hidden="true">│</span>
        <span>models and app by {SITE.founder}</span>
        <span className="hidden xl:inline" aria-hidden="true">│</span>
        <span>
          data: <a className="link" href={RESEARCH.dataset.url} target="_blank" rel="noopener noreferrer">UCI HAR</a>, {RESEARCH.dataset.license}
        </span>
        <nav aria-label="Legal and links" className="flex flex-wrap gap-x-5 gap-y-2 xl:ml-auto">
          {items.map((l) =>
            l.ext ? (
              <a key={l.href} href={l.href} className="hover:text-[var(--fg)]" target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer">{l.label}</a>
            ) : (
              <Link key={l.href} href={l.href} className="hover:text-[var(--fg)]">{l.label}</Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
