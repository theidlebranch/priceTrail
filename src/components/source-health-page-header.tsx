import Link from "next/link";
import type { SourceHealthSummary } from "@/app/review/source-health";
import { SourceRunLegend } from "@/components/source-run-legend";
import { buttonVariants } from "@/components/ui/button";

/**
 * The source health heading. The loading fallback and the loaded list
 * both use it, so the title, description, and back link cannot drift
 * apart. The counts and the color key are omitted while the rows are
 * still unknown.
 */
export function SourceHealthPageHeader({ summary }: { summary?: SourceHealthSummary }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-48 flex-1">
        <h1 className="text-page-title font-semibold tracking-tight">Source health</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every stored page, its latest check, and whether the schedule still looks up that URL.
          A warning here is not a published price.
        </p>
        {summary !== undefined ? (
          <>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-tertiary-foreground tabular-nums">
              <span>{sourceCountLabel(summary.sources)}</span>
              <span>{attentionCountLabel(summary.needsAttention)}</span>
              <span>{healthyCountLabel(summary.healthy)}</span>
            </p>
            <SourceRunLegend />
          </>
        ) : null}
      </div>
      <Link href="/review" className={buttonVariants({ variant: "outline" })}>
        Back to the review queue
      </Link>
    </header>
  );
}

function sourceCountLabel(count: number): string {
  return count === 1 ? "1 source" : `${count} sources`;
}

function attentionCountLabel(count: number): string {
  return count === 1 ? "1 needs attention" : `${count} need attention`;
}

function healthyCountLabel(count: number): string {
  return count === 1 ? "1 healthy" : `${count} healthy`;
}
