import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="top" className="min-h-screen pt-14">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
