"use client";

import { useActionState, useState } from "react";
import type { LabRequestEntry } from "@/app/labs/lab-request-view";
import { requestCountLabel } from "@/app/labs/lab-request-view";
import { buttonVariants } from "@/components/ui/button";

export type DecideLabRequestState = { ok: false; message: string; note: string } | null;

export function RequestsPageHeader({ count }: { count?: number }) {
  return (
    <header>
      <h1 className="text-page-title font-semibold tracking-tight">Requests</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Lab names visitors asked us to track. Accepting one does not add the lab.
      </p>
      {count !== undefined ? (
        <p className="mt-3 text-meta text-tertiary-foreground tabular-nums">{requestCountLabel(count)}</p>
      ) : null}
    </header>
  );
}

type NoteField = { state: DecideLabRequestState; key: number };

/**
 * Pending lab suggestions. Accept and decline need a note.
 * Accepting does not add the lab. A refusal puts the typed note back.
 */
export function LabRequestList({
  entries,
  action,
}: {
  entries: readonly LabRequestEntry[];
  action: (previous: DecideLabRequestState, formData: FormData) => Promise<DecideLabRequestState>;
}) {
  return (
    <div>
      <RequestsPageHeader count={entries.length} />
      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No lab suggestions are waiting.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-xl border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-border px-4 py-4 last:border-b-0">
              <p className="font-medium text-foreground">{entry.labName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{entry.suggestedBy}</p>
              <p className="mt-1 font-mono text-meta text-tertiary-foreground">{entry.suggestedAtText}</p>
              <DecideLabRequestForm requestId={entry.id} labName={entry.labName} action={action} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecideLabRequestForm({
  requestId,
  labName,
  action,
}: {
  requestId: number;
  labName: string;
  action: (previous: DecideLabRequestState, formData: FormData) => Promise<DecideLabRequestState>;
}) {
  const [state, formAction, pending] = useActionState<DecideLabRequestState, FormData>(action, null);
  const [field, setField] = useState<NoteField>({ state, key: 0 });
  const nextField = nextNoteFieldKey(field, state);
  if (nextField !== field) {
    setField(nextField);
  }
  const note = state?.ok === false ? state.note : "";

  return (
    <form action={formAction} className="mt-3 space-y-2" key={field.key}>
      <input type="hidden" name="requestId" value={String(requestId)} />
      <label className="block space-y-2 text-sm leading-6">
        <span className="sr-only">Note</span>
        <textarea
          name="note"
          required
          rows={2}
          aria-label={`Note for ${labName}`}
          disabled={pending}
          defaultValue={note}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {state?.ok === false ? (
        <p className="text-sm leading-6 text-destructive">{state.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="accept"
          disabled={pending}
          className={buttonVariants({ size: "sm" })}
        >
          Accept
        </button>
        <button
          type="submit"
          name="decision"
          value="decline"
          disabled={pending}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Decline
        </button>
      </div>
    </form>
  );
}

function nextNoteFieldKey(previous: NoteField, state: DecideLabRequestState): NoteField {
  if (state === previous.state) {
    return previous;
  }
  if (state?.ok === false) {
    return { state, key: previous.key + 1 };
  }
  return { state, key: previous.key };
}
