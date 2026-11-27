// @vitest-environment node

/**
 * The database cases talk to Neon. They skip when DATABASE_URL is missing.
 * Each one rolls its transaction back. The post cases use a fake fetch.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/alerts/follow-alerts.test.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { postSlackAlert } from "@/server/alerts/post-slack-alert";
import {
  deliveriesAfterPublish,
  postFollowAlerts,
  type FollowAlertDelivery,
} from "@/server/alerts/follow-alerts";
import { openWebhookUrl, sealWebhookUrl } from "@/server/alerts/webhook-seal";
import { createDb } from "@/server/db/client";
import { saveAlertWebhook, type AlertWebhookDb } from "@/server/db/repositories/alert-webhooks";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { followTarget } from "@/server/db/repositories/follows";
import { parseDatabaseEnv } from "@/server/env";
import type { FetchLike } from "@/server/sources/provider-source";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const WHEN = new Date("2026-11-27T12:10:00.000Z");
const SLACK = "https://hooks.slack.com/services/T/B/follower-token";
const DISCORD = "https://discord.com/api/webhooks/123/follower-token";
const SITE = "https://hooks.slack.com/services/T/B/site-token";
const LINE = "Anthropic: claude-fable-5-1 has a new published price.";
const KEY = Buffer.alloc(32, 7);
const ACCOUNT = "google:1";

function sealed(url: string, channel: "slack" | "discord", accountId = ACCOUNT): string {
  return sealWebhookUrl({ url, key: KEY, accountId, channel });
}

describe("postFollowAlerts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the published-price line to each saved URL and skips a missing channel", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("ok", { status: 200 }));
    const delivery: FollowAlertDelivery = {
      accountId: ACCOUNT,
      slackSealed: sealed(SLACK, "slack"),
      discordSealed: null,
      line: LINE,
    };

    await postFollowAlerts({ deliveries: [delivery], fetchImpl, key: KEY });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(SLACK);
    expect(JSON.parse(String(init?.body))).toEqual({ text: LINE });
  });

  it("posts Slack and Discord for one person, and keeps the site-wide URL separate", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));
    await postSlackAlert({
      events: [{ kind: "price_published", lab: "anthropic", model: "claude-fable-5-1" }],
      env: { SLACK_WEBHOOK_URL: SITE },
      fetchImpl,
    });
    await postFollowAlerts({
      deliveries: [
        {
          accountId: ACCOUNT,
          slackSealed: sealed(SLACK, "slack"),
          discordSealed: sealed(DISCORD, "discord"),
          line: LINE,
        },
      ],
      fetchImpl,
      key: KEY,
    });

    const urls = fetchImpl.mock.calls.map((call) => String(call[0])).sort();
    expect(urls).toEqual([DISCORD, SITE, SLACK].sort());
    const followerBodies = fetchImpl.mock.calls
      .filter((call) => String(call[0]) !== SITE)
      .map((call) => JSON.parse(String(call[1]?.body)));
    expect(followerBodies).toEqual(expect.arrayContaining([{ text: LINE }, { content: LINE }]));
  });

  it("logs a thrown fetch without throwing or printing the webhook URL", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      throw new Error(`connect failed for ${String(url)}`);
    });

    await expect(
      postFollowAlerts({
        deliveries: [
          {
            accountId: ACCOUNT,
            slackSealed: sealed(SLACK, "slack"),
            discordSealed: sealed(DISCORD, "discord"),
            line: LINE,
          },
        ],
        fetchImpl,
        key: KEY,
      }),
    ).resolves.toBeUndefined();

    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("post failed");
    expect(logged).not.toContain("follower-token");
    expect(logged).not.toContain(SLACK);
    expect(logged).not.toContain(DISCORD);
  });

  it("does not fetch when there is no delivery or the stored URL is not allowed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>();

    await postFollowAlerts({ deliveries: [], fetchImpl, key: KEY });
    await postFollowAlerts({
      deliveries: [
        {
          accountId: ACCOUNT,
          slackSealed: sealed("https://evil.example/hook-secret-zzz", "slack"),
          discordSealed: null,
          line: LINE,
        },
      ],
      fetchImpl,
      key: KEY,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toBe("Slack webhook URL was ignored");
    expect(errorSpy.mock.calls.join(" ")).not.toContain("hook-secret-zzz");
  });

  it("does not fetch or print a tampered seal", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>();
    const packed = Buffer.from(sealed(SLACK, "slack").slice("v1.".length), "base64");
    packed[packed.length - 1] ^= 0x01;
    const tampered = `v1.${packed.toString("base64")}`;

    await postFollowAlerts({
      deliveries: [{ accountId: ACCOUNT, slackSealed: tampered, discordSealed: null, line: LINE }],
      fetchImpl,
      key: KEY,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toBe("Slack webhook could not be opened");
    expect(logged).not.toContain("follower-token");
    expect(logged).not.toContain(tampered);
  });

  it("skips the post when the key is missing and does not print the seal", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>();
    const slackSealed = sealed(SLACK, "slack");

    await postFollowAlerts({
      deliveries: [{ accountId: ACCOUNT, slackSealed, discordSealed: null, line: LINE }],
      fetchImpl,
      key: null,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toBe("ALERT_WEBHOOK_KEY is missing or not 32 bytes.");
    expect(logged).not.toContain("follower-token");
    expect(logged).not.toContain(slackSealed);
  });

  it("posts follower webhooks only after confirm or add and publish", () => {
    const visit = readFileSync("src/server/pipeline/scheduled-visit.ts", "utf8");
    const drain = readFileSync("src/server/pipeline/run-pending-triggers.ts", "utf8");
    const confirm = readFileSync("src/app/review/decide-review-action.ts", "utf8");
    const publish = readFileSync("src/app/review/publish-candidate-action.ts", "utf8");
    expect(visit).not.toContain("postFollowAlerts");
    expect(visit).not.toContain("deliveriesAfterPublish");
    expect(drain).not.toContain("postFollowAlerts");
    expect(drain).not.toContain("deliveriesAfterPublish");
    expect(confirm).toContain("deliveriesAfterPublish");
    expect(confirm).toContain("postFollowAlerts");
    expect(publish).toContain("deliveriesAfterPublish");
    expect(publish).toContain("postFollowAlerts");
  });
});

describe.skipIf(databaseUrl.length === 0)("deliveriesAfterPublish", () => {
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

  it("returns nothing when the confirm did not publish, and does not look up a model", async () => {
    await withRollback(async (tx) => {
      await expect(
        deliveriesAfterPublish(tx, {
          published: false,
          labSlug: "missing-lab",
          modelSlug: "missing-model",
        }),
      ).resolves.toEqual([]);
    });
  });

  it("returns one delivery for a lab follow and a model follow, including a person who follows both", async () => {
    await withRollback(async (tx) => {
      const planted = await plant(tx);
      const both = planted.account;
      const modelOnly = `google:model-${randomUUID()}`;
      const outsider = `google:out-${randomUUID()}`;
      const quiet = `google:quiet-${randomUUID()}`;

      await followTarget(tx, {
        accountId: both,
        kind: "lab",
        labId: planted.labId,
        followedAt: WHEN,
      });
      await followTarget(tx, {
        accountId: both,
        kind: "model",
        modelId: planted.modelId,
        followedAt: WHEN,
      });
      await followTarget(tx, {
        accountId: modelOnly,
        kind: "model",
        modelId: planted.modelId,
        followedAt: WHEN,
      });
      await followTarget(tx, {
        accountId: outsider,
        kind: "model",
        modelId: planted.otherModelId,
        followedAt: WHEN,
      });
      await followTarget(tx, {
        accountId: quiet,
        kind: "lab",
        labId: planted.labId,
        followedAt: WHEN,
      });

      await saveAlertWebhook(
        tx,
        {
          accountId: both,
          updatedAt: WHEN,
          channel: "slack",
          intent: "replace",
          url: SLACK,
        },
        KEY,
      );
      await saveAlertWebhook(
        tx,
        {
          accountId: both,
          updatedAt: WHEN,
          channel: "discord",
          intent: "replace",
          url: DISCORD,
        },
        KEY,
      );
      await saveAlertWebhook(
        tx,
        {
          accountId: modelOnly,
          updatedAt: WHEN,
          channel: "discord",
          intent: "replace",
          url: "https://discordapp.com/api/webhooks/9/other-token",
        },
        KEY,
      );
      await saveAlertWebhook(
        tx,
        {
          accountId: outsider,
          updatedAt: WHEN,
          channel: "slack",
          intent: "replace",
          url: "https://hooks.slack.com/services/T/B/outsider-token",
        },
        KEY,
      );

      const deliveries = await deliveriesAfterPublish(tx, {
        published: true,
        labSlug: planted.labSlug,
        modelSlug: planted.modelSlug,
      });

      const line = `${planted.labSlug}: ${planted.modelSlug} has a new published price.`;
      const opened = deliveries
        .map((delivery) => ({
          accountId: delivery.accountId,
          slackUrl:
            delivery.slackSealed == null
              ? null
              : openWebhookUrl({
                  sealed: delivery.slackSealed,
                  key: KEY,
                  accountId: delivery.accountId,
                  channel: "slack",
                }),
          discordUrl:
            delivery.discordSealed == null
              ? null
              : openWebhookUrl({
                  sealed: delivery.discordSealed,
                  key: KEY,
                  accountId: delivery.accountId,
                  channel: "discord",
                }),
          line: delivery.line,
        }))
        .sort((left, right) => left.accountId.localeCompare(right.accountId));
      expect(opened).toEqual(
        [
          {
            accountId: both,
            slackUrl: SLACK,
            discordUrl: DISCORD,
            line,
          },
          {
            accountId: modelOnly,
            slackUrl: null,
            discordUrl: "https://discordapp.com/api/webhooks/9/other-token",
            line,
          },
        ].sort((left, right) => left.accountId.localeCompare(right.accountId)),
      );
      const stored = JSON.stringify(deliveries);
      expect(stored).not.toContain("follower-token");
      expect(stored).not.toContain("other-token");
      expect(stored).not.toContain("hooks.slack.com");
      expect(stored).not.toContain("discord.com");
    });
  });

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

async function plant(tx: AlertWebhookDb): Promise<{
  account: string;
  labId: number;
  labSlug: string;
  modelId: number;
  modelSlug: string;
  otherModelId: number;
}> {
  const catalog = createCatalogRepository(tx);
  const labSlug = "openai";
  const modelSlug = `gpt-${randomUUID()}`;
  const lab = await catalog.insertLab({ name: "OpenAI", slug: `${labSlug}-${randomUUID()}` });
  const model = await catalog.insertModel({ labId: lab.id, name: "Published", slug: modelSlug });
  const other = await catalog.insertModel({
    labId: lab.id,
    name: "Other",
    slug: `other-${randomUUID()}`,
  });
  return {
    account: `google:both-${randomUUID()}`,
    labId: lab.id,
    labSlug: lab.slug,
    modelId: model.id,
    modelSlug: model.slug,
    otherModelId: other.id,
  };
}

class RolledBack extends Error {
  constructor() {
    super("follow alert test rolled back");
    this.name = "RolledBack";
  }
}
