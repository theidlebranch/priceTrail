"use client";

import { decideReviewAction } from "@/app/review/decide-review-action";
import { ReviewDecisionFields } from "@/components/review-decision-fields";

/**
 * The note and the two buttons for one flagged item.
 *
 * The fields file does not import the server action. This file is the
 * one place that passes it.
 */
export function ReviewDecisionForm({ itemId }: { itemId: number }) {
  return <ReviewDecisionFields itemId={itemId} action={decideReviewAction} />;
}
