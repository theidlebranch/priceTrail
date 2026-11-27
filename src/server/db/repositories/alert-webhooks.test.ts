// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/alert-webhooks.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { FollowRefusal } from "@/core/follows/follow";
import { AlertWebhookRefusal } from "@/core/alerts/webhook-url";
import { openWebhookUrl } from "@/server/alerts/webhook-seal";
import { createDb } from "@/server/db/client";
import {
  findAlertWebhookStatus,
  saveAlertWebhook,
  type AlertWebhookDb,
} from "@/server/db/repositories/alert-webhooks";
import { alertWebhooks } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const WHEN = new Date("2026-11-27T12:10:00.000Z");
const LATER = new Date("2026-11-27T12:12:00.000Z");
const ACCOUNT = `google:alert-${randomUUID()}`;
const OTHER = `github:${BigInt(`0x${randomUUID().replaceAll("-", "")}`)}`;
const SLACK = "https://hooks.slack.com/services/T/B/secret-token";
const DISCORD = "https://discord.com/api/webhooks/123/secret-token";
const NEXT_SLACK = "https://hooks.slack.com/services/T/B/next-token";
const KEY = Buffer.alloc(32, 7);

function save(tx: AlertWebhookDb, input: Parameters<typeof saveAlertWebhook>[1]) {
  return saveAlertWebhook(tx, input, KEY);
}

function storedText(sealed: string | null | undefined): string {
  return sealed ?? "";
}

function constraintName(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (current == null || typeof current !== "object") {
      return "";
    }
    if ("constraint_name" in current && typeof current.constraint_name === "string") {
      return current.constraint_name;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return "";
}

describe.skipIf(databaseUrl.length === 0)("alert webhooks", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const parsed = parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    const opened = createDb(parsed.databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("saves, replaces, and removes one channel without returning the URL", async () => {
    await withRollback(async (tx) => {
      const saved = await save(tx, {
        accountId: ACCOUNT,
        updatedAt: WHEN,
        channel: "slack",
        intent: "replace",
        url: `  ${SLACK}  `,
      });
      expect(saved).toEqual({ slackSaved: true, discordSaved: false });
      expect(JSON.stringify(saved)).not.toContain("secret-token");

      await save(tx, {
        accountId: ACCOUNT,
        updatedAt: LATER,
        channel: "discord",
        intent: "replace",
        url: DISCORD,
      });
      await save(tx, {
        accountId: ACCOUNT,
        updatedAt: LATER,
        channel: "slack",
        intent: "replace",
        url: NEXT_SLACK,
      });

      const stored = await tx.select().from(alertWebhooks).where(eq(alertWebhooks.accountId, ACCOUNT));
      expect(stored).toHaveLength(1);
      expect(stored[0]?.updatedAt).toEqual(LATER);
      expect(opened(stored[0]?.slackWebhookUrl, "slack")).toBe(NEXT_SLACK);
      expect(opened(stored[0]?.discordWebhookUrl, "discord")).toBe(DISCORD);
      expect(storedText(stored[0]?.slackWebhookUrl)).not.toContain("secret-token");
      expect(storedText(stored[0]?.slackWebhookUrl)).not.toContain("hooks.slack.com");
      expect(storedText(stored[0]?.discordWebhookUrl)).not.toContain("secret-token");
      expect(storedText(stored[0]?.discordWebhookUrl)).not.toContain("discord.com");

      const removed = await save(tx, {
        accountId: ACCOUNT,
        updatedAt: LATER,
        channel: "discord",
        intent: "remove",
      });
      expect(removed).toEqual({ slackSaved: true, discordSaved: false });
      expect(await findAlertWebhookStatus(tx, ACCOUNT)).toEqual({
        slackSaved: true,
        discordSaved: false,
      });
    });
  });

  it("deletes the row when both URLs are cleared", async () => {
    await withRollback(async (tx) => {
      await save(tx, {
        accountId: ACCOUNT,
        updatedAt: WHEN,
        channel: "slack",
        intent: "replace",
        url: SLACK,
      });
      const cleared = await save(tx, {
        accountId: ACCOUNT,
        updatedAt: LATER,
        channel: "slack",
        intent: "remove",
      });
      expect(cleared).toEqual({ slackSaved: false, discordSaved: false });
      expect(await tx.select().from(alertWebhooks).where(eq(alertWebhooks.accountId, ACCOUNT))).toEqual(
        [],
      );
    });
  });

  it("leaves the saved URL in place when the new URL is bad", async () => {
    await withRollback(async (tx) => {
      await save(tx, {
        accountId: ACCOUNT,
        updatedAt: WHEN,
        channel: "slack",
        intent: "replace",
        url: SLACK,
      });
      await expect(
        save(tx, {
          accountId: ACCOUNT,
          updatedAt: LATER,
          channel: "slack",
          intent: "replace",
          url: "https://evil.example/hook-secret-zzz",
        }),
      ).rejects.toThrow(AlertWebhookRefusal);
      const stored = await tx.select().from(alertWebhooks).where(eq(alertWebhooks.accountId, ACCOUNT));
      expect(opened(stored[0]?.slackWebhookUrl, "slack")).toBe(SLACK);
      expect(storedText(stored[0]?.slackWebhookUrl)).not.toContain("secret-token");
      expect(stored[0]?.updatedAt).toEqual(WHEN);
    });
  });

  it("does not show one account the other account's URL", async () => {
    await withRollback(async (tx) => {
      await save(tx, {
        accountId: ACCOUNT,
        updatedAt: WHEN,
        channel: "slack",
        intent: "replace",
        url: SLACK,
      });
      const other = await findAlertWebhookStatus(tx, OTHER);
      expect(other).toEqual({ slackSaved: false, discordSaved: false });
      expect(JSON.stringify(other)).not.toContain("secret-token");
      expect(await tx.select().from(alertWebhooks).where(eq(alertWebhooks.accountId, OTHER))).toEqual([]);
    });
  });

  it("refuses a plaintext URL in the table", async () => {
    await withRollback(async (tx) => {
      let caught: unknown;
      try {
        await tx.insert(alertWebhooks).values({
          accountId: ACCOUNT,
          slackWebhookUrl: SLACK,
          discordWebhookUrl: null,
          updatedAt: WHEN,
        });
      } catch (error) {
        caught = error;
      }
      expect(constraintName(caught)).toBe("alert_webhooks_urls_are_sealed");
    });
  });

  it("refuses a bad account id and writes nothing", async () => {
    await withRollback(async (tx) => {
      await expect(
        save(tx, {
          accountId: "ada@example.com",
          updatedAt: WHEN,
          channel: "slack",
          intent: "replace",
          url: SLACK,
        }),
      ).rejects.toThrow(FollowRefusal);
    });
  });

  function opened(sealed: string | null | undefined, channel: "slack" | "discord"): string | null {
    if (sealed == null) {
      return null;
    }
    return openWebhookUrl({ sealed, key: KEY, accountId: ACCOUNT, channel });
  }

  async function withRollback(run: (tx: AlertWebhookDb) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
        throw new RolledBack();
      });
    } catch (error) {
      if (error instanceof RolledBack) {
        return;
      }
      throw error;
    }
  }
});

class RolledBack extends Error {
  constructor() {
    super("alert webhook test rolled back");
    this.name = "RolledBack";
  }
}
