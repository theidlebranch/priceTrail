"use server";

import { refresh } from "next/cache";
import { FollowRefusal } from "@/core/follows/follow";
import { AlertWebhookRefusal } from "@/core/alerts/webhook-url";
import { AlertWebhookKeyError, readAlertWebhookKey, WebhookSealError } from "@/server/alerts/webhook-seal";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import {
  saveAlertWebhook,
  type AlertChannel,
} from "@/server/db/repositories/alert-webhooks";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Save or remove one webhook for the signed-in account.
 *
 * The account id comes from the session, not the form. A blank URL
 * leaves the saved one alone. A bad URL writes nothing. A good URL is
 * sealed with ALERT_WEBHOOK_KEY before it is stored. A missing key
 * writes nothing. The result does not include the URL. This does not
 * call publishPriceVersion().
 */

export type AlertWebhookFormState = { ok: true; message: string } | { ok: false; message: string } | null;

export async function saveWebhookAction(
  _previous: AlertWebhookFormState,
  formData: FormData,
): Promise<AlertWebhookFormState> {
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return { ok: false, message: "Sign in to save a webhook." };
  }
  const channel = readChannel(formData.get("channel"));
  const intent = readIntent(formData.get("intent"));
  if (channel === null || intent === null) {
    return { ok: false, message: "That webhook could not be saved." };
  }
  const url = formData.get("url");
  const urlText = typeof url === "string" ? url : "";
  if (intent === "replace" && urlText.trim() === "") {
    return { ok: true, message: unchangedSentence(channel) };
  }

  let key: Uint8Array;
  try {
    key = readAlertWebhookKey(process.env);
  } catch (error) {
    if (error instanceof AlertWebhookKeyError) {
      console.error(error.message);
      return { ok: false, message: "Alerts cannot be saved right now." };
    }
    throw error;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await saveAlertWebhook(
      db,
      {
        accountId,
        updatedAt: new Date(),
        channel,
        intent,
        url: urlText,
      },
      key,
    );
    refresh();
    return { ok: true, message: savedSentence(channel, intent) };
  } catch (error) {
    if (error instanceof WebhookSealError) {
      console.error(error.message);
      return { ok: false, message: "Alerts cannot be saved right now." };
    }
    if (error instanceof AlertWebhookRefusal || error instanceof FollowRefusal) {
      return { ok: false, message: error.message };
    }
    throw error;
  } finally {
    await close();
  }
}

function readChannel(value: FormDataEntryValue | null): AlertChannel | null {
  if (value === "slack" || value === "discord") {
    return value;
  }
  return null;
}

function readIntent(value: FormDataEntryValue | null): "replace" | "remove" | null {
  if (value === "replace" || value === "remove") {
    return value;
  }
  return null;
}

function unchangedSentence(channel: AlertChannel): string {
  return channel === "slack" ? "Slack is unchanged." : "Discord is unchanged.";
}

function savedSentence(channel: AlertChannel, intent: "replace" | "remove"): string {
  if (channel === "slack") {
    return intent === "replace" ? "Slack is saved." : "Slack is removed.";
  }
  return intent === "replace" ? "Discord is saved." : "Discord is removed.";
}
