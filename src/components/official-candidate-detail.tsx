import Link from "next/link";
import { publishCandidateAction } from "@/app/review/publish-candidate-action";
import type {
  OfficialCandidateDetailView,
  OfficialCandidatePrice,
} from "@/app/review/official-candidate-view";
import { CopySourceUrl } from "@/components/copy-source-url";
import { OfficialCandidateForm } from "@/components/official-candidate-form";

/**
 * One official new-model card. The amounts are the prices Add and
 * publish would write. The source URL is text, not a link.
 */
export function OfficialCandidateDetail({ view }: { view: OfficialCandidateDetailView }) {
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
          <div className="space-y-3">
            <p className="font-mono text-sm break-all text-foreground">{view.sourceUrl}</p>
            <CopySourceUrl url={view.sourceUrl} />
            {view.fetchedAtText === null ? null : (
              <p className="text-sm text-muted-foreground">{view.fetchedAtText}</p>
            )}
          </div>
          {view.hint === null ? (
            <Prices prices={view.prices} refusal={view.refusal} scheduleText={view.scheduleText} />
          ) : (
            <p className="text-sm leading-6">{view.hint}</p>
          )}
        </div>
        <aside className="space-y-4 rounded-xl border border-border p-4">
          <p className="text-sm leading-6">{view.statusText}</p>
          {view.canDecide ? (
            <>
              <p className="text-sm leading-6 text-muted-foreground">{view.decisionText}</p>
              <OfficialCandidateForm
                candidateId={view.candidateId}
                canPublish={view.prices !== null}
                mode={view.decision}
                action={publishCandidateAction}
              />
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Prices({
  prices,
  refusal,
  scheduleText,
}: {
  prices: OfficialCandidatePrice[] | null;
  refusal: string | null;
  scheduleText: string | null;
}) {
  if (prices === null) {
    return <p className="text-sm leading-6">{refusal}</p>;
  }

  const showCondition = prices.some((price) => price.conditionText !== null);
  return (
    <div className="space-y-3">
      {scheduleText === null ? null : (
        <p className="text-sm leading-6 text-muted-foreground">{scheduleText}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Dimension</th>
              <th className="px-4 py-3 text-right font-medium">USD per 1M tokens</th>
              {showCondition ? <th className="px-4 py-3 font-medium">Condition</th> : null}
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => (
              <tr
                key={`${price.dimensionLabel}-${price.amountText}-${price.conditionText ?? ""}`}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3">{price.dimensionLabel}</td>
                <td className="px-4 py-3 text-right tabular-nums">{price.amountText}</td>
                {showCondition ? (
                  <td className="px-4 py-3 text-muted-foreground">{price.conditionText}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
