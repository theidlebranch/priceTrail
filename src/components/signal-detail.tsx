import Link from "next/link";
import type { SignalHistoryView, SignalsView } from "@/app/review/signals-view";
import { SignalsBoard } from "@/components/signals-board";
import type { DecideCandidateState } from "@/components/signal-candidate-form";

/**
 * One witness. The findings are the last good read. The history keeps
 * every attempt, including a failed one. There is no Wayback column.
 * This file does not open a database.
 */
export function SignalDetail({
  findings,
  history,
  action,
}: {
  findings: SignalsView;
  history: SignalHistoryView;
  action: (
    previous: DecideCandidateState,
    formData: FormData,
  ) => Promise<DecideCandidateState>;
}) {
  return (
    <div>
      <nav className="text-sm text-muted-foreground">
        <Link href="/review/signals" className="underline-offset-4 hover:text-foreground hover:underline">
          Signals
        </Link>
      </nav>
      <div className="mt-4">
        <SignalsBoard view={findings} action={action} heading="page" />
      </div>
      <section className="mt-12">
        <h2 className="text-base font-medium">Run history</h2>
        {history.empty !== null ? (
          <p className="mt-3 text-sm text-muted-foreground">{history.empty}</p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-xl border border-border">
            {history.rows.map((row) => (
              <li
                key={row.id}
                className={`border-b border-border px-4 py-4 last:border-b-0 ${
                  row.failed ? "border-l-2 border-l-status-warning" : ""
                }`}
              >
                <p className="text-sm font-medium">{row.status}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.time}</p>
                {row.note === null ? null : <p className="mt-1 text-sm text-foreground">{row.note}</p>}
                {row.counts === null ? null : (
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">{row.counts}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {history.olderHref === null ? null : (
          <Link href={history.olderHref} className="mt-4 inline-block text-foreground underline">
            Older reads
          </Link>
        )}
      </section>
    </div>
  );
}
