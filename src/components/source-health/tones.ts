import type { FetchOutcome, HealthTone } from "@/core/source-health";

/** The square and the dot. The word next to them is the other cue. */
export function dotClass(tone: HealthTone): string {
  switch (tone) {
    case "unchanged":
      return "bg-status-ok";
    case "changed":
      return "bg-status-info";
    case "warn":
      return "bg-status-warning";
    case "error":
      return "bg-status-error";
    case "muted":
      return "bg-status-neutral";
  }
}

export function textToneClass(tone: HealthTone): string {
  switch (tone) {
    case "unchanged":
      return "text-status-ok";
    case "changed":
      return "text-status-info";
    case "warn":
      return "text-status-warning";
    case "error":
      return "text-status-error";
    case "muted":
      return "text-muted-foreground";
  }
}

export function barClass(outcome: FetchOutcome | null): string {
  switch (outcome) {
    case null:
      return "bg-border";
    case "unchanged":
      return "bg-status-ok";
    case "changed":
      return "bg-status-info";
    case "parser_suspect":
      return "bg-status-warning";
    case "fetch_error":
      return "bg-status-error";
  }
}
