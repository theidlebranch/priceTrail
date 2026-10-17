import { History, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/landing-page/section-heading";

function ExamplePriceChart() {
  return (
    <div className="rounded-md border border-border bg-card p-3 sm:p-4">
      <svg
        className="h-auto w-full text-muted-foreground"
        viewBox="0 0 540 182"
        role="img"
        aria-label="Example step chart: input price drops from 3 dollars to 2 dollars between checks."
      >
        <g stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3,3">
          {[20, 50, 80, 110].map((y) => (
            <line key={y} x1="40" x2="520" y1={y} y2={y} />
          ))}
        </g>
        <line
          stroke="currentColor"
          strokeOpacity="0.25"
          x1="40"
          x2="520"
          y1="140"
          y2="140"
        />
        <g
          fill="currentColor"
          fontFamily="monospace"
          fontSize="11"
          textAnchor="end"
        >
          <text x="32" y="24">
            $4
          </text>
          <text x="32" y="54">
            $3
          </text>
          <text x="32" y="84">
            $2
          </text>
          <text x="32" y="114">
            $1
          </text>
          <text x="32" y="144">
            $0
          </text>
        </g>
        <rect
          fill="var(--primary)"
          fillOpacity="0.08"
          x="245"
          y="15"
          width="30"
          height="125"
        />
        <line
          stroke="var(--primary)"
          strokeDasharray="2,2"
          x1="245"
          x2="245"
          y1="15"
          y2="140"
        />
        <line
          stroke="var(--primary)"
          strokeDasharray="2,2"
          x1="275"
          x2="275"
          y1="15"
          y2="140"
        />
        <path
          d="M 40 50 L 245 50"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <path
          d="M 245 50 L 275 80"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.5"
          strokeDasharray="3,3"
        />
        <path
          d="M 275 80 L 520 80"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <circle
          cx="245"
          cy="50"
          r="4"
          fill="white"
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <circle
          cx="275"
          cy="80"
          r="4"
          fill="var(--primary)"
          stroke="white"
          strokeWidth="1.5"
        />
        <g fill="currentColor" fontFamily="monospace" fontSize="11">
          <text x="40" y="157">
            Jan 10
          </text>
          <text x="260" y="157" textAnchor="middle">
            Mar 14
          </text>
          <text x="520" y="157" textAnchor="end">
            Apr 30
          </text>
        </g>
        <text
          fill="var(--primary)"
          fontFamily="monospace"
          fontSize="11"
          fontWeight="600"
          textAnchor="middle"
          x="260"
          y="176"
        >
          changed between these two checks
        </text>
      </svg>
    </div>
  );
}

export function ReceiptsSection() {
  return (
    <section
      id="receipts"
      className="scroll-mt-16 border-b border-border bg-card py-14"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <SectionHeading
          eyebrow="Evidence"
          title="Every number has a receipt."
          description="Every price links back to the page it came from: source URL, fetch time, an archived copy, and a content hash anyone can check."
        />

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <Card className="flex flex-col justify-between gap-4 rounded-md border-border bg-muted/50 p-5 shadow-none sm:p-6 lg:col-span-7">
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase">
                    Example Provider · example-model-1
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Input price ($ / 1M tokens)
                  </p>
                </div>
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                  EXAMPLE DATA
                </span>
              </div>
              <ExamplePriceChart />
            </div>
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3 text-xs leading-5">
              <History className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                <span className="font-semibold text-primary">
                  Interval, not instant:{" "}
                </span>
                the old price was seen at the check on{" "}
                <span className="font-mono">Mar 14 06:00 UTC</span> and the new
                one at the check on{" "}
                <span className="font-mono">Mar 14 12:00 UTC</span>. Unless the
                provider announced an exact date, that&apos;s all we can
                honestly claim.
              </p>
            </div>
          </Card>

          <Card className="flex flex-col justify-between gap-0 rounded-md border-border bg-card p-5 shadow-none sm:p-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="text-sm font-semibold">
                    Evidence for this price
                  </span>
                </div>
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                  EXAMPLE
                </span>
              </div>
              <dl className="space-y-4 pt-4 font-mono text-xs">
                <div>
                  <dt className="mb-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                    Source URL
                  </dt>
                  <dd className="break-all text-primary">
                    https://provider.example/pricing
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                    Fetched at
                  </dt>
                  <dd className="font-medium">2026-03-14T12:00:41Z</dd>
                </div>
                <div>
                  <dt className="mb-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                    Internet Archive copy
                  </dt>
                  <dd className="break-all text-muted-foreground">
                    web.archive.org/web/20260314120041/https://provider.example/pricing
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                    Content hash (SHA-256)
                  </dt>
                  <dd className="break-all rounded border border-border bg-muted p-2 text-[11px]">
                    8f3e1b7490ac2189d5f71e945c7e09923bb61e809f4296dfa1c3d901f4a7c2e5
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 font-sans text-[10px] uppercase text-muted-foreground">
                    Matched in source
                  </dt>
                  <dd className="rounded border border-border bg-muted p-2 text-[11px]">
                    Row: example-model-1 · Column: Input
                  </dd>
                </div>
              </dl>
            </div>
            <p className="mt-6 border-t border-border pt-4 font-mono text-[11px] leading-5 text-muted-foreground">
              A stored copy of the page is kept as a fallback if the archive
              capture fails.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
