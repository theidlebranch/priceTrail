import { and, eq, inArray, or } from "drizzle-orm";
import {
  accountsFollowingPublishedPrice,
  publishedPriceLine,
  type StoredFollow,
} from "@/core/alerts/follow-alert";
import { readDiscordWebhook, readSlackWebhook } from "@/core/alerts/webhook-url";
import { openWebhookUrl } from "@/server/alerts/webhook-seal";
import { redactSecrets } from "@/server/db/seed";
import type { AlertWebhookDb } from "@/server/db/repositories/alert-webhooks";
import { alertWebhooks, follows, labs, models } from "@/server/db/schema";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Tell followers about one published price.
 *
 * followersForAlerts only selects. It returns the people who follow
 * that model or its lab, and the sealed text they saved. A missing
 * channel is left empty. postFollowAlerts opens each seal, checks the
 * host again, and posts the published-price line. A failed open or a
 * failed post is logged and does not throw. The URL is not logged.
 * This file does not call publishPriceVersion().
 */

const POST_TIMEOUT_MS = 10_000;

export type FollowAlertDelivery = {
  accountId: string;
  slackSealed: string | null;
  discordSealed: string | null;
  line: string;
};

async function followersForAlerts(
  db: AlertWebhookDb,
  input: { labSlug: string; modelSlug: string },
): Promise<FollowAlertDelivery[]> {
  const labRows = await db
    .select({ id: labs.id })
    .from(labs)
    .where(eq(labs.slug, input.labSlug))
    .limit(1);
  const lab = labRows[0];
  if (lab === undefined) {
    throw new Error("published price is missing its lab");
  }
  const modelRows = await db
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.labId, lab.id), eq(models.slug, input.modelSlug)))
    .limit(1);
  const model = modelRows[0];
  if (model === undefined) {
    throw new Error("published price is missing its model");
  }

  const followRows = await db
    .select({
      accountId: follows.accountId,
      kind: follows.kind,
      modelId: follows.modelId,
      labId: follows.labId,
    })
    .from(follows)
    .where(
      or(
        and(eq(follows.kind, "model"), eq(follows.modelId, model.id)),
        and(eq(follows.kind, "lab"), eq(follows.labId, lab.id)),
      ),
    );
  const accountIds = accountsFollowingPublishedPrice({
    labId: lab.id,
    modelId: model.id,
    follows: followRows satisfies readonly StoredFollow[],
  }).sort();
  if (accountIds.length === 0) {
    return [];
  }

  const hooks = await db
    .select({
      accountId: alertWebhooks.accountId,
      slackWebhookUrl: alertWebhooks.slackWebhookUrl,
      discordWebhookUrl: alertWebhooks.discordWebhookUrl,
    })
    .from(alertWebhooks)
    .where(inArray(alertWebhooks.accountId, accountIds));
  const byAccount = new Map(hooks.map((row) => [row.accountId, row]));
  const line = publishedPriceLine(input.labSlug, input.modelSlug);

  return accountIds.flatMap((accountId) => {
    const row = byAccount.get(accountId);
    if (row === undefined || (row.slackWebhookUrl == null && row.discordWebhookUrl == null)) {
      return [];
    }
    return [
      {
        accountId,
        slackSealed: row.slackWebhookUrl,
        discordSealed: row.discordWebhookUrl,
        line,
      },
    ];
  });
}

/**
 * Empty when this decision did not publish a price. Confirming the
 * same price, rejecting, and accepting a retirement pass published false
 * and do not read follows.
 */
export async function deliveriesAfterPublish(
  db: AlertWebhookDb,
  input: { published: boolean; labSlug: string; modelSlug: string },
): Promise<FollowAlertDelivery[]> {
  if (!input.published) {
    return [];
  }
  return followersForAlerts(db, input);
}

export async function postFollowAlerts(input: {
  deliveries: readonly FollowAlertDelivery[];
  fetchImpl: FetchLike;
  key: Uint8Array | null;
}): Promise<void> {
  if (input.key == null) {
    if (input.deliveries.length > 0) {
      console.error("ALERT_WEBHOOK_KEY is missing or not 32 bytes.");
    }
    return;
  }
  const key = input.key;
  await Promise.all(input.deliveries.map((delivery) => postDelivery(delivery, input.fetchImpl, key)));
}

async function postDelivery(
  delivery: FollowAlertDelivery,
  fetchImpl: FetchLike,
  key: Uint8Array,
): Promise<void> {
  if (delivery.line.trim() === "") {
    return;
  }
  await Promise.all([
    postChannel({
      channel: "slack",
      url: openSealed(delivery.slackSealed, key, delivery.accountId, "slack"),
      body: { text: delivery.line },
      fetchImpl,
    }),
    postChannel({
      channel: "discord",
      url: openSealed(delivery.discordSealed, key, delivery.accountId, "discord"),
      body: { content: delivery.line },
      fetchImpl,
    }),
  ]);
}

function openSealed(
  sealed: string | null,
  key: Uint8Array,
  accountId: string,
  channel: "slack" | "discord",
): string | null {
  if (sealed == null) {
    return null;
  }
  const url = openWebhookUrl({ sealed, key, accountId, channel });
  if (url == null) {
    const label = channel === "slack" ? "Slack" : "Discord";
    console.error(`${label} webhook could not be opened`);
    return null;
  }
  return url;
}

async function postChannel(input: {
  channel: "slack" | "discord";
  url: string | null;
  body: { text: string } | { content: string };
  fetchImpl: FetchLike;
}): Promise<void> {
  if (input.url == null) {
    return;
  }
  const read = input.channel === "slack" ? readSlackWebhook(input.url) : readDiscordWebhook(input.url);
  const label = input.channel === "slack" ? "Slack" : "Discord";
  if (read.kind === "missing") {
    return;
  }
  if (read.kind === "ignored") {
    console.error(`${label} webhook URL was ignored`);
    return;
  }

  try {
    const response = await input.fetchImpl(read.url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.body),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (!response.ok || response.status >= 300) {
      console.error(`${label} post failed: ${response.status}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : `${label} post failed`;
    const text = message.trim() === "" ? `${label} post failed` : message;
    const redacted = redactSecrets(text, [read.url]);
    console.error(redacted.startsWith(`${label} post failed`) ? redacted : `${label} post failed: ${redacted}`);
  }
}
