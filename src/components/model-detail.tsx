import Link from "next/link";
import type {
  ModelDetailChangeEvent,
  ModelDetailChangeLine,
  ModelDetailHeadline,
  ModelDetailLastChange,
  ModelDetailPriceRow,
  ModelDetailView,
} from "@/app/models/model-detail-view";
import { PriceHistoryChart } from "@/components/price-history-chart";

/**
 * The checked detail. The view already decided the current price, the
 * wording, the official link, and the history. This component only
 * renders that. An empty price is a successful read that found no open
 * version. An empty history is a successful read that found no chartable
 * period.
 */
export function ModelDetail({ view }: { view: ModelDetailView }) {
  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-xs text-muted-foreground">
          <Link href="/models" className="hover:text-foreground">
            Models
          </Link>
          <span> / {view.labName} / {view.modelName}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[44px] lg:leading-[1.1] lg:tracking-[-0.04em]">
            {view.modelName}
          </h1>
          {view.retired ? (
            <span className="rounded border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Retired
            </span>
          ) : null}
        </div>
        {view.versionCount > 0 && view.sinceDay !== null ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {view.versionCount} price {view.versionCount === 1 ? "version" : "versions"} since{" "}
            {view.sinceDay}
          </p>
        ) : null}
        {view.price === null ? (
          <p className="mt-4 text-sm text-muted-foreground">No current price is published.</p>
        ) : (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-xs text-foreground">{view.price.dateLine}</span>
            <a
              href={view.price.sourceUrl}
              className="text-primary hover:underline"
              rel="noreferrer"
              target="_blank"
            >
              {view.price.sourceLabel}
            </a>
          </p>
        )}
      </header>

      {view.headlines.length > 0 ? <HeadlinePrices headlines={view.headlines} /> : null}
      {view.price !== null && view.price.components.length > 0 ? (
        <ComponentRows rows={view.price.components} />
      ) : null}
      <PriceHistorySection history={view.history} />
      <ChangeLog events={view.events} sinceDay={view.sinceDay} />
    </div>
  );
}

function HeadlinePrices({ headlines }: { headlines: readonly ModelDetailHeadline[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {headlines.map((headline) => (
        <article key={headline.label} className="rounded-md border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {headline.label}
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground">
            {headline.amountText}
          </p>
          <p className="text-[10px] text-muted-foreground">/ 1M tokens</p>
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
      <h2 className="text-sm font-semibold">Price components</h2>
      <p className="mt-1 text-sm text-muted-foreground">USD per 1M tokens.</p>
      <div className="mt-2">
        {rows.map((row) => (
          <div
            key={`${row.dimensionLabel}\t${row.conditionLabel}\t${row.amountText}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3"
          >
            <div className="min-w-40 flex-1">
              <p className="text-sm text-foreground">{row.dimensionLabel}</p>
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
            </div>
            <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {row.amountText}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceHistorySection({ history }: { history: ModelDetailView["history"] }) {
  const hasSeries = history.series.length > 0;
  const empty = !hasSeries && history.skipped.length === 0;

  return (
    <section>
      <h2 className="text-sm font-semibold">Price history</h2>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">No price history is published.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {hasSeries ? (
            <div className="rounded-md border border-border bg-card p-4">
              <PriceHistoryChart series={history.series} />
            </div>
          ) : null}
          {history.skipped.map((item) => (
            <p key={item.dimension} className="text-sm text-muted-foreground">
              {item.label} has a tier, so it is not on this chart.
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function ChangeLog({
  events,
  sinceDay,
}: {
  events: readonly ModelDetailChangeEvent[];
  sinceDay: string | null;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Change log</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {sinceDay === null
            ? "No price changes are published."
            : `No price changes since ${sinceDay}.`}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {events.map((event) => (
            <article
              key={`${event.dateLine}\t${event.changes.map((change) => change.dimensionLabel).join(",")}`}
              className="rounded-md border border-border bg-card p-4"
            >
              <p className="font-mono text-xs text-foreground">{event.dateLine}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.changes.length}{" "}
                {event.changes.length === 1 ? "component" : "components"} changed
              </p>
              <ul className="mt-3 space-y-2">
                {event.changes.map((change) => (
                  <li
                    key={`${change.dimensionLabel}\t${change.conditionLabel}\t${change.fromAmountText}\t${change.toAmountText}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                  >
                    <span className="text-sm text-foreground">
                      {change.dimensionLabel}
                      {change.conditionLabel.length > 0 ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {change.conditionLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
                      <span>{moveText(change)}</span>
                      <DirectionMark direction={change.direction} pctText={change.pctText} />
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DirectionMark({
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

function moveText(change: ModelDetailChangeLine): string {
  return `${change.fromAmountText ?? "—"} → ${change.toAmountText ?? "—"}`;
}
