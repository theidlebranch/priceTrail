import { Card } from "@/components/ui/card";

const prices = [
  { label: "Input", price: "$2.00", tone: "text-foreground" },
  { label: "Cache read", price: "$0.50", tone: "text-primary" },
  { label: "Output", price: "$8.00", tone: "text-foreground" },
];

export function PricePreviewCard() {
  return (
    <Card className="gap-0 overflow-hidden rounded-md border-border bg-card py-0 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate text-sm font-semibold">
            Example Provider · example-model-1
          </span>
        </div>
        <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
          EXAMPLE DATA
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 border-b border-border pb-3 text-center">
          {prices.map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-border bg-muted/70 p-2.5"
            >
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">
                {item.label}
              </p>
              <p className={`font-mono text-base font-semibold ${item.tone}`}>
                {item.price}
              </p>
              <p className="text-[10px] text-muted-foreground">/ 1M tokens</p>
            </div>
          ))}
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Effective:</dt>
            <dd className="font-mono text-xs font-medium">
              Changed on or before Oct 3, 2026
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Last checked:</dt>
            <dd className="inline-flex items-center gap-1.5 font-mono text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500" />2 hours
              ago
            </dd>
          </div>
        </dl>

        <div className="space-y-2 border-t border-border pt-3 font-mono text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted-foreground">Source:</span>
            <span className="text-primary">provider.example/pricing</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted-foreground">Archived copy:</span>
            <span className="text-secondary-foreground">
              web.archive.org/web/…
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted px-4 py-2 font-mono text-[10px] text-muted-foreground">
        <span>SHA-256: e8b9410f…7b12</span>
        <span>Example only</span>
      </div>
    </Card>
  );
}
