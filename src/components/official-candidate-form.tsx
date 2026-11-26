"use client";

import { useActionState, useState } from "react";
import type { DecideReviewFormState } from "@/app/review/decision-form";
import { buttonVariants } from "@/components/ui/button";

type NoteField = { state: DecideReviewFormState; key: number };

function nextNoteFieldKey(previous: NoteField, state: DecideReviewFormState): NoteField {
  if (state === previous.state) {
    return previous;
  }
  if (state?.ok === false) {
    return { state, key: previous.key + 1 };
  }
  return { state, key: previous.key };
}

/**
 * The note and the two buttons for one official new-model card.
 *
 * Add and publish and Reject share one note. The clicked button is the
 * decision. This file does not open a database.
 */
export function OfficialCandidateForm({
  candidateId,
  canPublish,
  mode,
  action,
}: {
  candidateId: number;
  canPublish: boolean;
  mode: "publish" | "accept";
  action: (
    previous: DecideReviewFormState,
    formData: FormData,
  ) => Promise<DecideReviewFormState>;
}) {
  const [state, formAction, pending] = useActionState<DecideReviewFormState, FormData>(
    action,
    null,
  );
  const [field, setField] = useState<NoteField>({ state, key: 0 });
  const nextField = nextNoteFieldKey(field, state);
  if (nextField !== field) {
    setField(nextField);
  }
  const note = state?.ok === false ? state.note : "";

  return (
    <form action={formAction} className="space-y-3" key={field.key}>
      <input type="hidden" name="candidateId" value={String(candidateId)} />
      <label className="block space-y-2 text-sm leading-6">
        <span>Note</span>
        <textarea
          name="note"
          required
          rows={3}
          disabled={pending}
          defaultValue={note}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {state?.ok === false ? (
        <p className="text-sm leading-6 text-destructive">{state.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {mode === "accept" ? (
          <button
            type="submit"
            name="decision"
            value="accept"
            disabled={pending}
            className={buttonVariants()}
          >
            Accept
          </button>
        ) : null}
        {mode === "publish" && canPublish ? (
          <button
            type="submit"
            name="decision"
            value="publish"
            disabled={pending}
            className={buttonVariants()}
          >
            Add and publish
          </button>
        ) : null}
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className={buttonVariants({ variant: "outline" })}
        >
          Reject
        </button>
      </div>
    </form>
  );
}
