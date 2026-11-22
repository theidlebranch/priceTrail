"use server";

import { refresh } from "next/cache";
import type { SuggestLabState } from "@/components/lab-list";
import { LabRequestRefusal } from "@/core/labs/suggest-lab";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { suggestLab } from "@/server/db/repositories/lab-requests";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Store one lab suggestion for the signed-in account.
 *
 * A blank name, a lab we already track, or a name that is already
 * waiting writes nothing and puts the typed name back. This does not
 * insert a lab and does not call publishPriceVersion().
 */
export async function suggestLabAction(
  _previous: SuggestLabState,
  formData: FormData,
): Promise<SuggestLabState> {
  const typed = formData.get("labName");
  const name = typeof typed === "string" ? typed : "";
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return { ok: false, message: "Sign in to suggest a lab.", name };
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await suggestLab(db, {
      labName: name,
      suggestedBy: accountId,
      suggestedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof LabRequestRefusal) {
      return { ok: false, message: suggestionMessage(error.message), name };
    }
    throw error;
  } finally {
    await close();
  }

  refresh();
  return null;
}

function suggestionMessage(message: string): string {
  if (message === "lab name is empty") {
    return "Enter a lab name.";
  }
  if (message === "that lab is already tracked") {
    return "That lab is already tracked.";
  }
  if (message === "that lab is already suggested") {
    return "That lab is already suggested.";
  }
  return "Sign in to suggest a lab.";
}
