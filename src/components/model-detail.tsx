import Link from "next/link";
import type {
  ModelDetailChangeEvent,
  ModelDetailChangeLine,
  ModelDetailView,
} from "@/app/models/model-detail-view";
import { DirectionMark, TieredPrices } from "@/components/tiered-prices";

/**
 * The checked detail. The view already decided the current price, the
 * wording, the official link, and the history. This component only
 * renders that. An empty price is a successful read that found no open
 * version. An empty history is a successful read that found no chartable
 * period. The review banner is a sentence, not a second price.
 */
export function ModelDetail({ view }: { view: ModelDetailView }) {
  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/models" className="hover:text-foreground">
            Models
          </Link>
          <span>
            {" "}
            / {view.labName} / {view.modelName}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-page-title font-semibold tracking-tight text-foreground">
            {view.modelName}
          </h1>
          {view.retired ? (
            <span className="text-meta text-tertiary-foreground">Retired</span>
          ) : null}
        </div>
        {view.versionCount > 0 && view.sinceDay !== null ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {view.versionCount} price {view.versionCount === 1 ? "version" : "versions"} since{" "}
            {view.sinceDay}
          </p>
        ) : null}
        {view.changeUnderReview ? (
          <div className="mt-4 rounded-md border border-border border-l-2 border-l-status-warning bg-secondary">
            <p className="px-3 py-2 text-sm text-foreground" role="status">
              A possible change is under review.
            </p>
          </div>
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

      <TieredPrices tiers={view.tiers} skipped={view.history.skipped} notes={view.history.notes} />
      <ChangeLog events={view.events} sinceDay={view.sinceDay} />
    </div>
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
      <h2 className="text-base font-medium">Change log</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {sinceDay === null
            ? "No price changes are published."
            : `No price changes since ${sinceDay}.`}
        </p>
      ) : (
        <ol className="mt-4 border-l border-border">
          {events.map((event) => (
            <li
              key={`${event.dateLine}\t${event.changes.map((change) => change.dimensionLabel).join(",")}`}
              className="relative pb-8 pl-6 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="absolute top-1 left-0 size-2 -translate-x-1/2 rounded-full border border-border bg-background"
              />
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
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function moveText(change: ModelDetailChangeLine): string {
  return `${change.fromAmountText ?? "—"} → ${change.toAmountText ?? "—"}`;
}
