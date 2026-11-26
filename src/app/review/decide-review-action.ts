"use server";

import { refresh } from "next/cache";
import {
  readDecisionForm,
  refusedReview,
  type DecideReviewFormState,
} from "@/app/review/decision-form";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { priceAlertEvents, type SiteAlertEvent } from "@/core/alerts/site-alert";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { postDiscordAlert } from "@/server/alerts/post-discord-alert";
import { postSlackAlert } from "@/server/alerts/post-slack-alert";
import { createDb } from "@/server/db/client";
import { parseDatabaseEnv } from "@/server/env";
import { decideReviewItem } from "@/server/review/decide-review-item";

/**
 * Confirm or reject the item in the form.
 *
 * The page lock is not enough: this request can be sent without the
 * form. The reviewer is checked again here. The note, the id, and the
 * prices are read on the server. The browser does not send a price.
 *
 * A refusal is a sentence for the form, plus the note the reviewer
 * typed. A missing database still throws. refresh() asks Next.js to
 * render this page again, so a finished item drops the buttons. An
 * action that does not ask is not re-rendered.
 *
 * A published price tells Discord and Slack after the database
 * connection is closed. The same price, a rejection, and a refusal stay
 * quiet. A failed post does not undo the price.
 */
export async function decideReviewAction(
  _previous: DecideReviewFormState,
  formData: FormData,
): Promise<DecideReviewFormState> {
  const reviewedBy = await requireAllowedReviewer();
  let fields;
  try {
    fields = readDecisionForm(formData);
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return refusedReview(error.message, formData);
    }
    throw error;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  let events: SiteAlertEvent[] = [];
  try {
    const result = await decideReviewItem(db, {
      observationItemId: fields.observationItemId,
      decision: fields.decision,
      note: fields.note,
      reviewedBy,
      reviewedAt: new Date(),
    });
    if (result.decision === "confirmed" && result.published) {
      events = priceAlertEvents({
        published: true,
        lab: result.labSlug,
        model: result.modelSlug,
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
  try {
    await postSlackAlert({ events, env: process.env, fetchImpl: fetch });
  } catch {
    console.error("Slack post failed");
  }
  refresh();
  return null;
}
