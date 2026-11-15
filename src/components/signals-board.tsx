import type { ReactNode } from "react";
import type { SignalsView } from "@/app/review/signals-view";
import {
  SignalRejectForm,
  type RejectCandidateState,
} from "@/components/signal-reject-form";

/**
 * One witness section. The page stacks LiteLLM and then OpenRouter.
 * Reject is the only decision. Approving a name is a later step.
 * The page passes the action, so this file does not open a database.
 */
export function SignalsBoard({
  view,
  rejectAction,
}: {
  view: SignalsView;
  rejectAction: (
    previous: RejectCandidateState,
    formData: FormData,
  ) => Promise<RejectCandidateState>;
}) {
  return (
    <div>
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{view.title}</h2>
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
        <h2 className="text-muted-foreground" title={latest.fromLastGood ?? undefined}>
          Latest read
        </h2>
        <p className="mt-2 text-2xl leading-none font-semibold tracking-tight">{latest.time}</p>
        <p className={`mt-2 ${failed ? "text-destructive" : "text-foreground"}`}>{latest.status}</p>
        {latest.note === null ? null : (
          <p className="mt-2 text-sm text-muted-foreground">{latest.note}</p>
        )}
      </article>
      <article className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-muted-foreground" title={view.file?.sentence}>
          Names in the file
        </h2>
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
        <h2 className="text-muted-foreground" title={view.compared?.meaning}>
          Compared
        </h2>
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
      <h2 className="text-base font-medium">{title}</h2>
      {present ? (
        <ul className="mt-3 overflow-hidden rounded-xl border border-border">{children}</ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
