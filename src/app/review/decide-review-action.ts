"use server";

import { refresh } from "next/cache";
import { readDecisionForm, type DecideReviewFormState } from "@/app/review/decision-form";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { ReviewRefusal } from "@/core/review/confirm-price";
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
 * A refusal is a sentence for the form. A missing database still throws.
 * refresh() asks Next.js to render this page again, so a finished item
 * drops the buttons. An action that does not ask is not re-rendered.
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
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await decideReviewItem(db, {
      observationItemId: fields.observationItemId,
      decision: fields.decision,
      note: fields.note,
      reviewedBy,
      reviewedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return { ok: false, message: error.message };
    }
    throw error;
  } finally {
    await close();
  }

  refresh();
  return null;
}
