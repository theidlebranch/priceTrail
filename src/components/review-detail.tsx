import Link from "next/link";
import type { ReviewDetailPrice, ReviewDetailView } from "@/app/review/review-detail";
import { CopySourceUrl } from "@/components/copy-source-url";
import { ReviewDecisionForm } from "@/components/review-decision-form";

/**
 * One observation item. The amounts are parsed text from the snapshot.
 * They are not the published price. The source URL is text, not a link,
 * so a stored address cannot navigate the browser.
 *
 * Confirm and Reject are shown only while the item is flagged. The form
 * posts to the server action. This component does not publish a price.
 */
export function ReviewDetail({ view }: { view: ReviewDetailView }) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/review" className="hover:text-foreground">
            Review
          </Link>
        </p>
        <h1 className="mt-3 text-page-title font-semibold tracking-tight text-foreground">
          {view.modelName}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{view.labName}</p>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <SourceBlock view={view} />
          <PricesBlock prices={view.prices} scheduleConfirmText={view.scheduleConfirmText} />
        </div>
        <DecisionColumn view={view} />
      </div>
    </div>
  );
}

function SourceBlock({ view }: { view: ReviewDetailView }) {
  return (
    <section className="space-y-2">
      <p className="text-sm text-foreground">{view.sourceTypeLabel}</p>
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 break-all font-mono text-sm text-muted-foreground">
          {view.sourceUrl}
        </p>
        <CopySourceUrl url={view.sourceUrl} />
      </div>
      <p className="font-mono text-meta text-tertiary-foreground">Fetched {view.fetchedAtText}.</p>
    </section>
  );
}

function DecisionColumn({ view }: { view: ReviewDetailView }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm leading-6">
        <p className={`border-l-2 pl-3 ${statusTone(view.statusText)}`}>{view.statusText}</p>
        <p>{view.notPublishedText}</p>
        <p>{view.cellCheckText}</p>
        <p className="text-muted-foreground">{view.actionsText}</p>
      </div>
      {view.reviewedBy === null ? null : (
        <p className="text-sm leading-6">Reviewed by {view.reviewedBy}.</p>
      )}
      {view.reviewedAtText === null ? null : (
        <p className="font-mono text-meta text-muted-foreground">
          Reviewed at {view.reviewedAtText}.
        </p>
      )}
      {view.reviewNote === null ? null : <p className="text-sm leading-6">{view.reviewNote}</p>}
      {view.canDecide ? <ReviewDecisionForm itemId={view.itemId} /> : null}
    </div>
  );
}

function statusTone(statusText: string): string {
  if (statusText === "Waiting for review.") {
    return "border-l-status-warning";
  }
  if (
    statusText === "The cell check passed." ||
    statusText === "A reviewer confirmed this item."
  ) {
    return "border-l-status-ok";
  }
  if (statusText === "A reviewer rejected this item.") {
    return "border-l-status-error";
  }
  return "border-l-border";
}

function PricesBlock({
  prices,
  scheduleConfirmText,
}: {
  prices: ReviewDetailView["prices"];
  scheduleConfirmText: string | null;
}) {
  if (prices.kind === "not-a-price-list") {
    return <p className="text-sm leading-6">{prices.message}</p>;
  }

  const columns = visiblePriceColumns(prices.rows);

  return (
    <div className="space-y-3">
      {scheduleConfirmText === null ? null : (
        <p className="text-sm leading-6 text-muted-foreground">{scheduleConfirmText}</p>
      )}
      {prices.warningText === null ? null : (
        <div className="rounded-md border border-border border-l-2 border-l-status-warning bg-secondary">
          <p className="px-3 py-2 text-sm text-foreground">{prices.warningText}</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Dimension</th>
              <th className="px-4 py-3 text-right font-medium">USD per 1M tokens</th>
              {columns.condition ? <th className="px-4 py-3 font-medium">Condition</th> : null}
              <th className="px-4 py-3 font-medium">Schedule</th>
              {columns.note ? <th className="px-4 py-3 font-medium">Note</th> : null}
              <th className="px-4 py-3 font-medium">Row source</th>
            </tr>
          </thead>
          <tbody>
            {prices.rows.map((row, index) => (
              <tr
                key={`${row.dimensionLabel}-${row.amountText}-${row.scheduleText ?? ""}-${index}`}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3">{row.dimensionLabel}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{row.amountText}</td>
                {columns.condition ? (
                  <td className="px-4 py-3">{row.conditionText ?? ""}</td>
                ) : null}
                <td className="px-4 py-3 font-mono text-xs">{row.scheduleText ?? ""}</td>
                {columns.note ? <td className="px-4 py-3">{row.note ?? ""}</td> : null}
                <td className="px-4 py-3 font-mono text-xs">{row.sourceText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function visiblePriceColumns(rows: readonly ReviewDetailPrice[]): {
  condition: boolean;
  note: boolean;
} {
  return {
    condition: rows.some((row) => !isBlank(row.conditionText)),
    note: rows.some((row) => !isBlank(row.note)),
  };
}

function isBlank(value: string | null): boolean {
  return value === null || value === "";
}
