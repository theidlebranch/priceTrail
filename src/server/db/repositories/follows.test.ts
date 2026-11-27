// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/follows.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { FollowRefusal } from "@/core/follows/follow";
import { createDb } from "@/server/db/client";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { followTarget, listFollows, unfollowTarget, type FollowDb } from "@/server/db/repositories/follows";
import { follows, models } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const WHEN = new Date("2026-11-27T12:00:00.000Z");
const LATER = new Date("2026-11-27T12:05:00.000Z");
const ACCOUNT = "google:follow-test";
const OTHER = "github:424242";

describe.skipIf(databaseUrl.length === 0)("follows", () => {
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

  it("follows a model once and leaves the lab id empty", async () => {
    await withRollback(async (tx) => {
      const planted = await plantCatalog(tx);
      const first = await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
        followedAt: WHEN,
      });
      const second = await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
        followedAt: LATER,
      });

      expect(second).toEqual({ id: first.id, followedAt: WHEN, alreadyFollowed: true });
      const stored = await tx.select().from(follows).where(eq(follows.accountId, ACCOUNT));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        kind: "model",
        modelId: planted.modelId,
        labId: null,
        followedAt: WHEN,
      });
    });
  });

  it("follows a lab once and leaves the model id empty", async () => {
    await withRollback(async (tx) => {
      const planted = await plantCatalog(tx);
      const first = await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "lab",
        labId: planted.labId,
        followedAt: WHEN,
      });
      const second = await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "lab",
        labId: planted.labId,
        followedAt: LATER,
      });

      expect(second.alreadyFollowed).toBe(true);
      expect(second.followedAt).toEqual(WHEN);
      expect(second.id).toBe(first.id);
      const stored = await tx.select().from(follows).where(eq(follows.labId, planted.labId));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ kind: "lab", modelId: null, labId: planted.labId });
    });
  });

  it("removes a follow and does nothing the second time", async () => {
    await withRollback(async (tx) => {
      const planted = await plantCatalog(tx);
      await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
        followedAt: WHEN,
      });

      const removed = await unfollowTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
      });
      const again = await unfollowTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
      });

      expect(removed).toEqual({ removed: true });
      expect(again).toEqual({ removed: false });
      expect(await listFollows(tx, ACCOUNT)).toEqual([]);
    });
  });

  it("keeps a retired model on the list and hides another account", async () => {
    await withRollback(async (tx) => {
      const planted = await plantCatalog(tx);
      await tx.update(models).set({ deprecatedAt: WHEN }).where(eq(models.id, planted.modelId));
      await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "model",
        modelId: planted.modelId,
        followedAt: WHEN,
      });
      await followTarget(tx, {
        accountId: ACCOUNT,
        kind: "lab",
        labId: planted.labId,
        followedAt: LATER,
      });
      await followTarget(tx, {
        accountId: OTHER,
        kind: "lab",
        labId: planted.labId,
        followedAt: LATER,
      });

      const listed = await listFollows(tx, ACCOUNT);
      expect(listed.map((row) => row.kind)).toEqual(["lab", "model"]);
      expect(listed[1]).toMatchObject({
        kind: "model",
        name: planted.modelName,
        retired: true,
        labSlug: planted.labSlug,
        modelSlug: planted.modelSlug,
      });
      expect(listed.some((row) => row.followedAt.getTime() === LATER.getTime() && row.kind === "lab")).toBe(
        true,
      );
      const other = await listFollows(tx, OTHER);
      expect(other).toHaveLength(1);
      expect(other[0]?.kind).toBe("lab");
    });
  });

  it("refuses a bad account id and an unknown model or lab", async () => {
    await withRollback(async (tx) => {
      await expect(
        followTarget(tx, { accountId: "ada@example.com", kind: "model", modelId: 1, followedAt: WHEN }),
      ).rejects.toThrow(FollowRefusal);
      await expect(
        followTarget(tx, { accountId: ACCOUNT, kind: "model", modelId: 9_000_000_000, followedAt: WHEN }),
      ).rejects.toThrow(/that model is not tracked/);
      await expect(
        followTarget(tx, { accountId: ACCOUNT, kind: "lab", labId: 9_000_000_000, followedAt: WHEN }),
      ).rejects.toThrow(/that lab is not tracked/);
      expect(await listFollows(tx, ACCOUNT)).toEqual([]);
    });
  });

  async function withRollback(run: (tx: FollowDb) => Promise<void>): Promise<void> {
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

async function plantCatalog(tx: FollowDb): Promise<{
  labId: number;
  labSlug: string;
  modelId: number;
  modelName: string;
  modelSlug: string;
}> {
  const catalog = createCatalogRepository(tx);
  const labSlug = uniqueSlug("lab");
  const modelSlug = uniqueSlug("model");
  const lab = await catalog.insertLab({ name: "Follow Lab", slug: labSlug });
  const model = await catalog.insertModel({ labId: lab.id, name: "Follow Model", slug: modelSlug });
  return { labId: lab.id, labSlug, modelId: model.id, modelName: model.name, modelSlug };
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

class RolledBack extends Error {
  constructor() {
    super("follow test rolled back");
    this.name = "RolledBack";
  }
}
