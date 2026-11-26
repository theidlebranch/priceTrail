import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { OfficialCandidateListEntry } from "@/app/review/official-candidate-view";

/**
 * Official models that are not in the catalog yet.
 * Prices stay on the detail page. An empty array is a real empty list.
 */
export function OfficialCandidateList({
  entries,
}: {
  entries: readonly OfficialCandidateListEntry[];
}) {
  const fresh = entries.filter((entry) => entry.kind === "new_name");
  const retiring = entries.filter((entry) => entry.kind === "retirement");
  const missing = entries.filter((entry) => entry.kind === "gone");
  const count = fresh.length === 1 ? "1 new model" : `${fresh.length} new models`;

  return (
    <section className="mt-16 space-y-12">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">New models</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          These names are on an official pricing page and are not tracked yet. Add and publish
          creates the model and publishes the price from that page.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">{count}</p>
        <Rows entries={fresh} empty="No new models are waiting." />
      </div>
      {retiring.length === 0 ? null : (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Retirements</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            The pricing page note says retired or deprecated. Accept marks the model retired and
            does not publish a price.
          </p>
          <Rows entries={retiring} empty="" />
        </div>
      )}
      {missing.length === 0 ? null : (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Missing from the pricing page</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            These tracked models were missing from two good visits. Accept marks the model retired.
            The published price stays.
          </p>
          <Rows entries={missing} empty="" />
        </div>
      )}
    </section>
  );
}

function Rows({
  entries,
  empty,
}: {
  entries: readonly OfficialCandidateListEntry[];
  empty: string;
}) {
  if (entries.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="mt-6 overflow-hidden rounded-xl border border-border">
      {entries.map((entry) => (
        <li key={entry.href} className="border-b border-border last:border-b-0">
          <Link
            href={entry.href}
            className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-secondary"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium text-foreground">{entry.modelName}</span>
                <span className="text-muted-foreground">{entry.labName}</span>
              </span>
              <span className="mt-1 block font-mono text-sm text-tertiary-foreground">
                {entry.firstSeenText}
              </span>
              <span className="mt-1 block font-mono text-sm break-all text-muted-foreground">
                {entry.sourceUrl}
              </span>
            </span>
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-tertiary-foreground"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
