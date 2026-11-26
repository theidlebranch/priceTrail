"use server";

import { refresh } from "next/cache";
import { refusedReview, type DecideReviewFormState } from "@/app/review/decision-form";
import { parseOfficialCandidateId } from "@/app/review/official-candidate-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { priceAlertEvents, type SiteAlertEvent } from "@/core/alerts/site-alert";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { postDiscordAlert } from "@/server/alerts/post-discord-alert";
import { createDb } from "@/server/db/client";
import { parseDatabaseEnv } from "@/server/env";
import { acceptModelRetirement } from "@/server/review/accept-model-retirement";
import { publishNewOfficialModel } from "@/server/review/publish-new-official-model";
import { rejectCandidateModel } from "@/server/review/reject-candidate";

/**
 * Add and publish, or reject, the official new-model card in the form.
 *
 * The reviewer is checked again here. The browser does not send a price.
 * A refusal puts the typed note back. refresh() asks Next.js to render
 * the page again, so a finished card drops the buttons. Add and publish
 * tells Discord after the database connection is closed. Reject and
 * accept stay quiet. A failed post does not undo the price.
 */
export async function publishCandidateAction(
  _previous: DecideReviewFormState,
  formData: FormData,
): Promise<DecideReviewFormState> {
  const reviewedBy = await requireAllowedReviewer();
  const decision = formData.get("decision");
  if (decision !== "publish" && decision !== "accept" && decision !== "reject") {
    return refusedReview("review decision is not add and publish, accept, or reject", formData);
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
  let events: SiteAlertEvent[] = [];
  try {
    const review = {
      candidateId,
      note,
      reviewedBy,
      reviewedAt: new Date(),
    };
    if (decision === "reject") {
      await rejectCandidateModel(db, review);
    } else if (decision === "accept") {
      await acceptModelRetirement(db, review);
    } else {
      const published = await publishNewOfficialModel(db, review);
      events = priceAlertEvents({
        published: true,
        lab: published.labSlug,
        model: published.modelSlug,
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

  try {
    await postDiscordAlert({ events, env: process.env, fetchImpl: fetch });
  } catch {
    console.error("Discord post failed");
  }
  refresh();
  return null;
}
