import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteFooterFallback } from "@/components/site-footer";
import { SiteHeaderFallback } from "@/components/site-header";
import { SiteHeaderSlot } from "@/components/site-header-slot";

/**
 * The path and the sign-in cookie are request data. On a model URL they
 * are not known while Next.js builds the static shell, so the header and
 * the footer sit in Suspense. The header fallback is the signed-out bar
 * with no link marked current. The footer fallback shows only Receipts.
 * The bar is sticky, so a second review row pushes the page down instead
 * of covering it.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeaderSlot />
      </Suspense>
      <main id="top" className="min-h-screen">
        {children}
      </main>
      <Suspense fallback={<SiteFooterFallback />}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
