import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  summarizeSourceHealth,
  type SourceHealthEntry,
  type SourceHealthView,
} from "@/app/review/source-health";
import { SourceHealthPageHeader } from "@/components/source-health-page-header";
import { statusBarClass, statusTextClass } from "@/components/source-run-legend";
import { cn } from "@/lib/utils";

/**
 * The source list. An empty entries array is a successful read that
 * found no source rows. Missing checker warnings stay visible either way.
 * The counts use the rows already loaded. They do not ask the database
 * for a new list. Each row opens that source's visit history.
 * The left bar is the latest visit. The archive sentence is the latest
 * snapshot, which can be older than that visit.
 */
export function SourceHealthList({ view }: { view: SourceHealthView }) {
  return (
    <div>
      <SourceHealthPageHeader summary={summarizeSourceHealth(view)} />
      {view.missingCheckerWarnings.length === 0 ? null : (
        <ul className="mt-8 grid gap-2">
          {view.missingCheckerWarnings.map((warning) => (
            <li
              key={warning}
              className="border-l-2 border-l-status-warning px-4 py-2 text-sm leading-6 break-all text-foreground"
            >
              {warning}
            </li>
          ))}
        </ul>
      )}
      {view.entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No sources are tracked yet.</p>
      ) : (
        <ul className="mt-6 overflow-hidden rounded-xl border border-border">
          {view.entries.map((entry) => (
            <SourceHealthRow key={entry.href} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceHealthRow({ entry }: { entry: SourceHealthEntry }) {
  return (
    <li className="border-b border-b-border last:border-b-0">
      <Link
        href={entry.href}
        className={cn(
          "flex items-start justify-between gap-4 border-l-2 px-4 py-4 hover:bg-secondary",
          statusBarClass(entry.visitColor),
        )}
      >
        <span className="min-w-0 space-y-1 text-sm leading-6">
          <span className="block font-mono break-all text-foreground tabular-nums">{entry.url}</span>
          <span className="flex flex-wrap gap-x-3 text-muted-foreground">
            <span>{entry.typeText}</span>
            <span>{entry.activeText}</span>
          </span>
          {entry.outcomeText === null ? (
            <span className="block text-muted-foreground">{entry.lastCheckedText}</span>
          ) : (
            <>
              <span className="block font-mono text-muted-foreground tabular-nums">
                Last checked {entry.lastCheckedText}.
              </span>
              <span className="block font-mono text-muted-foreground tabular-nums">
                {entry.outcomeText}. {entry.checkedAtText}.{" "}
                {entry.httpStatusText === "no HTTP status"
                  ? "No HTTP status."
                  : `HTTP status: ${entry.httpStatusText}.`}
              </span>
              {entry.note === null ? null : (
                <span className="block text-foreground">Note: {entry.note}</span>
              )}
            </>
          )}
          <span className={cn("block", statusTextClass(entry.archiveColor))}>{entry.archiveText}</span>
          {entry.warning === null ? null : (
            <span className="block text-foreground">{entry.warning}</span>
          )}
        </span>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-tertiary-foreground"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
