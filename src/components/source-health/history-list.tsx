import { ChevronRight } from "lucide-react";
import type { HistoryRowView, TimedLabel, WaybackView } from "@/app/review/source-health";
import { HistoryShowMore } from "@/components/source-health/history-show-more";
import { TimeLabel } from "@/components/source-health/time-label";
import { textToneClass } from "@/components/source-health/tones";
import { WaybackCell } from "@/components/source-health/wayback-cell";

const HISTORY_COLUMNS =
  "md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_4.5rem_minmax(0,1fr)_1.25rem] md:items-start md:gap-4";

/** One page of visits. A price change is never inside a group. */
export function HistoryList({ rows }: { rows: readonly HistoryRowView[] }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">History</h2>
        <p className="text-sm text-muted-foreground">
          Repeated results are grouped. Open a group to see each check.
        </p>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
        <div
          className={`hidden border-b border-border px-4 py-2.5 text-sm text-muted-foreground ${HISTORY_COLUMNS}`}
        >
          <span>Time</span>
          <span>Result</span>
          <span>HTTP</span>
          <span>Wayback</span>
          <span className="sr-only">Open</span>
        </div>
        {rows.map((row) =>
          row.kind === "group" ? (
            <HistoryGroup key={row.id} row={row} />
          ) : (
            <HistorySingle key={row.id} row={row} />
          ),
        )}
      </div>
    </section>
  );
}

function HistorySingle({ row }: { row: Extract<HistoryRowView, { kind: "single" }> }) {
  return (
    <div className={`border-b border-border px-4 py-3 last:border-b-0 ${HISTORY_COLUMNS}`}>
      <TimeLabel time={row.time} />
      <ResultCell
        toneClass={textToneClass(row.tone)}
        outcomeLabel={row.outcomeLabel}
        firstCheck={row.firstCheck}
        note={row.note}
        chips={row.wayback.chips}
      />
      <HttpCell httpText={row.httpText} />
      <WaybackCell wayback={row.wayback} showChips={false} />
      <span />
    </div>
  );
}

function HistoryGroup({ row }: { row: Extract<HistoryRowView, { kind: "group" }> }) {
  return (
    <details className="group border-b border-border last:border-b-0 [&>summary::-webkit-details-marker]:hidden">
      <summary className={`cursor-pointer list-none px-4 py-3 ${HISTORY_COLUMNS}`}>
        <RangeLabel from={row.from} to={row.to} />
        <ResultCell
          toneClass={textToneClass(row.tone)}
          outcomeLabel={row.outcomeLabel}
          count={row.count}
          note={row.note}
          chips={row.wayback.chips}
        />
        <HttpCell httpText={row.httpText} />
        <WaybackCell wayback={row.wayback} showChips={false} />
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <ol>
        {row.shown.map((check) => (
          <GroupCheck key={check.id} check={check} />
        ))}
      </ol>
      {row.hidden.length === 0 ? null : (
        <HistoryShowMore label={row.showMoreLabel}>
          <ol>
            {row.hidden.map((check) => (
              <GroupCheck key={check.id} check={check} />
            ))}
          </ol>
        </HistoryShowMore>
      )}
    </details>
  );
}

function ResultCell({
  toneClass,
  outcomeLabel,
  count,
  firstCheck = false,
  note,
  chips,
}: {
  toneClass: string;
  outcomeLabel: string;
  count?: number;
  firstCheck?: boolean;
  note: string | null;
  chips: WaybackView["chips"];
}) {
  return (
    <span>
      <span className="mb-1 block text-muted-foreground md:hidden">Result</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className={toneClass}>{outcomeLabel}</span>
        {count === undefined ? null : (
          <span className="rounded-md border border-border px-1.5 font-mono text-muted-foreground">
            ×{count}
          </span>
        )}
        {firstCheck ? (
          <span className="rounded-md border border-status-info px-1.5 text-status-info">first check</span>
        ) : null}
      </span>
      {note === null ? null : (
        <p className="mt-1 break-all font-mono text-sm text-muted-foreground">{note}</p>
      )}
      {chips.length === 0 ? null : (
        <span className="mt-1 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-block rounded-md border border-border px-1.5 py-0.5 text-status-warning"
            >
              {chip}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function HttpCell({ httpText }: { httpText: string }) {
  return (
    <span>
      <span className="mb-1 block text-muted-foreground md:hidden">HTTP</span>
      <span className="font-mono text-muted-foreground" title="HTTP status">
        {httpText}
      </span>
    </span>
  );
}

function RangeLabel({ from, to }: { from: TimedLabel; to: TimedLabel }) {
  return (
    <span>
      <span className="mb-1 block text-muted-foreground md:hidden">Time</span>
      <span className="block text-foreground tabular-nums">
        <time dateTime={from.dateTime}>{from.short}</time>
        <span aria-hidden="true"> → </span>
        <time dateTime={to.dateTime}>{to.short}</time>
      </span>
      <span className="block text-muted-foreground">{to.relative}</span>
      <span className="sr-only">
        {from.absolute} to {to.absolute}
      </span>
    </span>
  );
}

function GroupCheck({ check }: { check: Extract<HistoryRowView, { kind: "group" }>["shown"][number] }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-muted-foreground">
      <TimeLabel time={check.time} display="short" />
      <span className="font-mono" title="HTTP status">
        {check.httpText}
      </span>
    </li>
  );
}
