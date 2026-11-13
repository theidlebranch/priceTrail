import { and, eq } from "drizzle-orm";
import { ReviewRefusal } from "@/core/review/confirm-price";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { candidateModels } from "@/server/db/schema";

/**
 * Reject one new-name card.
 *
 * A blank note writes nothing. The card stays pending. A rejected card
 * stays rejected, so a later read does not open it again. This does not
 * create a model and does not call publishPriceVersion().
 */
export async function rejectCandidateModel(
  db: SignalDb,
  input: { candidateId: number; note: string; reviewedBy: string; reviewedAt: Date },
): Promise<void> {
  if (!Number.isInteger(input.candidateId) || input.candidateId <= 0) {
    throw new ReviewRefusal("candidate id must be a whole number");
  }
  const note = input.note.trim();
  if (note.length === 0) {
    throw new ReviewRefusal("review note is empty");
  }
  if (input.reviewedBy.trim().length === 0) {
    throw new ReviewRefusal("reviewer id is empty");
  }
  if (!(input.reviewedAt instanceof Date) || Number.isNaN(input.reviewedAt.getTime())) {
    throw new Error("reviewedAt is not a real date");
  }

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: candidateModels.id, status: candidateModels.status })
      .from(candidateModels)
      .where(eq(candidateModels.id, input.candidateId))
      .for("update");
    const card = rows[0];
    if (card === undefined) {
      throw new ReviewRefusal("candidate model was not found");
    }
    if (card.status !== "pending_review") {
      throw new ReviewRefusal("candidate model is not waiting");
    }
    await tx
      .update(candidateModels)
      .set({
        status: "rejected",
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewedAt,
        reviewNote: note,
      })
      .where(and(eq(candidateModels.id, card.id), eq(candidateModels.status, "pending_review")));
  });
}
