// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The database may already have flagged items. The assertions look at
 * the rows this test planted, not at an empty queue.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/review-queue.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import type { PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  countFlaggedReviewItems,
  findReviewItem,
  hasReviewItem,
  listFlaggedReviewItems,
} from "@/server/db/repositories/review-queue";
import { observationItems, observations, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const NEWER = new Date("2026-11-06T18:00:00.000Z");
const OLDER = new Date("2026-10-18T12:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("review queue reads", () => {
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

  it("lists official flagged items newest first and leaves the page text out", async () => {
    await withQueue(async (tx) => {
      const prefix = `https://example.test/review/${randomUUID()}`;
      const rawMarker = `SECRET-RAW-${randomUUID()}`;
      const parsedMarker = `SECRET-PARSED-${randomUUID()}`;
      const planted = await plantModel(tx);
      const newer = await plantItem(tx, planted.offeringId, `${prefix}/newer`, "official", "flagged", {
        fetchedAt: NEWER,
        rawMarker,
        parsedData: { rows: [], warnings: [parsedMarker] },
      });
      const older = await plantItem(tx, planted.offeringId, `${prefix}/older`, "official", "flagged", {
        fetchedAt: OLDER,
        rawMarker,
        parsedData: { marker: parsedMarker, usdPer1M: "999" },
        reviewNote: "older note",
      });
      const confirmed = await plantItem(
        tx,
        planted.offeringId,
        `${prefix}/confirmed`,
        "official",
        "confirmed",
        { fetchedAt: NEWER, rawMarker, parsedData: { marker: parsedMarker } },
      );
      const aggregator = await plantItem(
        tx,
        planted.offeringId,
        `${prefix}/aggregator`,
        "aggregator",
        "flagged",
        { fetchedAt: NEWER, rawMarker, parsedData: { marker: parsedMarker } },
      );

      const listed = (await listFlaggedReviewItems(tx)).filter((row) =>
        row.sourceUrl.startsWith(prefix),
      );

      expect(listed.map((row) => row.id)).toEqual([newer.id, older.id]);
      expect(listed.map((row) => row.id)).not.toContain(confirmed.id);
      expect(listed.map((row) => row.id)).not.toContain(aggregator.id);
      expect(listed[0]).toMatchObject({
        reviewStatus: "flagged",
        labName: "Anthropic",
        modelName: "Claude Mythos 5.1",
        sourceUrl: `${prefix}/newer`,
        fetchedAt: NEWER,
        reviewNote: null,
      });
      expect(listed[1]?.reviewNote).toBe("older note");
      const packed = JSON.stringify(listed);
      expect(packed).not.toContain(rawMarker);
      expect(packed).not.toContain(parsedMarker);
      expect(packed).not.toContain("999");
    });
  });

  it("counts official flagged items and skips confirmed and aggregator rows", async () => {
    await withQueue(async (tx) => {
      const before = await countFlaggedReviewItems(tx);
      const planted = await plantModel(tx);
      const prefix = `https://example.test/review/${randomUUID()}`;
      const rawMarker = `SECRET-RAW-${randomUUID()}`;
      await plantItem(tx, planted.offeringId, `${prefix}/one`, "official", "flagged", {
        fetchedAt: NEWER,
        rawMarker,
        parsedData: { rows: [], warnings: [] },
      });
      await plantItem(tx, planted.offeringId, `${prefix}/two`, "official", "flagged", {
        fetchedAt: OLDER,
        rawMarker,
        parsedData: { rows: [], warnings: [] },
      });
      await plantItem(tx, planted.offeringId, `${prefix}/confirmed`, "official", "confirmed", {
        fetchedAt: NEWER,
        rawMarker,
        parsedData: { rows: [], warnings: [] },
      });
      await plantItem(tx, planted.offeringId, `${prefix}/aggregator`, "aggregator", "flagged", {
        fetchedAt: NEWER,
        rawMarker,
        parsedData: { rows: [], warnings: [] },
      });

      expect(await countFlaggedReviewItems(tx)).toBe(before + 2);
    });
  });

  it("reads one item, including a finished stamp, and still skips the page text", async () => {
    await withQueue(async (tx) => {
      const rawMarker = `SECRET-RAW-${randomUUID()}`;
      const parsedMarker = `SECRET-PARSED-${randomUUID()}`;
      const planted = await plantModel(tx);
      const item = await plantItem(
        tx,
        planted.offeringId,
        `https://example.test/review/${randomUUID()}`,
        "official",
        "rejected",
        {
          fetchedAt: OLDER,
          rawMarker,
          parsedData: { rows: [{ usdPer1M: parsedMarker }], warnings: [] },
          reviewedBy: "google:123",
          reviewedAt: NEWER,
          reviewNote: "Not on the page.",
        },
      );

      expect(await hasReviewItem(tx, item.id)).toBe(true);
      expect(await hasReviewItem(tx, 9_007_199_254_740_991)).toBe(false);
      expect(await findReviewItem(tx, 9_007_199_254_740_991)).toBeNull();

      const detail = await findReviewItem(tx, item.id);
      expect(detail).toMatchObject({
        id: item.id,
        reviewStatus: "rejected",
        modelSlug: planted.modelSlug,
        sourceType: "official",
        fetchedAt: OLDER,
        reviewedBy: "google:123",
        reviewedAt: NEWER,
        reviewNote: "Not on the page.",
        groundingResult: null,
        parsedData: { rows: [{ usdPer1M: parsedMarker }], warnings: [] },
      });
      expect(JSON.stringify(detail)).not.toContain(rawMarker);
    });
  });

  async function withQueue(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("review queue test rolled back");
    this.name = "RolledBack";
  }
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function plantModel(tx: PublishDb) {
  const catalog = createCatalogRepository(tx);
  const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
  const model = await catalog.insertModel({
    labId: lab.id,
    name: "Claude Mythos 5.1",
    slug: uniqueSlug("model"),
  });
  const offering = await catalog.insertOffering({
    modelId: model.id,
    platform: "official-api",
  });
  return { modelSlug: model.slug, offeringId: offering.id };
}

async function plantItem(
  tx: PublishDb,
  offeringId: number,
  url: string,
  type: "official" | "aggregator",
  reviewStatus: "flagged" | "confirmed" | "rejected",
  input: {
    fetchedAt: Date;
    rawMarker: string;
    parsedData: unknown;
    reviewNote?: string;
    reviewedBy?: string;
    reviewedAt?: Date;
  },
): Promise<{ id: number }> {
  const source = requireInsertedRow(
    await tx.insert(sources).values({ url, type }).returning(),
    "insert source",
  );
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: input.fetchedAt,
        contentHash: uniqueSlug("content"),
        rawContent: input.rawMarker,
        rawContentHash: uniqueSlug("raw"),
        parsedData: input.parsedData,
      })
      .returning(),
    "insert observation",
  );
  return requireInsertedRow(
    await tx
      .insert(observationItems)
      .values({
        observationId: observation.id,
        offeringId,
        reviewStatus,
        reviewNote: input.reviewNote,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewedAt,
      })
      .returning({ id: observationItems.id }),
    "insert observation item",
  );
}
