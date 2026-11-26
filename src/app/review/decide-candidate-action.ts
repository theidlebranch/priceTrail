"use server";

import { refresh } from "next/cache";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import type { DecideCandidateState } from "@/components/signal-candidate-form";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createDb } from "@/server/db/client";
import { parseDatabaseEnv } from "@/server/env";
import { acceptModelRetirement } from "@/server/review/accept-model-retirement";
import { approveNewName } from "@/server/review/approve-platform-model";
import { rejectCandidateModel } from "@/server/review/reject-candidate";

/**
 * Approve, accept, or reject the card in the form.
 *
 * The reviewer is checked again here. Approve adds a new name and does
 * not publish a price. Accept marks a retirement and does not publish
 * a price. A blank note writes nothing and the typed note comes back.
 * This does not call publishPriceVersion().
 */
export async function decideCandidateAction(
  _previous: DecideCandidateState,
  formData: FormData,
): Promise<DecideCandidateState> {
  const reviewedBy = await requireAllowedReviewer();
  const decision = formData.get("decision");
  const note = formData.get("note");
  const rawId = formData.get("candidateId");
  const typedNote = typeof note === "string" ? note : "";

  if (decision !== "approve" && decision !== "accept" && decision !== "reject") {
    return { ok: false, message: "review decision is not approve, accept, or reject", note: typedNote };
  }
  if (typeof rawId !== "string" || !/^[1-9][0-9]*$/.test(rawId)) {
    return { ok: false, message: "candidate id must be a whole number", note: typedNote };
  }
  const candidateId = Number(rawId);

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const review = {
      candidateId,
      note: typedNote,
      reviewedBy,
      reviewedAt: new Date(),
    };
    if (decision === "approve") {
      await approveNewName(db, review);
    } else if (decision === "accept") {
      await acceptModelRetirement(db, review);
    } else {
      await rejectCandidateModel(db, review);
    }
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return { ok: false, message: error.message, note: typedNote };
    }
    throw error;
  } finally {
    await close();
  }

  refresh();
  return null;
}
