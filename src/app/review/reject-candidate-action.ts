"use server";

import { refresh } from "next/cache";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import type { RejectCandidateState } from "@/components/signal-reject-form";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createDb } from "@/server/db/client";
import { parseDatabaseEnv } from "@/server/env";
import { rejectCandidateModel } from "@/server/review/reject-candidate";

/**
 * Reject the new-name card in the form.
 *
 * The reviewer is checked again here. A blank note writes nothing and
 * the typed note comes back. This does not call publishPriceVersion().
 */
export async function rejectCandidateAction(
  _previous: RejectCandidateState,
  formData: FormData,
): Promise<RejectCandidateState> {
  const reviewedBy = await requireAllowedReviewer();
  const note = formData.get("note");
  const rawId = formData.get("candidateId");
  const typedNote = typeof note === "string" ? note : "";

  if (typeof rawId !== "string" || !/^[1-9][0-9]*$/.test(rawId)) {
    return { ok: false, message: "candidate id must be a whole number", note: typedNote };
  }
  const candidateId = Number(rawId);

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await rejectCandidateModel(db, {
      candidateId,
      note: typedNote,
      reviewedBy,
      reviewedAt: new Date(),
    });
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
