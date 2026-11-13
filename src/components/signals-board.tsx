import type { ReactNode } from "react";
import type { SignalsView } from "@/app/review/signals-view";
import {
  SignalRejectForm,
  type RejectCandidateState,
} from "@/components/signal-reject-form";

/**
 * The LiteLLM witness page. Lists are the rows already loaded.
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
        <h1 className="text-page-title font-semibold tracking-tight">{view.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{view.description}</p>
      </header>
      {view.unread !== null ? (
        <p className="mt-8 text-sm text-muted-foreground">{view.unread}</p>
      ) : (
        <div className="mt-8 space-y-8">
          <StatusBlock view={view} />
          <FindingList title="Disagreements" empty={view.emptyDisagreements}>
            {view.disagreements.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="text-sm font-medium">{row.model}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.dimension}: ours {row.ours}, witness {row.witness}
                </p>
              </li>
            ))}
          </FindingList>
          <FindingList title="New names" empty={view.emptyCandidates}>
            {view.candidates.map((row) => (
              <li key={row.id} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="font-mono text-sm">{row.label}</p>
                <SignalRejectForm candidateId={row.id} action={rejectAction} />
              </li>
            ))}
          </FindingList>
          <FindingList title="Missing models" empty={view.emptyMissing}>
            {view.missing.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 text-sm last:border-b-0">
                {row.model}
              </li>
            ))}
          </FindingList>
          <FindingList title="Not linked" empty={view.emptyNotLinked}>
            {view.notLinked.map((row) => (
              <li key={row.key} className="border-b border-border px-4 py-4 last:border-b-0">
                <p className="text-sm font-medium">{row.model}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.sentence}</p>
              </li>
            ))}
          </FindingList>
        </div>
      )}
    </div>
  );
}

function StatusBlock({ view }: { view: SignalsView }) {
  return (
    <div className="space-y-2 text-sm leading-6">
      {view.failure !== null ? <p className="text-destructive">{view.failure}</p> : null}
      {view.failureNote !== null ? (
        <p className="text-muted-foreground">{view.failureNote}</p>
      ) : null}
      {view.successful !== null ? <p>{view.successful}</p> : null}
      {view.agreed !== null ? <p className="tabular-nums text-muted-foreground">{view.agreed}</p> : null}
      {view.notCompared !== null ? (
        <p className="tabular-nums text-muted-foreground">{view.notCompared}</p>
      ) : null}
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
