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
  const count =
    entries.length === 1 ? "1 new model" : `${entries.length} new models`;

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-semibold tracking-tight">New models</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        These names are on an official pricing page and are not tracked yet. Add and publish
        creates the model and publishes the price from that page.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">{count}</p>
      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No new models are waiting.</p>
      ) : (
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
      )}
    </section>
  );
}
