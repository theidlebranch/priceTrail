import { parseReviewItemId } from "@/app/review/review-list";
import { ReviewRefusal } from "@/core/review/confirm-price";

/**
 * Read the confirm/reject form.
 *
 * This file does not open a database and does not call new Date().
 * The button value is the decision. A post can send any string, so
 * anything other than confirm or reject is refused before a write.
 */

export type DecisionForm = {
  observationItemId: number;
  decision: "confirm" | "reject";
  note: string;
};

export type DecideReviewFormState = { ok: false; message: string } | null;

export function readDecisionForm(formData: FormData): DecisionForm {
  const decision = formData.get("decision");
  if (decision !== "confirm" && decision !== "reject") {
    throw new ReviewRefusal("review decision is not confirm or reject");
  }

  const itemId = formData.get("itemId");
  if (typeof itemId !== "string") {
    throw new ReviewRefusal("observation item id must be a whole number");
  }
  let observationItemId: number;
  try {
    observationItemId = parseReviewItemId(itemId);
  } catch (error) {
    if (error instanceof Error) {
      throw new ReviewRefusal(error.message);
    }
    throw error;
  }

  const note = formData.get("note");
  if (typeof note !== "string") {
    throw new ReviewRefusal("review note is empty");
  }

  return { observationItemId, decision, note };
}
