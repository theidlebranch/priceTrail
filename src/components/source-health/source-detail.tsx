import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { SourceDetailView } from "@/app/review/source-health";
import { AttentionPanel } from "@/components/source-health/attention-panel";
import { CheckStrip } from "@/components/source-health/check-strip";
import { HistoryList } from "@/components/source-health/history-list";
import { StatusDot } from "@/components/source-health/status-dot";
import { StripLegend } from "@/components/source-health/strip-legend";
import { TimeLabel } from "@/components/source-health/time-label";
import { textToneClass } from "@/components/source-health/tones";

/** One source. The numbers come from the aggregate, not from this page of rows. */
export function SourceDetail({ view }: { view: SourceDetailView }) {
  return (
    <div>
      <nav className="text-sm text-muted-foreground">
        <Link href="/review/sources" className="underline-offset-4 hover:text-foreground hover:underline">
          Sources
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{view.host}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold tracking-tight break-all">{view.host}</h1>
          <p className="mt-1 font-mono break-all text-muted-foreground">{view.path}</p>
        </div>
        <a
          href={view.url}
          className={buttonVariants({ variant: "outline" })}
          rel="noreferrer"
          target="_blank"
        >
          Open page
        </a>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm ${textToneClass(view.tone)}`}
        >
          <StatusDot tone={view.tone} />
          {view.statusLabel}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-sm text-muted-foreground">
          {view.typeText}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-sm text-muted-foreground">
          {view.scheduleLabel}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-sm text-muted-foreground">
          All times UTC
        </span>
      </div>
      <AttentionPanel attention={view.attention} />
      <DetailStats stats={view.stats} />
      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground">Last 24 checks</h2>
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
            {view.stripStart === null ? (
              <span>No checks yet</span>
            ) : (
              <TimeLabel time={view.stripStart} display="short" />
            )}
            {view.stripEnd === null ? null : (
              <span>
                <TimeLabel time={view.stripEnd} display="short" />
                <span> (latest)</span>
              </span>
            )}
          </div>
          <CheckStrip slots={view.strip} label={view.stripLabel} tall />
          <div className="mt-4">
            <StripLegend />
          </div>
        </div>
      </section>
      {view.emptyHistoryText !== null ? (
        <p className="mt-8 text-muted-foreground">{view.emptyHistoryText}</p>
      ) : (
        <HistoryList rows={view.history} />
      )}
      {view.olderHref === null ? null : (
        <Link href={view.olderHref} className="mt-4 inline-block text-foreground underline">
          Older checks
        </Link>
      )}
    </div>
  );
}

function DetailStats({ stats }: { stats: SourceDetailView["stats"] }) {
  const snapshots = stats.archived + stats.pending + stats.failed;
  return (
    <div className="mt-6">
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-muted-foreground">Checks</h2>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {stats.checkCount}
          </p>
          <p className="mt-2 text-muted-foreground">
            {stats.firstCheck === null ? (
              "No checks yet"
            ) : (
              <>
                since <TimeLabel time={stats.firstCheck} display="short" />
              </>
            )}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-muted-foreground">Parse success</h2>
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {stats.successText}
          </p>
          <p className="mt-2 text-muted-foreground">
            {stats.checkCount === 0 ? "No checks yet" : `${stats.okCount} of ${stats.checkCount} checks`}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-muted-foreground">Last price change</h2>
          {stats.lastChange === null ? (
            <p className="mt-2 text-foreground">No price change yet</p>
          ) : (
            <>
              <p className="mt-2 text-3xl leading-none font-semibold tracking-tight">
                <TimeLabel time={stats.lastChange} display="date" />
              </p>
              <p className="mt-2 text-muted-foreground">
                <span className="tabular-nums">{stats.lastChange.clock}</span>
                <span> · snapshot </span>
                {stats.lastChange.archiveUrl === null ? (
                  <span className="font-mono">#{stats.lastChange.snapshotId}</span>
                ) : (
                  <a
                    href={stats.lastChange.archiveUrl}
                    className="font-mono text-status-info underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    #{stats.lastChange.snapshotId}
                  </a>
                )}
              </p>
            </>
          )}
        </article>
      </div>
      <article className="mt-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-muted-foreground">Wayback snapshots</h2>
        <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">{snapshots}</p>
        <p className="mt-2 text-muted-foreground">
          <span className="text-status-ok">{stats.archived} archived</span>
          <span> · </span>
          <span className="text-status-warning">{stats.pending} pending</span>
          <span> · </span>
          <span className="text-status-error">{stats.failed} failed</span>
        </p>
      </article>
    </div>
  );
}
