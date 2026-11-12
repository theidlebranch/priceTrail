import type { SourceBoardView } from "@/app/review/source-health";
import { TimeLabel } from "@/components/source-health/time-label";

/** Counts already on the view. This does not ask the database again. */
export function SummaryCards({ summary }: { summary: SourceBoardView["summary"] }) {
  return (
    <div className="mt-8">
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-muted-foreground">Sources</h2>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {summary.sourceCount}
          </p>
          <p className="mt-2 text-muted-foreground">
            {summary.activeCount} active · {summary.pausedCount} paused
          </p>
        </article>
        <article
          className={`rounded-xl border bg-card p-4 ${
            summary.attentionCount > 0 ? "border-status-warning" : "border-border"
          }`}
        >
          <h2 className="text-muted-foreground">Needs attention</h2>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {summary.attentionCount}
          </p>
          <p className="mt-2 text-muted-foreground" title={summary.attentionNames.join(", ")}>
            {summary.attentionNames.length === 0 ? "None" : summary.attentionNames.join(", ")}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-muted-foreground">Parse success</h2>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {summary.successText}
          </p>
          <p className="mt-2 text-muted-foreground" title="Paused sources are left out.">
            {summary.checkCount === 0
              ? "Last 24 checks"
              : `${summary.okCount} of ${summary.checkCount} checks`}
          </p>
          {summary.checkCount === 0 ? null : (
            <p className="text-muted-foreground">Last 24 checks</p>
          )}
        </article>
      </div>
      <article className="mt-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-muted-foreground">Latest run</h2>
        {summary.newestCheck === null ? (
          <p className="mt-2 text-foreground">No check yet</p>
        ) : (
          <>
            <p className="mt-2 text-3xl leading-none font-semibold tracking-tight">
              <TimeLabel time={summary.newestCheck} display="clock" />
            </p>
            <p className="mt-2 text-muted-foreground">{summary.nextText}</p>
          </>
        )}
      </article>
    </div>
  );
}
