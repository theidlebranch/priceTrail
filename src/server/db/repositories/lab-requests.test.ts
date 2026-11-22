// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The database may already have labs. Assertions look at the lab this
 * test planted, not at an empty catalog.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/lab-requests.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LabRequestRefusal } from "@/core/labs/suggest-lab";
import { createDb } from "@/server/db/client";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import {
  decideLabRequest,
  listLabRequestsForAccount,
  listLabs,
  listPendingLabRequests,
  suggestLab,
  type LabRequestDb,
} from "@/server/db/repositories/lab-requests";
import { labs, requests, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const WHEN = new Date("2026-11-22T15:00:00.000Z");
const LATER = new Date("2026-11-22T16:00:00.000Z");

describe("suggestLab input checks", () => {
  it("refuses a blank name before it opens a transaction", async () => {
    await expect(
      suggestLab(untouchedDb(), {
        labName: "   ",
        suggestedBy: "google:123",
        suggestedAt: WHEN,
      }),
    ).rejects.toThrow(/lab name is empty/);
  });

  it("refuses an account id that is not google or github", async () => {
    await expect(
      suggestLab(untouchedDb(), {
        labName: "Mistral",
        suggestedBy: "seed",
        suggestedAt: WHEN,
      }),
    ).rejects.toThrow(LabRequestRefusal);
  });

  it("refuses a clock time that is not a real date", async () => {
    await expect(
      suggestLab(untouchedDb(), {
        labName: "Mistral",
        suggestedBy: "google:123",
        suggestedAt: new Date("not-a-date"),
      }),
    ).rejects.toThrow(/suggestedAt/);
  });
});

describe("decideLabRequest input checks", () => {
  it("refuses a blank note before it opens a transaction", async () => {
    await expect(
      decideLabRequest(untouchedDb(), {
        requestId: 1,
        decision: "decline",
        note: "  ",
        reviewedBy: "google:9",
        reviewedAt: WHEN,
      }),
    ).rejects.toThrow(/review note is empty/);
  });
});

describe.skipIf(databaseUrl.length === 0)("lab requests", () => {
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

  it("counts models for one lab and keeps a lab with none", async () => {
    await withRollback(async (tx) => {
      const catalog = createCatalogRepository(tx);
      const empty = await catalog.insertLab({ name: "Empty Lab", slug: uniqueSlug("empty") });
      const full = await catalog.insertLab({ name: "Full Lab", slug: uniqueSlug("full") });
      await catalog.insertModel({ labId: full.id, name: "One", slug: uniqueSlug("one") });
      await catalog.insertModel({ labId: full.id, name: "Two", slug: uniqueSlug("two") });

      const listed = await listLabs(tx);
      expect(listed.find((lab) => lab.slug === empty.slug)).toMatchObject({
        name: "Empty Lab",
        modelCount: 0,
      });
      expect(listed.find((lab) => lab.slug === full.slug)).toMatchObject({
        name: "Full Lab",
        modelCount: 2,
      });
      const emptyAt = listed.findIndex((lab) => lab.slug === empty.slug);
      const fullAt = listed.findIndex((lab) => lab.slug === full.slug);
      expect(emptyAt).toBeGreaterThanOrEqual(0);
      expect(fullAt).toBeGreaterThan(emptyAt);
    });
  });

  it("stores a suggestion and refuses a tracked name or a second pending copy", async () => {
    await withRollback(async (tx) => {
      const catalog = createCatalogRepository(tx);
      await catalog.insertLab({ name: "OpenAI", slug: uniqueSlug("openai") });
      const before = await tx.select({ id: requests.id }).from(requests);

      await expect(
        suggestLab(tx, { labName: " openai ", suggestedBy: "google:123", suggestedAt: WHEN }),
      ).rejects.toThrow(/already tracked/);
      expect(await tx.select({ id: requests.id }).from(requests)).toHaveLength(before.length);

      const inserted = await suggestLab(tx, {
        labName: "  Mistral AI ",
        suggestedBy: "google:123",
        suggestedAt: WHEN,
      });
      expect(inserted.id).toEqual(expect.any(Number));

      await expect(
        suggestLab(tx, {
          labName: "mistral ai",
          suggestedBy: "github:9",
          suggestedAt: LATER,
        }),
      ).rejects.toThrow(/already suggested/);

      const pending = await listPendingLabRequests(tx);
      const row = pending.find((entry) => entry.id === inserted.id);
      expect(row).toMatchObject({
        labName: "Mistral AI",
        suggestedBy: "google:123",
        status: "pending",
        reviewNote: null,
      });
    });
  });

  it("accepts a suggestion without adding a lab or a source", async () => {
    await withRollback(async (tx) => {
      const inserted = await suggestLab(tx, {
        labName: `Mistral ${uniqueSlug("name")}`,
        suggestedBy: "google:123",
        suggestedAt: WHEN,
      });
      const labsBefore = await tx.select({ id: labs.id }).from(labs);
      const sourcesBefore = await tx.select({ id: sources.id }).from(sources);

      await decideLabRequest(tx, {
        requestId: inserted.id,
        decision: "accept",
        note: "Worth a parser later.",
        reviewedBy: "github:9",
        reviewedAt: LATER,
      });

      expect(sortedIds(await tx.select({ id: labs.id }).from(labs))).toEqual(sortedIds(labsBefore));
      expect(sortedIds(await tx.select({ id: sources.id }).from(sources))).toEqual(
        sortedIds(sourcesBefore),
      );

      const pending = await listPendingLabRequests(tx);
      expect(pending.some((row) => row.id === inserted.id)).toBe(false);

      const mine = await listLabRequestsForAccount(tx, "google:123");
      expect(mine.find((row) => row.id === inserted.id)).toMatchObject({
        status: "accepted",
        reviewedBy: "github:9",
        reviewNote: "Worth a parser later.",
      });

      await expect(
        decideLabRequest(tx, {
          requestId: inserted.id,
          decision: "decline",
          note: "Changed my mind.",
          reviewedBy: "github:9",
          reviewedAt: LATER,
        }),
      ).rejects.toThrow(/not waiting/);

      const still = await tx
        .select({ status: requests.status, reviewNote: requests.reviewNote })
        .from(requests)
        .where(eq(requests.id, inserted.id));
      expect(still).toEqual([{ status: "accepted", reviewNote: "Worth a parser later." }]);
    });
  });

  it("declines a suggestion and leaves another account's rows out", async () => {
    await withRollback(async (tx) => {
      const mine = await suggestLab(tx, {
        labName: `Mine ${uniqueSlug("name")}`,
        suggestedBy: "google:123",
        suggestedAt: WHEN,
      });
      const theirs = await suggestLab(tx, {
        labName: `Theirs ${uniqueSlug("name")}`,
        suggestedBy: "github:9",
        suggestedAt: LATER,
      });

      await decideLabRequest(tx, {
        requestId: mine.id,
        decision: "decline",
        note: "Not a lab we will track.",
        reviewedBy: "google:reviewer",
        reviewedAt: LATER,
      });

      const listed = await listLabRequestsForAccount(tx, "google:123");
      expect(listed.some((row) => row.id === mine.id)).toBe(true);
      expect(listed.some((row) => row.id === theirs.id)).toBe(false);
      expect(listed.find((row) => row.id === mine.id)?.status).toBe("declined");
    });
  });

  async function withRollback(run: (tx: LabRequestDb) => Promise<void>): Promise<void> {
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

function untouchedDb(): LabRequestDb {
  return {
    transaction() {
      throw new Error("database opened");
    },
  } as unknown as LabRequestDb;
}

class RolledBack extends Error {
  constructor() {
    super("lab request test rolled back");
    this.name = "RolledBack";
  }
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function sortedIds(rows: { id: number }[]): number[] {
  return rows.map((row) => row.id).sort((left, right) => left - right);
}
