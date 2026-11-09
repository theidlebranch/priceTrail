import { Suspense, type ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";

/**
 * The path is request data. On a model URL it is not known while Next.js
 * builds the static shell, so the header that reads it sits in Suspense.
 * The fallback is the same bar with no link marked current. A known URL
 * such as / or /models does not suspend, so its first HTML still has the
 * real header.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeader />
      </Suspense>
      <main id="top" className="min-h-screen pt-14">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
