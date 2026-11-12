import type { StatusTone } from "@/app/review/source-health";
import { cn } from "@/lib/utils";

/**
 * The two color keys for source health. The list and the history page
 * both render this, so a visit color and a Wayback color cannot drift
 * apart. The swatch is the color. The sentence is what that color means
 * on that line.
 */

const VISIT_LEGEND: readonly LegendItem[] = [
  {
    tone: "ok",
    label: "Prices unchanged.",
    detail: "The download worked and the parsed page matched the last snapshot.",
  },
  {
    tone: "info",
    label: "Parsed prices changed.",
    detail: "The download worked and the parsed page was new.",
  },
  {
    tone: "warning",
    label: "The parser could not read the page.",
    detail: "The site answered, and the page text was not kept.",
  },
  {
    tone: "error",
    label: "The download failed.",
    detail: "The site did not return a page.",
  },
  {
    tone: "neutral",
    label: "Not checked yet.",
    detail: "This source has no visit.",
  },
];

const WAYBACK_LEGEND: readonly LegendItem[] = [
  {
    tone: "ok",
    label: "Archived.",
    detail: "The Internet Archive has a copy.",
  },
  {
    tone: "warning",
    label: "Archive is still pending.",
    detail: "The snapshot is stored here, and there is no permalink yet.",
  },
  {
    tone: "error",
    label: "Archive failed. The stored copy remains.",
    detail: "Wayback did not keep a copy.",
  },
  {
    tone: "neutral",
    label: "Wayback was not asked.",
    detail: "This visit has no snapshot.",
  },
];

type LegendItem = {
  tone: StatusTone;
  label: string;
  detail: string;
};

export function SourceRunLegend() {
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2">
      <LegendGroup title="Visit" items={VISIT_LEGEND} />
      <LegendGroup title="Wayback" items={WAYBACK_LEGEND} />
      <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
        A color describes the visit or the Wayback copy. That is separate from the needs-attention
        count on the source list. A changed visit can be blue, its archive line green, and the
        source still healthy.
      </p>
    </div>
  );
}

function LegendGroup({ title, items }: { title: string; items: readonly LegendItem[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <ul className="mt-2 grid gap-2">
        {items.map((item) => (
          <li key={item.label} className="flex gap-2 text-sm leading-6">
            <span
              className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", statusSwatchClass(item.tone))}
              aria-hidden="true"
            />
            <span>
              <span className="text-foreground">{item.label}</span>{" "}
              <span className="text-muted-foreground">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function statusBarClass(tone: StatusTone): string {
  switch (tone) {
    case "ok":
      return "border-l-status-ok";
    case "info":
      return "border-l-status-info";
    case "warning":
      return "border-l-status-warning";
    case "error":
      return "border-l-status-error";
    case "neutral":
      return "border-l-status-neutral";
  }
}

export function statusTextClass(tone: StatusTone): string {
  switch (tone) {
    case "ok":
      return "text-status-ok";
    case "info":
      return "text-status-info";
    case "warning":
      return "text-status-warning";
    case "error":
      return "text-status-error";
    case "neutral":
      return "text-status-neutral";
  }
}

function statusSwatchClass(tone: StatusTone): string {
  switch (tone) {
    case "ok":
      return "bg-status-ok";
    case "info":
      return "bg-status-info";
    case "warning":
      return "bg-status-warning";
    case "error":
      return "bg-status-error";
    case "neutral":
      return "bg-status-neutral";
  }
}
