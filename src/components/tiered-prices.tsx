"use client";

import { useState } from "react";
import type {
  ModelDetailHeadline,
  ModelDetailLastChange,
  ModelDetailPriceRow,
  ModelDetailTier,
  ModelDetailView,
} from "@/app/models/model-detail-view";
import { PriceHistoryChart } from "@/components/price-history-chart";

/**
 * One tab selects a context tier. The cards, the component table, and
 * the chart all follow that choice. A model with one price has no tab
 * row. The change log stays outside this component.
 */
export function TieredPrices({
  tiers,
  skipped,
  notes,
}: {
  tiers: readonly ModelDetailTier[];
  skipped: ModelDetailView["history"]["skipped"];
  notes: readonly string[];
}) {
  const [selected, setSelected] = useState(0);
  const tier = tiers[selected] ?? tiers[0];
  const showTabs = tiers.length > 1 && tiers.every((item) => item.label !== null);

  return (
    <div className="space-y-10">
      {showTabs ? (
        <div role="tablist" aria-label="Context tier" className="flex flex-wrap gap-2">
          {tiers.map((item, index) => {
            const isSelected = item === tier;
            return (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={
                  isSelected
                    ? "rounded-md border border-primary px-2.5 py-1 text-sm text-primary"
                    : "rounded-md border border-transparent px-2.5 py-1 text-sm text-muted-foreground"
                }
                onClick={() => setSelected(index)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {tier !== undefined && tier.headlines.length > 0 ? (
        <HeadlinePrices headlines={tier.headlines} />
      ) : null}
      {tier !== undefined && tier.rows.length > 0 ? <ComponentRows rows={tier.rows} /> : null}
      <PriceHistorySection series={tier?.series ?? []} skipped={skipped} notes={notes} />
    </div>
  );
}

function HeadlinePrices({ headlines }: { headlines: readonly ModelDetailHeadline[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {headlines.map((headline) => (
        <article key={headline.label} className="rounded-xl border border-border bg-card p-4">
          <p className="text-meta text-muted-foreground">{headline.label}</p>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-foreground">
            {headline.amountText}
          </p>
          <p className="text-meta text-muted-foreground">/ 1M tokens</p>
          {headline.change === null ? null : (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <DirectionMark direction={headline.change.direction} pctText={headline.change.pctText} />
              <span>
                was {headline.change.previousAmountText} · {headline.change.previousDateLine}
              </span>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function ComponentRows({ rows }: { rows: readonly ModelDetailPriceRow[] }) {
  return (
    <section>
      <h2 className="text-base font-medium">Price components</h2>
      <p className="mt-1 text-sm text-muted-foreground">USD per 1M tokens.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row) => (
              <PriceRow
                key={`${row.dimensionLabel}\t${row.conditionLabel}\t${row.amountText}`}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PriceRow({ row }: { row: ModelDetailPriceRow }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 align-baseline">
        <p className="text-foreground">{row.dimensionLabel}</p>
        {row.conditionLabel.length > 0 ? (
          <p className="font-mono text-xs text-muted-foreground">{row.conditionLabel}</p>
        ) : null}
        {row.multiplierText !== null ? (
          <p className="font-mono text-xs text-muted-foreground">{row.multiplierText}</p>
        ) : null}
        {row.lastChange === null ? null : (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <DirectionMark direction={row.lastChange.direction} pctText={row.lastChange.pctText} />
            <span>{row.lastChange.dateLine}</span>
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right align-baseline font-mono font-semibold tabular-nums text-foreground">
        {row.amountText}
      </td>
    </tr>
  );
}

function PriceHistorySection({
  series,
  skipped,
  notes,
}: {
  series: ModelDetailTier["series"];
  skipped: ModelDetailView["history"]["skipped"];
  notes: readonly string[];
}) {
  const hasSeries = series.length > 0;
  const empty = !hasSeries && skipped.length === 0 && notes.length === 0;

  return (
    <section>
      <h2 className="text-base font-medium">Price history</h2>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">No price history is published.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {hasSeries ? (
            <div className="rounded-xl border border-border p-4">
              <PriceHistoryChart series={series} />
            </div>
          ) : null}
          {skipped.map((item) => (
            <p key={item.dimension} className="text-sm text-muted-foreground">
              {item.label} has a tier, so it is not on this chart.
            </p>
          ))}
          {notes.map((note) => (
            <p key={note} className="text-sm text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export function DirectionMark({
  direction,
  pctText,
}: {
  direction: ModelDetailLastChange["direction"];
  pctText: string | null;
}) {
  if (direction === null) {
    return null;
  }

  const arrow = direction === "down" ? "↓" : "↑";
  const tone = direction === "down" ? "text-primary" : "text-chart-3";
  const label = pctText === null ? arrow : `${arrow} ${pctText}%`;

  return <span className={`font-mono text-xs font-medium ${tone}`}>{label}</span>;
}
