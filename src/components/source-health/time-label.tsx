import type { TimedLabel } from "@/app/review/source-health";

/**
 * Both the short stamp and the full UTC string were computed on the server.
 * The full string stays for screen readers, so the clock cannot change after hydration.
 */
export function TimeLabel({
  time,
  display = "stacked",
}: {
  time: TimedLabel;
  display?: "stacked" | "short" | "date" | "clock";
}) {
  return (
    <time dateTime={time.dateTime} className="tabular-nums">
      {display === "stacked" ? (
        <>
          <span className="block text-foreground">{time.short}</span>
          <span className="block text-muted-foreground">{time.relative}</span>
        </>
      ) : (
        <span>{display === "date" ? time.date : display === "clock" ? time.clock : time.short}</span>
      )}
      <span className="sr-only"> {time.absolute}</span>
    </time>
  );
}
