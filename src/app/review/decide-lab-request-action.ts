"use server";

import { refresh } from "next/cache";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import type { DecideLabRequestState } from "@/components/lab-request-list";
import { LabRequestRefusal } from "@/core/labs/suggest-lab";
import { createDb } from "@/server/db/client";
import { decideLabRequest } from "@/server/db/repositories/lab-requests";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Accept or decline one pending lab suggestion.
 *
 * The reviewer is checked again here. A blank note writes nothing and
 * the typed note comes back. Accepting does not insert a lab and does
 * not call publishPriceVersion().
 */
export async function decideLabRequestAction(
  _previous: DecideLabRequestState,
  formData: FormData,
): Promise<DecideLabRequestState> {
  const reviewedBy = await requireAllowedReviewer();
  const decision = formData.get("decision");
  const note = formData.get("note");
  const rawId = formData.get("requestId");
  const typedNote = typeof note === "string" ? note : "";

  if (decision !== "accept" && decision !== "decline") {
    return { ok: false, message: "Choose accept or decline.", note: typedNote };
  }
  if (typeof rawId !== "string" || !/^[1-9][0-9]*$/.test(rawId)) {
    return { ok: false, message: "Request id must be a whole number.", note: typedNote };
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await decideLabRequest(db, {
      requestId: Number(rawId),
      decision,
      note: typedNote,
      reviewedBy,
      reviewedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof LabRequestRefusal) {
      return { ok: false, message: decisionMessage(error.message), note: typedNote };
    }
    throw error;
  } finally {
    await close();
  }

  refresh();
  return null;
}

function decisionMessage(message: string): string {
  if (message === "review note is empty") {
    return "Enter a note.";
  }
  if (message === "request is not waiting") {
    return "This suggestion was already decided.";
  }
  if (message === "request was not found") {
    return "This suggestion was not found.";
  }
  return "This suggestion could not be decided.";
}
