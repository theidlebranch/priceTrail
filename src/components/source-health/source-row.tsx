import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BoardEntry } from "@/app/review/source-health";
import { CheckStrip } from "@/components/source-health/check-strip";
import { StatusDot } from "@/components/source-health/status-dot";
import { TimeLabel } from "@/components/source-health/time-label";
import { textToneClass } from "@/components/source-health/tones";
import { WaybackCell } from "@/components/source-health/wayback-cell";

/** 24 bars of 6px plus 23 gaps of 4px. The column stays this wide so the strip is one line. */
export const SOURCE_ROW_COLUMNS =
  "md:grid-cols-[minmax(0,1.6fr)_236px_9.5rem_9.5rem_minmax(8.5rem,0.9fr)_1.25rem]";

/** The whole row is one link. The schedule note is muted and does not change the dot. */
export function SourceRow({ entry }: { entry: BoardEntry }) {
  return (
    <Link
      href={entry.href}
      title={entry.url}
      className={`grid gap-3 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-muted md:items-center md:gap-4 ${SOURCE_ROW_COLUMNS}`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-1.5">
          <StatusDot tone={entry.tone} />
        </span>
        <span className="min-w-0">
          <span className="block break-all">
            <span className="text-foreground">{entry.host}</span>{" "}
            <span className="font-mono text-muted-foreground">{entry.path}</span>
          </span>
          <span className={`block truncate ${textToneClass(entry.tone)}`} title={entry.reason}>
            {entry.reason}
          </span>
          {entry.scheduleNote === null ? null : (
            <span className="block text-muted-foreground">{entry.scheduleNote}</span>
          )}
        </span>
      </span>
      <span>
        <span className="mb-1 block text-muted-foreground md:hidden">Last 24 checks</span>
        <CheckStrip slots={entry.strip} label={entry.stripLabel} />
      </span>
      <span>
        <span className="mb-1 block text-muted-foreground md:hidden">Last check</span>
        {entry.lastCheck === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <TimeLabel time={entry.lastCheck} />
        )}
      </span>
      <span>
        <span className="mb-1 block text-muted-foreground md:hidden">Last change</span>
        {entry.lastChange === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <TimeLabel time={entry.lastChange} />
        )}
      </span>
      <span>
        <span className="mb-1 block text-muted-foreground md:hidden">Last snapshot</span>
        <WaybackCell wayback={entry.snapshot} />
        {entry.snapshot.time === null ? null : (
          <span className="mt-1 block">
            <TimeLabel time={entry.snapshot.time} />
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
