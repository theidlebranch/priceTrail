import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { SignalBoardView, SignalsView } from "@/app/review/signals-view";
import {
  SignalRejectForm,
  type RejectCandidateState,
} from "@/components/signal-reject-form";

/**
 * The two witness jobs. Findings stay on the detail page.
 * A job that has never been stored is not a link.
 * This file does not open a database.
 */
export function SignalJobBoard({ view }: { view: SignalBoardView }) {
  return (
    <div>
      <header>
        <h1 className="text-page-title font-semibold tracking-tight">Signals</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          A witness is another site&apos;s price list. It can disagree with this site, and it can name a
          model we do not track. It cannot publish a price.
        </p>
        <div className="mt-4">
          <Link
            href="/review"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Review queue
          </Link>
        </div>
      </header>
      <ul className="mt-8 overflow-hidden rounded-xl border border-border">
        {view.entries.map((entry) => (
          <li
            key={entry.title}
            className={`border-b border-border last:border-b-0 ${
              entry.failed ? "border-l-2 border-l-status-warning" : ""
            }`}
          >
            {entry.href === null ? (
              <JobBody entry={entry} />
            ) : (
              <Link
                href={entry.href}
                className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-secondary"
              >
                <JobBody entry={entry} linked />
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-tertiary-foreground" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobBody({
  entry,
  linked = false,
}: {
  entry: SignalBoardView["entries"][number];
  linked?: boolean;
}) {
  return (
    <div className={linked ? "min-w-0" : "px-4 py-4"}>
      <p className="font-medium text-foreground">{entry.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{entry.status}</p>
      {entry.lastRun === null ? null : (
        <p className="mt-1 text-sm text-muted-foreground">{entry.lastRun}</p>
      )}
      {entry.note === null ? null : <p className="mt-1 text-sm text-foreground">{entry.note}</p>}
      {entry.fromLastGood === null ? null : (
        <p className="mt-1 text-sm text-muted-foreground">{entry.fromLastGood}</p>
      )}
      {entry.disagreements === null ? null : (
        <p className="mt-2 text-sm tabular-nums text-foreground">
          {entry.disagreements}. {entry.newNames}. {entry.missing}.
        </p>
      )}
    </div>
  );
}

/**
 * One witness's findings. Reject is the only decision.
 * Approving a name is a later step. The page passes the action,
 * so this file does not open a database.
 */
export function SignalsBoard({
  view,
  rejectAction,
  heading = "section",
}: {
  view: SignalsView;
  rejectAction: (
    previous: RejectCandidateState,
    formData: FormData,
  ) => Promise<RejectCandidateState>;
  heading?: "page" | "section";
}) {
  const titleClass =
    heading === "page" ? "text-page-title font-semibold tracking-tight" : "text-2xl font-semibold tracking-tight";
  return (
    <div>
      <header>
        {heading === "page" ? (
          <h1 className={titleClass}>{view.title}</h1>
        ) : (
          <h2 className={titleClass}>{view.title}</h2>
        )}
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{view.description}</p>
      </header>
      {view.unread !== null ? (
        <p className="mt-8 text-sm text-muted-foreground">{view.unread}</p>
      ) : (
        <div className="mt-8 space-y-8">
          <SignalCards view={view} />
          <FindingList title="Disagreements" empty={view.emptyDisagreements}>
            {view.disagreements.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="text-sm font-medium">{row.model}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.dimension}: ours {row.ours}, witness {row.witness}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{row.time}</p>
              </li>
            ))}
          </FindingList>
          <FindingList title="New names" empty={view.emptyCandidates}>
            {view.candidates.map((row) => (
              <li key={row.id} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="font-mono text-sm">{row.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.time}</p>
                <SignalRejectForm candidateId={row.id} action={rejectAction} />
              </li>
            ))}
          </FindingList>
          <FindingList title="Missing models" empty={view.emptyMissing}>
            {view.missing.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 text-sm last:border-b-0">
                <p>{row.model}</p>
                <p className="mt-1 text-muted-foreground">{row.time}</p>
              </li>
            ))}
          </FindingList>
          <FindingList title="Not linked" empty={view.emptyNotLinked}>
            {view.notLinked.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="text-sm font-medium">{row.model}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.sentence}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.time}</p>
              </li>
            ))}
          </FindingList>
        </div>
      )}
    </div>
  );
}

function SignalCards({ view }: { view: SignalsView }) {
  const latest = view.latest;
  if (latest === null) {
    return null;
  }
  const failed = latest.status !== "Read held";
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <article className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-muted-foreground" title={latest.fromLastGood ?? undefined}>
          Latest read
        </h3>
        <p className="mt-2 text-2xl leading-none font-semibold tracking-tight">{latest.time}</p>
        <p className={`mt-2 ${failed ? "text-destructive" : "text-foreground"}`}>{latest.status}</p>
        {latest.note === null ? null : (
          <p className="mt-2 text-sm text-muted-foreground">{latest.note}</p>
        )}
      </article>
      <article className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-muted-foreground" title={view.file?.sentence}>
          Names in the file
        </h3>
        {view.file === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Findings are unavailable until a read succeeds.
          </p>
        ) : (
          <p className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {view.file.count}
          </p>
        )}
      </article>
      <article className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-muted-foreground" title={view.compared?.meaning}>
          Compared
        </h3>
        {view.compared === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Findings are unavailable until a read succeeds.
          </p>
        ) : (
          <>
            <p className="mt-2 tabular-nums">{view.compared.agreed}</p>
            <p className="tabular-nums">{view.compared.notCompared}</p>
            <p className="tabular-nums">{view.compared.disagree}</p>
          </>
        )}
      </article>
    </div>
  );
}

function FindingList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string | null;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const present = items.some((item) => item !== null && item !== undefined && item !== false);
  return (
    <section>
      <h3 className="text-base font-medium">{title}</h3>
      {present ? (
        <ul className="mt-3 overflow-hidden rounded-xl border border-border">{children}</ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
