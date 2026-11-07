import {
  sourceEntryNeedsAttention,
  summarizeSourceHealth,
  type SourceHealthEntry,
  type SourceHealthView,
} from "@/app/review/source-health";
import { SourceHealthPageHeader } from "@/components/source-health-page-header";
import { cn } from "@/lib/utils";

/**
 * The source list. An empty entries array is a successful read that
 * found no source rows. Missing checker warnings stay visible either way.
 * The counts use the rows already loaded. They do not ask the database
 * for a new list.
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
            <SourceHealthRow key={entry.url} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceHealthRow({ entry }: { entry: SourceHealthEntry }) {
  const needsAttention = sourceEntryNeedsAttention(entry);

  return (
    <li
      className={cn(
        "border-b border-b-border border-l-2 px-4 py-4 last:border-b-0",
        needsAttention ? "border-l-status-warning" : "border-l-transparent",
      )}
    >
      <div className="min-w-0 space-y-1 text-sm leading-6">
        <p className="font-mono break-all text-foreground tabular-nums">{entry.url}</p>
        <p className="flex flex-wrap gap-x-3 text-muted-foreground">
          <span>{entry.typeText}</span>
          <span>{entry.activeText}</span>
        </p>
        {entry.outcomeText === null ? (
          <p className="text-muted-foreground">{entry.lastCheckedText}</p>
        ) : (
          <>
            <p className="font-mono text-muted-foreground tabular-nums">
              Last checked {entry.lastCheckedText}.
            </p>
            <p className="font-mono text-muted-foreground tabular-nums">
              {entry.outcomeText}. {entry.checkedAtText}.{" "}
              {entry.httpStatusText === "no HTTP status"
                ? "No HTTP status."
                : `HTTP status: ${entry.httpStatusText}.`}
            </p>
            {entry.note === null ? null : <p className="text-foreground">Note: {entry.note}</p>}
          </>
        )}
        <p className="text-muted-foreground">{entry.archiveText}</p>
        {entry.warning === null ? null : <p className="text-foreground">{entry.warning}</p>}
      </div>
    </li>
  );
}
