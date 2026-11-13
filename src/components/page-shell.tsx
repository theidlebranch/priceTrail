import { Suspense, type ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeaderFallback } from "@/components/site-header";
import { SiteHeaderSlot } from "@/components/site-header-slot";

/**
 * The path and the sign-in cookie are request data. On a model URL they
 * are not known while Next.js builds the static shell, so the header sits
 * in Suspense. The fallback is the signed-out bar with no link marked
 * current. The bar is sticky, so a second review row pushes the page
 * down instead of covering it.
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
      <SiteFooter />
    </>
  );
}
