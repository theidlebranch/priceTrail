import Link from "next/link";
import type { SourceBoardView } from "@/app/review/source-health";
import { SOURCE_ROW_COLUMNS, SourceRow } from "@/components/source-health/source-row";
import { StripLegend } from "@/components/source-health/strip-legend";
import { SummaryCards } from "@/components/source-health/summary-cards";

const FILTERS = [
  { filter: "all", href: "/review/sources", label: "All" },
  { filter: "attention", href: "/review/sources?status=attention", label: "Needs attention" },
  { filter: "healthy", href: "/review/sources?status=healthy", label: "Healthy" },
] as const;

/**
 * The source list. An empty catalog and a filter with no rows are different
 * sentences. A missing checker line sits above the table and is not a source.
 */
export function SourcesBoard({ view }: { view: SourceBoardView }) {
  return (
    <div>
      <header>
        <h1 className="text-page-title font-semibold tracking-tight">Sources</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Pages we fetch every 6 hours, parse and archive on Wayback. A warning here never
          publishes a price.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/review"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Review queue
          </Link>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            All times UTC
          </span>
        </div>
      </header>
      <SummaryCards summary={view.summary} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((chip) => {
            const selected = view.filter === chip.filter;
            const count =
              chip.filter === "all"
                ? view.counts.all
                : chip.filter === "attention"
                  ? view.counts.attention
                  : view.counts.healthy;
            return (
              <Link
                key={chip.filter}
                href={chip.href}
                aria-current={selected ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-sm tabular-nums ${
                  selected
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {chip.label} {count}
              </Link>
            );
          })}
        </div>
        <StripLegend />
      </div>
      {view.missingCheckerWarnings.length === 0 ? null : (
        <ul className="mt-6 grid gap-2">
          {view.missingCheckerWarnings.map((warning) => (
            <li key={warning} className="text-foreground break-all">
              {warning}
            </li>
          ))}
        </ul>
      )}
      {view.entries.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          {view.counts.all === 0 ? "No sources are tracked yet." : "No sources match this filter."}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <div
            className={`hidden border-b border-border px-4 py-2.5 text-sm text-muted-foreground lg:grid lg:gap-4 ${SOURCE_ROW_COLUMNS}`}
          >
            <span>Source</span>
            <span>Last 24 checks</span>
            <span>Last check</span>
            <span>Last change</span>
            <span>Last snapshot</span>
            <span className="sr-only">Open</span>
          </div>
          {view.entries.map((entry) => (
            <SourceRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Wayback: archived, pending, or failed. A snapshot is stored when the parsed page
        changes, even when today&apos;s price already matches the site.
      </p>
    </div>
  );
}
