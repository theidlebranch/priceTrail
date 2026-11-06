import Link from "next/link";
import type { ReviewDetailView } from "@/app/review/review-detail";
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
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/review" className="hover:underline">
            Review
          </Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{view.modelName}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{view.labName}</p>
      </div>

      <div className="space-y-2 text-sm leading-6">
        <p>{view.statusText}</p>
        <p>{view.notPublishedText}</p>
        <p>{view.cellCheckText}</p>
        <p className="text-muted-foreground">{view.actionsText}</p>
      </div>

      {view.canDecide ? <ReviewDecisionForm itemId={view.itemId} /> : null}

      <div className="space-y-2 text-sm leading-6">
        <p>{view.sourceTypeLabel}</p>
        <p className="break-all text-muted-foreground">{view.sourceUrl}</p>
        <p>Fetched {view.fetchedAtText}.</p>
        {view.reviewedBy === null ? null : <p>Reviewed by {view.reviewedBy}.</p>}
        {view.reviewedAtText === null ? null : <p>Reviewed at {view.reviewedAtText}.</p>}
        {view.reviewNote === null ? null : <p>{view.reviewNote}</p>}
      </div>

      {view.prices.kind === "not-a-price-list" ? (
        <p className="text-sm leading-6">{view.prices.message}</p>
      ) : (
        <div className="space-y-3">
          {view.prices.warningText === null ? null : (
            <p className="text-sm leading-6 text-muted-foreground">{view.prices.warningText}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Dimension</th>
                  <th className="py-2 pr-4 font-medium">USD per 1M tokens</th>
                  <th className="py-2 pr-4 font-medium">Condition</th>
                  <th className="py-2 pr-4 font-medium">Schedule</th>
                  <th className="py-2 pr-4 font-medium">Note</th>
                  <th className="py-2 font-medium">Row source</th>
                </tr>
              </thead>
              <tbody>
                {view.prices.rows.map((row, index) => (
                  <tr
                    key={`${row.dimensionLabel}-${row.amountText}-${index}`}
                    className="border-t border-border"
                  >
                    <td className="py-2 pr-4">{row.dimensionLabel}</td>
                    <td className="py-2 pr-4 font-mono">{row.amountText}</td>
                    <td className="py-2 pr-4">{row.conditionText ?? ""}</td>
                    <td className="py-2 pr-4">{row.scheduleText ?? ""}</td>
                    <td className="py-2 pr-4">{row.note ?? ""}</td>
                    <td className="py-2">{row.sourceText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
