import { CalendarDays, History, UserRoundCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/landing-page/section-heading";

const standards = [
  {
    title: "No invented dates",
    description: (
      <>
        We say{" "}
        <strong className="text-foreground">
          &quot;changed on or before&quot;
        </strong>{" "}
        unless a provider announced the exact date. We don&apos;t claim
        precision we didn&apos;t observe.
      </>
    ),
    Icon: CalendarDays,
  },
  {
    title: "No unverified numbers",
    description: (
      <>
        While a possible change is under review, the site shows the last
        confirmed price with a visible notice. It never shows an unverified
        number.
      </>
    ),
    Icon: UserRoundCheck,
  },
  {
    title: "Corrections, not edits",
    description: (
      <>
        Mistakes are fixed by adding a correction entry linked to the one it
        replaces, never by silently editing history.
      </>
    ),
    Icon: History,
  },
];

export function HonestSection() {
  return (
    <section
      id="honest"
      className="scroll-mt-16 border-b border-border bg-background py-14"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <SectionHeading
          eyebrow="Standards"
          title="Honest by design"
          description="Three rules we hold ourselves to."
          centered
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {standards.map(({ title, description, Icon }) => (
            <Card
              key={title}
              className="gap-0 rounded-md border-border bg-card p-6 shadow-none"
            >
              <div className="mb-4 flex size-8 items-center justify-center rounded border border-border bg-muted text-primary">
                <Icon className="size-4.5" />
              </div>
              <h3 className="mb-2 text-base font-semibold">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
