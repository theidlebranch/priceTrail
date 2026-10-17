import { Archive, Radar, ScanSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/landing-page/section-heading";

const steps = [
  {
    number: "01",
    tag: "Signals",
    title: "Detect",
    description:
      "Official pricing pages are checked every few hours. Provider changelogs and aggregator data work as early-warning signals, never as published prices.",
    detail: "Checked about every 6 hours",
    Icon: Radar,
  },
  {
    number: "02",
    tag: "Grounding check",
    title: "Verify",
    description:
      "Each number is matched against the exact row and column of the source text. A page redesign or a broken parser is never mistaken for a price change.",
    detail: "Row and column matching",
    Icon: ScanSearch,
  },
  {
    number: "03",
    tag: "Evidence",
    title: "Archive",
    description:
      "Whenever a page changes, a copy is submitted to the Internet Archive, and the stored copy is hashed with SHA-256.",
    detail: "Hash stored with every copy",
    Icon: Archive,
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 border-b border-border bg-background py-14"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <SectionHeading
          eyebrow="Process"
          title="How it works"
          description="Detect a change, verify it against the source, archive the evidence."
          centered
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map(({ number, tag, title, description, detail, Icon }) => (
            <Card
              key={number}
              className="gap-0 rounded-md border-border bg-card p-6 shadow-none"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="flex size-7 items-center justify-center rounded border border-border bg-muted font-mono text-xs font-bold">
                  {number}
                </span>
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">
                  {tag}
                </span>
              </div>
              <h3 className="mb-2 text-base font-semibold">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
              <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                {detail}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
