"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pageLinks = [{ label: "Receipts", href: "/receipts" }];

const landingLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Honest by design", href: "#honest" },
];

/**
 * Receipts is its own page, so it stays on every route. How it works and
 * Honest by design are sections of the landing page, so they only show
 * there and scroll that page.
 *
 * The path is request data. The fallback passes an empty path, so the
 * static shell shows only Receipts until the real path streams in.
 */
function SiteFooterBar({ pathname }: { pathname: string }) {
  const links = pathname === "/" ? [...pageLinks, ...landingLinks] : pageLinks;

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-5 border-b border-border pb-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-2">
            <span className="text-sm font-semibold uppercase tracking-tight">PriceTrail</span>
            <p className="text-sm leading-6 text-muted-foreground">
              PriceTrail is an independent project and is not affiliated with OpenAI, Anthropic, or Google. Providers are authoritative for billing. Source copies are archived with the Internet Archive where possible.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="pt-4 font-mono text-xs text-muted-foreground">
          <span>© 2026 PriceTrail</span>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  return <SiteFooterBar pathname={pathname} />;
}

export function SiteFooterFallback() {
  return <SiteFooterBar pathname="" />;
}
