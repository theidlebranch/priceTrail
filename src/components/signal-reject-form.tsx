"use client";

import { useActionState, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

export type RejectCandidateState = { ok: false; message: string; note: string } | null;

type NoteField = { state: RejectCandidateState; key: number };

/**
 * Reject one new-name card. The note is required. A refusal puts the
 * typed note back. This file does not open a database.
 */
export function SignalRejectForm({
  candidateId,
  action,
}: {
  candidateId: number;
  action: (previous: RejectCandidateState, formData: FormData) => Promise<RejectCandidateState>;
}) {
  const [state, formAction, pending] = useActionState<RejectCandidateState, FormData>(action, null);
  const [field, setField] = useState<NoteField>({ state, key: 0 });
  const nextField = nextNoteFieldKey(field, state);
  if (nextField !== field) {
    setField(nextField);
  }
  const note = state?.ok === false ? state.note : "";

  return (
    <form action={formAction} className="mt-3 space-y-2" key={field.key}>
      <input type="hidden" name="candidateId" value={String(candidateId)} />
      <label className="block space-y-2 text-sm leading-6">
        <span className="sr-only">Note</span>
        <textarea
          name="note"
          required
          rows={2}
          aria-label="Note"
          disabled={pending}
          defaultValue={note}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {state?.ok === false ? (
        <p className="text-sm leading-6 text-destructive">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Reject
      </button>
    </form>
  );
}

function nextNoteFieldKey(previous: NoteField, state: RejectCandidateState): NoteField {
  if (state === previous.state) {
    return previous;
  }
  if (state?.ok === false) {
    return { state, key: previous.key + 1 };
  }
  return { state, key: previous.key };
}
