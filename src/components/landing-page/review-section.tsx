import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ReviewSection() {
  return (
    <section className="border-b border-border bg-card py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="mb-8 max-w-3xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            Human in the loop
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
            When the check fails, a person decides.
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Nothing is published without passing a grounding check or a human
            review.
          </p>
        </div>

        <Card className="gap-0 overflow-hidden rounded-md border-border bg-muted/40 py-0 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold">
                Review queue · example item
              </span>
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                FLAGGED: WRONG COLUMN
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Source:{" "}
              <span className="font-mono text-foreground">
                provider.example/pricing
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            <div className="space-y-4 bg-card p-5 lg:col-span-5">
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">
                  What the extractor found
                </p>
                <h3 className="text-sm font-semibold">
                  The number exists on the page, but under a different column.
                </h3>
                <p className="text-xs text-muted-foreground">
                  Publishing is held until a reviewer decides.
                </p>
              </div>
              <div className="space-y-2 rounded-md border border-border bg-muted p-3 font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span>Last confirmed input:</span>
                  <span className="font-semibold text-foreground">
                    $0.150 / 1M
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span>Extracted as input:</span>
                  <span className="font-semibold text-amber-900">
                    $0.075 / 1M
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <span>Actually found under:</span>
                  <span className="font-semibold text-foreground">
                    &quot;Batch input&quot;
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-5 lg:col-span-7">
              <p className="font-mono text-[10px] uppercase text-muted-foreground">
                Raw source excerpt · example
              </p>
              <div className="overflow-x-auto rounded-md border border-border bg-card p-4">
                <table className="w-full min-w-[480px] text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-1 pr-4 font-medium">Model</th>
                      <th className="py-1 pr-4 font-medium">Input</th>
                      <th className="py-1 pr-4 font-medium">Batch input</th>
                      <th className="py-1 font-medium">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 pr-4">example-model-1</td>
                      <td className="py-2 pr-4">$0.150</td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-amber-100 px-1 font-bold text-amber-900">
                          $0.075
                        </span>
                      </td>
                      <td className="py-2">$0.600</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                The highlighted number sits under &quot;Batch input&quot;, not
                &quot;Input&quot;. It was not published.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded border border-border bg-card px-3 py-1.5 text-muted-foreground">
                Confirm
              </span>
              <span className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground">
                Reject
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Every decision records the reviewer, the time, and a note.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
