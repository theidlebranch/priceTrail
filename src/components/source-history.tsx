import Link from "next/link";
import type { SourceCheckEntry, SourceHistoryView } from "@/app/review/source-health";
import { SourceRunLegend, statusBarClass, statusTextClass } from "@/components/source-run-legend";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One source and every stored visit, newest first. An empty check list
 * is a source that exists and has not been visited. The left bar is the
 * visit. The archive sentence is Wayback. This does not show the raw
 * page or the parsed prices.
 */
export function SourceHistory({ view }: { view: SourceHistoryView }) {
  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-48 flex-1">
          <h1 className="font-mono text-page-title font-semibold tracking-tight break-all">
            {view.url}
          </h1>
          <p className="mt-3 flex flex-wrap gap-x-3 text-sm leading-6 text-muted-foreground">
            <span>{view.typeText}</span>
            <span>{view.activeText}</span>
          </p>
          <SourceRunLegend />
        </div>
        <Link href="/review/sources" className={buttonVariants({ variant: "outline" })}>
          Back to source health
        </Link>
      </header>
      {view.checks.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">This source has not been checked yet.</p>
      ) : (
        <ol className="mt-6 overflow-hidden rounded-xl border border-border">
          {view.checks.map((check) => (
            <SourceCheckRow key={check.id} check={check} />
          ))}
        </ol>
      )}
    </div>
  );
}

function SourceCheckRow({ check }: { check: SourceCheckEntry }) {
  return (
    <li
      className={cn(
        "list-none border-b border-b-border border-l-2 px-4 py-4 last:border-b-0",
        statusBarClass(check.visitColor),
      )}
    >
      <div className="min-w-0 space-y-1 text-sm leading-6">
        <p className="font-mono text-muted-foreground tabular-nums">{check.checkedAtText}</p>
        <p className="text-foreground">
          {check.outcomeText}.{" "}
          {check.httpStatusText === "no HTTP status"
            ? "No HTTP status."
            : `HTTP status: ${check.httpStatusText}.`}
        </p>
        {check.note === null ? null : <p className="text-foreground">Note: {check.note}</p>}
        <p className={statusTextClass(check.archiveColor)}>{check.archiveText}</p>
        {check.snapshotText === null ? null : (
          <p className="text-muted-foreground">{check.snapshotText}</p>
        )}
        {check.archiveUrl === null ? null : (
          <a
            href={check.archiveUrl}
            className="block font-mono break-all text-foreground underline"
            rel="noreferrer"
            target="_blank"
          >
            {check.archiveUrl}
          </a>
        )}
      </div>
    </li>
  );
}
