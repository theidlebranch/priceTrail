import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ModelDetailPriceRow, ModelDetailView } from "@/app/models/model-detail-view";
import { Card } from "@/components/ui/card";

/**
 * The checked detail. The view already decided the current price, the
 * wording, and the official link. This component only renders that.
 * An empty price is a successful read that found no open version.
 *
 * The price card follows the landing-page receipt: a header, price
 * tiles, the effective date, and the source link. Fields the landing
 * example invents (last checked, archive, hash) stay off this page.
 */
export function ModelDetail({ view }: { view: ModelDetailView }) {
  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <Link
          href="/models"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All models
        </Link>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="rounded border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {view.labName}
          </span>
          {view.retired ? (
            <span className="rounded border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Retired
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[44px] lg:leading-[1.18]">
          {view.modelName}
        </h1>
      </div>

      <div className="lg:col-span-5">
        {view.price === null ? (
          <Card className="gap-0 overflow-hidden rounded-md border-border bg-card py-0 shadow-sm">
            <CardTitleRow labName={view.labName} modelName={view.modelName} />
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No current price is published.
            </p>
          </Card>
        ) : (
          <PriceCard labName={view.labName} modelName={view.modelName} price={view.price} />
        )}
      </div>
    </div>
  );
}

function CardTitleRow({ labName, modelName }: { labName: string; modelName: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">
          {labName} · {modelName}
        </span>
      </div>
    </div>
  );
}

function PriceCard({
  labName,
  modelName,
  price,
}: {
  labName: string;
  modelName: string;
  price: NonNullable<ModelDetailView["price"]>;
}) {
  const tiles = tileOrder(price.components);

  return (
    <Card className="gap-0 overflow-hidden rounded-md border-border bg-card py-0 shadow-sm">
      <CardTitleRow labName={labName} modelName={modelName} />

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 border-b border-border pb-3 text-center">
          {tiles.map((row) => (
            <PriceTile
              key={`${row.dimensionLabel}\t${row.conditionLabel}\t${row.amountText}`}
              row={row}
            />
          ))}
        </div>

        <dl className="text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Effective:</dt>
            <dd className="font-mono text-xs font-medium">{price.dateLine}</dd>
          </div>
        </dl>

        <div className="border-t border-border pt-3 font-mono text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted-foreground">Source:</span>
            <a
              href={price.sourceUrl}
              className="text-primary hover:underline"
              rel="noreferrer"
              target="_blank"
            >
              {price.sourceLabel}
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PriceTile({ row }: { row: ModelDetailPriceRow }) {
  const tone = row.dimensionLabel === "Cache read" ? "text-primary" : "text-foreground";

  return (
    <div className="rounded-md border border-border bg-muted/70 p-2.5">
      <p className="mb-1 text-[10px] uppercase leading-tight text-muted-foreground">
        {row.dimensionLabel}
      </p>
      <p className={`font-mono text-base font-semibold ${tone}`}>{row.amountText}</p>
      <p className="text-[10px] text-muted-foreground">/ 1M tokens</p>
      {row.conditionLabel.length > 0 ? (
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{row.conditionLabel}</p>
      ) : null}
    </div>
  );
}

const LEADING_TILES = ["Input", "Cache read", "Output"];

function tileOrder(rows: readonly ModelDetailPriceRow[]): ModelDetailPriceRow[] {
  return [...rows].sort((left, right) => {
    const byLabel = leadIndex(left.dimensionLabel) - leadIndex(right.dimensionLabel);
    if (byLabel !== 0) {
      return byLabel;
    }
    return left.conditionLabel.localeCompare(right.conditionLabel);
  });
}

function leadIndex(label: string): number {
  const index = LEADING_TILES.indexOf(label);
  return index === -1 ? LEADING_TILES.length : index;
}
