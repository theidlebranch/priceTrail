import { Info } from "lucide-react";

export function PositioningCallout() {
  return (
    <section className="border-b border-border bg-card py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-4 rounded-md border border-border bg-muted p-4 sm:p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card">
            <Info className="size-5" />
          </div>
          <p className="text-sm leading-5">
            <strong>PriceTrail is not your billing source.</strong> Providers
            are authoritative for billing. We&apos;re the historical record.
          </p>
        </div>
      </div>
    </section>
  );
}
