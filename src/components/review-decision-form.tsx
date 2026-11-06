"use client";

import { useActionState } from "react";
import { decideReviewAction } from "@/app/review/decide-review-action";
import type { DecideReviewFormState } from "@/app/review/decision-form";
import { buttonVariants } from "@/components/ui/button";

/**
 * The note and the two buttons for one flagged item.
 *
 * useActionState keeps the refusal sentence from the server action.
 * The buttons are native submit buttons, so the clicked value is the
 * decision the server reads. A price is not a field in this form.
 */
export function ReviewDecisionForm({ itemId }: { itemId: number }) {
  const [state, formAction, pending] = useActionState<DecideReviewFormState, FormData>(
    decideReviewAction,
    null,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <input type="hidden" name="itemId" value={String(itemId)} />
      <label className="block space-y-2 text-sm leading-6">
        <span>Note</span>
        <textarea
          name="note"
          required
          rows={3}
          disabled={pending}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {state?.ok === false ? <p className="text-sm leading-6 text-destructive">{state.message}</p> : null}
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
