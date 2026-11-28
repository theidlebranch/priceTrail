import { eq, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { checkedFollowAccountId } from "@/core/follows/follow";
import { checkedDiscordWebhook, checkedSlackWebhook } from "@/core/alerts/webhook-url";
import { sealWebhookUrl } from "@/server/alerts/webhook-seal";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import * as schema from "@/server/db/schema";
import { alertWebhooks } from "@/server/db/schema";

/**
 * One account's Slack and Discord webhook URLs.
 *
 * saveAlertWebhook replaces or clears one channel. A bad URL throws
 * and writes nothing. A good URL is sealed before it is stored. The
 * other channel is copied as already sealed text. Clearing both deletes
 * the row. findAlertWebhookStatus only says whether each channel is
 * saved. It does not open the seal or return the URL.
 * This file does not call publishPriceVersion().
 */

type Schema = typeof schema;

export type AlertWebhookDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type AlertChannel = "slack" | "discord";

export type AlertWebhookStatus = {
  slackSaved: boolean;
  discordSaved: boolean;
};

export type SaveAlertWebhookInput = {
  accountId: string;
  updatedAt: Date;
  channel: AlertChannel;
  intent: "replace" | "remove";
  url?: string;
};

export async function saveAlertWebhook(
  db: AlertWebhookDb,
  input: SaveAlertWebhookInput,
  key: Uint8Array,
): Promise<AlertWebhookStatus> {
  const accountId = checkedFollowAccountId(input.accountId);
  assertRealDate(input.updatedAt);
  const nextUrl =
    input.intent === "remove"
      ? null
      : sealWebhookUrl({
          url: checkedChannelUrl(input.channel, input.url ?? ""),
          key,
          accountId,
          channel: input.channel,
        });

  return db.transaction(async (tx) => {
    const current = await lockRow(tx, accountId);
    const slack = input.channel === "slack" ? nextUrl : (current?.slackWebhookUrl ?? null);
    const discord = input.channel === "discord" ? nextUrl : (current?.discordWebhookUrl ?? null);
    if (slack == null && discord == null) {
      if (current !== null) {
        await tx.delete(alertWebhooks).where(eq(alertWebhooks.accountId, accountId));
      }
      return { slackSaved: false, discordSaved: false };
    }

    if (current === null) {
      const rows = await tx
        .insert(alertWebhooks)
        .values({
          accountId,
          slackWebhookUrl: slack,
          discordWebhookUrl: discord,
          updatedAt: input.updatedAt,
        })
        .returning({ accountId: alertWebhooks.accountId });
      requireInsertedRow(rows, "saveAlertWebhook");
    } else {
      await tx
        .update(alertWebhooks)
        .set({
          slackWebhookUrl: slack,
          discordWebhookUrl: discord,
          updatedAt: input.updatedAt,
        })
        .where(eq(alertWebhooks.accountId, accountId));
    }
    return statusOf(slack, discord);
  });
}

export async function findAlertWebhookStatus(
  db: AlertWebhookDb,
  accountId: string,
): Promise<AlertWebhookStatus> {
  const id = checkedFollowAccountId(accountId);
  const rows = await db
    .select({
      slackWebhookUrl: alertWebhooks.slackWebhookUrl,
      discordWebhookUrl: alertWebhooks.discordWebhookUrl,
    })
    .from(alertWebhooks)
    .where(eq(alertWebhooks.accountId, id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return { slackSaved: false, discordSaved: false };
  }
  return statusOf(row.slackWebhookUrl, row.discordWebhookUrl);
}

function checkedChannelUrl(channel: AlertChannel, url: string): string {
  return channel === "slack" ? checkedSlackWebhook(url) : checkedDiscordWebhook(url);
}

function statusOf(slack: string | null, discord: string | null): AlertWebhookStatus {
  return { slackSaved: slack != null, discordSaved: discord != null };
}

async function lockRow(
  db: AlertWebhookDb,
  accountId: string,
): Promise<{ slackWebhookUrl: string | null; discordWebhookUrl: string | null } | null> {
  const rows = await db
    .select({
      slackWebhookUrl: alertWebhooks.slackWebhookUrl,
      discordWebhookUrl: alertWebhooks.discordWebhookUrl,
    })
    .from(alertWebhooks)
    .where(eq(alertWebhooks.accountId, accountId))
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

function assertRealDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("updatedAt is not a real date");
  }
}
