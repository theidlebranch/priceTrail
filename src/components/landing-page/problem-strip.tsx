import { Card } from "@/components/ui/card";

const problems = [
  {
    number: "01",
    title: "Prices change quietly",
    description:
      "Token rates, cache discounts, and context tiers get updated, often without a prominent announcement or a dated changelog.",
  },
  {
    number: "02",
    title: "Aggregators disagree",
    description:
      "Third-party trackers can lag, drop qualifiers, or contradict each other, and rarely say when a price actually changed.",
  },
  {
    number: "03",
    title: "Few show their evidence",
    description:
      "Most listings give you a bare number: no source snapshot, no timestamp, no way to check it yourself.",
  },
];

export function ProblemStrip() {
  return (
    <section className="border-b border-border bg-background py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border bg-card md:grid-cols-3">
          {problems.map((problem, index) => (
            <Card
              key={problem.number}
              className={`gap-0 rounded-none border-0 bg-transparent p-6 shadow-none ${index > 0 ? "border-t border-border md:border-l md:border-t-0" : ""}`}
            >
              <p className="mb-2 font-mono text-xs font-semibold text-primary">
                {problem.number}
              </p>
              <h3 className="mb-2 text-base font-semibold">{problem.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {problem.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
