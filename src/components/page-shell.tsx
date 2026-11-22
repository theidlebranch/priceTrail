import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteFooterFallback } from "@/components/site-footer";
import { SiteHeaderFallback } from "@/components/site-header";
import { SiteHeaderSlot } from "@/components/site-header-slot";

/**
 * The path and the sign-in cookie are request data. On a model URL they
 * are not known while Next.js builds the static shell, so the chrome and
 * the footer sit in Suspense. The fallback is the signed-out bar with no
 * link marked current. The footer fallback shows only Receipts.
 *
 * A signed-in visit replaces that bar with a fixed rail. The rail is out
 * of the page flow, and `.shell:has(.signed-rail)` adds the left padding
 * on a wide screen. The page body stays outside this Suspense boundary,
 * so a slow cookie read does not remount the page.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell flex min-h-screen flex-col">
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeaderSlot />
      </Suspense>
      <div className="page-column flex min-h-0 flex-1 flex-col">
        <main id="top" className="min-h-screen flex-1">
          {children}
        </main>
        <Suspense fallback={<SiteFooterFallback />}>
          <SiteFooter />
        </Suspense>
      </div>
    </div>
  );
}
