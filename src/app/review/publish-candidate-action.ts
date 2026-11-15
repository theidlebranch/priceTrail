"use server";

import { refresh } from "next/cache";
import { refusedReview, type DecideReviewFormState } from "@/app/review/decision-form";
import { parseOfficialCandidateId } from "@/app/review/official-candidate-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createDb } from "@/server/db/client";
import { parseDatabaseEnv } from "@/server/env";
import { publishNewOfficialModel } from "@/server/review/publish-new-official-model";
import { rejectCandidateModel } from "@/server/review/reject-candidate";

/**
 * Add and publish, or reject, the official new-model card in the form.
 *
 * The reviewer is checked again here. The browser does not send a price.
 * A refusal puts the typed note back. refresh() asks Next.js to render
 * the page again, so a finished card drops the buttons.
 */
export async function publishCandidateAction(
  _previous: DecideReviewFormState,
  formData: FormData,
): Promise<DecideReviewFormState> {
  const reviewedBy = await requireAllowedReviewer();
  const decision = formData.get("decision");
  if (decision !== "publish" && decision !== "reject") {
    return refusedReview("review decision is not add and publish or reject", formData);
  }

  const rawId = formData.get("candidateId");
  if (typeof rawId !== "string") {
    return refusedReview("candidate id must be a whole number", formData);
  }
  let candidateId: number;
  try {
    candidateId = parseOfficialCandidateId(rawId);
  } catch (error) {
    if (error instanceof Error) {
      return refusedReview(error.message, formData);
    }
    throw error;
  }
  const note = formData.get("note");
  if (typeof note !== "string") {
    return refusedReview("review note is empty", formData);
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    if (decision === "reject") {
      await rejectCandidateModel(db, {
        candidateId,
        note,
        reviewedBy,
        reviewedAt: new Date(),
      });
    } else {
      await publishNewOfficialModel(db, {
        candidateId,
        note,
        reviewedBy,
        reviewedAt: new Date(),
      });
    }
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return refusedReview(error.message, formData);
    }
    throw error;
  } finally {
    await close();
  }

  refresh();
  return null;
}
