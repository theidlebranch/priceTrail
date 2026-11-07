"use client";

import { useActionState, useState } from "react";
import type { DecideReviewFormState } from "@/app/review/decision-form";
import { buttonVariants } from "@/components/ui/button";

type NoteField = { state: DecideReviewFormState; key: number };

/**
 * React clears the note box when the action finishes, then resets the
 * box to its default value. Each refusal gets a new key, so the box
 * mounts again with the note that was submitted. The same note can be
 * refused twice. Returning the previous object when nothing changed
 * keeps the render from looping.
 */
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
 * The note and the two buttons for one flagged item.
 *
 * useActionState keeps the refusal sentence from the action. The buttons
 * are native submit buttons, so the clicked value is the decision the
 * server reads. A price is not a field in this form. The caller passes
 * the action. This file does not open a database.
 */
export function ReviewDecisionFields({
  itemId,
  action,
}: {
  itemId: number;
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
    <form action={formAction} className="max-w-xl space-y-3" key={field.key}>
      <input type="hidden" name="itemId" value={String(itemId)} />
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
        <button
          type="submit"
          name="decision"
          value="confirm"
          disabled={pending}
          className={buttonVariants()}
        >
          Confirm
        </button>
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
