// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each test rolls its transaction back, so a passing run
 * leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/clear-same-price.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { SAME_PRICE_NOTE, SAME_PRICE_REVIEWER } from "@/core/review/confirm-price";
import { clearSamePriceFlags, planSamePriceClears } from "@/server/db/clear-same-price";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import {
  observationItems,
  observations,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const EARLIER = new Date("2026-06-02T16:00:00.000Z");
const LATER = new Date("2026-06-03T16:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("clearSamePriceFlags", () => {
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

  it("lists a matching item without writing, then confirms only that item", async () => {
    await withRollback(async (tx) => {
      const planted = await plantPair(tx);
      const before = await planSamePriceClears(tx);

      expect(before.clear).toContainEqual({
        id: planted.sameItemId,
        labSlug: planted.labSlug,
        modelSlug: planted.sameSlug,
        observationId: planted.laterObservationId,
      });
      expect(before.keep).toContainEqual({
        id: planted.changedItemId,
        labSlug: planted.labSlug,
        modelSlug: planted.changedSlug,
        observationId: planted.laterObservationId,
      });
      expect(await statusFor(tx, planted.sameItemId)).toBe("flagged");
      expect(await statusFor(tx, planted.changedItemId)).toBe("flagged");

      const after = await clearSamePriceFlags(tx);

      expect(after.clear.map((item) => item.id)).toContain(planted.sameItemId);
      expect(after.keep.map((item) => item.id)).toContain(planted.changedItemId);
      expect(await stampFor(tx, planted.sameItemId)).toEqual({
        reviewStatus: "confirmed",
        reviewedBy: SAME_PRICE_REVIEWER,
        reviewedAt: LATER,
        reviewNote: SAME_PRICE_NOTE,
      });
      expect(await statusFor(tx, planted.changedItemId)).toBe("flagged");
      expect(await priceCount(tx, planted.sameOfferingId)).toBe(1);
      expect(await priceCount(tx, planted.changedOfferingId)).toBe(1);
    });
  });

  async function withRollback(run: (tx: EvidenceDb) => Promise<void>): Promise<void> {
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
    super("clear same price test rolled back");
    this.name = "RolledBack";
  }
}

function priceRow(modelSlug: string, amount: string): NormalizedPrice {
  return {
    provider: "openai",
    modelName: "Example Model",
    modelSlug,
    dimension: "input",
    usdPer1M: amount,
    source: "official",
  };
}

async function plantPair(tx: EvidenceDb) {
  const catalog = createCatalogRepository(tx);
  const labSlug = `lab-${randomUUID()}`;
  const sameSlug = `same-${randomUUID()}`;
  const changedSlug = `changed-${randomUUID()}`;
  const lab = await catalog.insertLab({ name: "Example Lab", slug: labSlug });
  const sameModel = await catalog.insertModel({
    labId: lab.id,
    name: "Same Model",
    slug: sameSlug,
  });
  const changedModel = await catalog.insertModel({
    labId: lab.id,
    name: "Changed Model",
    slug: changedSlug,
  });
  const sameOffering = await catalog.insertOffering({
    modelId: sameModel.id,
    platform: "official-api",
  });
  const changedOffering = await catalog.insertOffering({
    modelId: changedModel.id,
    platform: "official-api",
  });
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({
        url: `https://example.test/pricing/${randomUUID()}`,
        type: "official",
      })
      .returning({ id: sources.id }),
    "insert source",
  );
  await insertObservation(tx, source.id, EARLIER, [priceRow(sameSlug, "1")]);
  const later = await insertObservation(tx, source.id, LATER, [
    priceRow(sameSlug, "1"),
    priceRow(changedSlug, "2"),
  ]);
  const sameItemId = await insertItem(tx, later, sameOffering.id);
  const changedItemId = await insertItem(tx, later, changedOffering.id);
  await insertOpenPrice(tx, sameOffering.id, "1");
  await insertOpenPrice(tx, changedOffering.id, "1");
  return {
    labSlug,
    sameSlug,
    changedSlug,
    sameItemId,
    changedItemId,
    sameOfferingId: sameOffering.id,
    changedOfferingId: changedOffering.id,
    laterObservationId: later,
  };
}

async function insertObservation(
  tx: EvidenceDb,
  sourceId: number,
  fetchedAt: Date,
  rows: NormalizedPrice[],
): Promise<number> {
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId,
        fetchedAt,
        contentHash: randomUUID(),
        rawContent: "pricing page",
        rawContentHash: randomUUID(),
        parsedData: { rows, warnings: [] },
      })
      .returning({ id: observations.id }),
    "insert observation",
  );
  return observation.id;
}

async function insertItem(tx: EvidenceDb, observationId: number, offeringId: number): Promise<number> {
  const item = requireInsertedRow(
    await tx
      .insert(observationItems)
      .values({
        observationId,
        offeringId,
        reviewStatus: "flagged",
      })
      .returning({ id: observationItems.id }),
    "insert observation item",
  );
  return item.id;
}

async function insertOpenPrice(tx: EvidenceDb, offeringId: number, amount: string): Promise<void> {
  const version = requireInsertedRow(
    await tx
      .insert(priceVersions)
      .values({ offeringId, firstSeenAt: EARLIER })
      .returning({ id: priceVersions.id }),
    "insert price version",
  );
  requireInsertedRow(
    await tx
      .insert(priceComponents)
      .values({
        priceVersionId: version.id,
        dimension: "input",
        unit: "usd_per_1m_tokens",
        amount,
      })
      .returning({ id: priceComponents.id }),
    "insert price component",
  );
}

async function statusFor(tx: EvidenceDb, itemId: number): Promise<string> {
  const stamp = await stampFor(tx, itemId);
  return stamp.reviewStatus;
}

async function stampFor(tx: EvidenceDb, itemId: number) {
  const rows = await tx
    .select({
      reviewStatus: observationItems.reviewStatus,
      reviewedBy: observationItems.reviewedBy,
      reviewedAt: observationItems.reviewedAt,
      reviewNote: observationItems.reviewNote,
    })
    .from(observationItems)
    .where(eq(observationItems.id, itemId));
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`observation item ${itemId} is missing`);
  }
  return row;
}

async function priceCount(tx: EvidenceDb, offeringId: number): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId));
  return rows.length;
}
