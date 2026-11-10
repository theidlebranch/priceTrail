// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each test rolls its transaction back, so a passing run
 * leaves no rows.
 *
 * A test passes its own lab slug and URL. The real slug is "google".
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/requeue-google.test.ts
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { GOOGLE_CATALOG_SLUGS, plantGoogleCatalog } from "@/server/db/google-catalog";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import { requeueGoogleOfferingsWithoutPrice } from "@/server/db/requeue-google";
import {
  observationItems,
  observations,
  priceVersions,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const STORED_AT = new Date("2026-11-06T14:04:00.000Z");
const REQUEUE_AT = new Date("2026-11-10T20:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("requeueGoogleOfferingsWithoutPrice", () => {
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

  it("flags offerings that have no open price and does not publish", async () => {
    await withRequeue(async (tx) => {
      const planted = await plantRejectedSnapshot(tx);

      const result = await requeueGoogleOfferingsWithoutPrice(tx, {
        fetchedAt: REQUEUE_AT,
        labSlug: planted.labSlug,
        sourceUrl: planted.sourceUrl,
      });

      expect(result.offeringIds).toEqual(planted.offeringIds);
      expect(result.observationId).not.toBe(planted.observationId);
      const copied = await tx
        .select()
        .from(observations)
        .where(eq(observations.id, result.observationId));
      expect(copied).toHaveLength(1);
      expect(copied[0]).toMatchObject({
        contentHash: "hash-stored",
        rawContent: "stored page",
        parsedData: { rows: [], warnings: [] },
        archiveStatus: "failed",
        archiveUrl: null,
      });
      const flagged = await tx
        .select({ offeringId: observationItems.offeringId })
        .from(observationItems)
        .where(
          and(
            eq(observationItems.observationId, result.observationId),
            eq(observationItems.reviewStatus, "flagged"),
          ),
        );
      expect(flagged.map((row) => row.offeringId).sort()).toEqual([...planted.offeringIds].sort());
      expect(await priceCount(tx, planted.offeringIds)).toBe(0);

      await expect(
        requeueGoogleOfferingsWithoutPrice(tx, {
          fetchedAt: new Date("2026-11-10T21:00:00.000Z"),
          labSlug: planted.labSlug,
          sourceUrl: planted.sourceUrl,
        }),
      ).rejects.toThrow(/no Google offering is waiting to be requeued/);
    });
  });

  it("skips an offering that already has an open price", async () => {
    await withRequeue(async (tx) => {
      const planted = await plantRejectedSnapshot(tx);
      const priced = planted.offeringIds[2];
      if (priced === undefined) {
        throw new Error("expected the third Google offering");
      }
      const confirmedRows = await tx
        .update(observationItems)
        .set({ reviewStatus: "confirmed" })
        .where(
          and(
            eq(observationItems.observationId, planted.observationId),
            eq(observationItems.offeringId, priced),
          ),
        )
        .returning({ id: observationItems.id });
      const confirmed = confirmedRows[0];
      if (confirmed === undefined) {
        throw new Error("expected the priced offering's item");
      }
      await publishPriceVersion(tx, {
        observationItemId: confirmed.id,
        firstSeenAt: STORED_AT,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "1.25" }],
      });

      const result = await requeueGoogleOfferingsWithoutPrice(tx, {
        fetchedAt: REQUEUE_AT,
        labSlug: planted.labSlug,
        sourceUrl: planted.sourceUrl,
      });

      expect(result.offeringIds).toEqual(planted.offeringIds.slice(0, 2));
      expect(result.offeringIds).not.toContain(priced);
      expect(await priceCount(tx, planted.offeringIds)).toBe(1);
    });
  });

  it("throws when the new time is not after the stored snapshot", async () => {
    await withRequeue(async (tx) => {
      const planted = await plantRejectedSnapshot(tx);

      await expect(
        requeueGoogleOfferingsWithoutPrice(tx, {
          fetchedAt: STORED_AT,
          labSlug: planted.labSlug,
          sourceUrl: planted.sourceUrl,
        }),
      ).rejects.toThrow(/after the latest stored snapshot/);
      const rows = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(rows).toHaveLength(1);
    });
  });

  async function withRequeue(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("google requeue test rolled back");
    this.name = "RolledBack";
  }
}

async function plantRejectedSnapshot(tx: PublishDb) {
  const id = randomUUID();
  const planted = {
    labSlug: `google-${id}`,
    sourceUrl: `https://example.test/google-pricing/${id}`,
  };
  const catalog = await plantGoogleCatalog(tx, planted);
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: catalog.sourceId,
        fetchedAt: STORED_AT,
        contentHash: "hash-stored",
        rawContent: "stored page",
        rawContentHash: "hash-raw",
        parsedData: { rows: [], warnings: [] },
        archiveStatus: "failed",
        archiveUrl: null,
      })
      .returning({ id: observations.id }),
    "insert stored observation",
  );
  for (const offeringId of catalog.offeringIds) {
    requireInsertedRow(
      await tx
        .insert(observationItems)
        .values({
          observationId: observation.id,
          offeringId,
          reviewStatus: "rejected",
        })
        .returning({ id: observationItems.id }),
      "insert rejected item",
    );
  }
  expect(GOOGLE_CATALOG_SLUGS).toHaveLength(catalog.offeringIds.length);
  return {
    ...planted,
    sourceId: catalog.sourceId,
    offeringIds: catalog.offeringIds,
    observationId: observation.id,
  };
}

async function priceCount(tx: PublishDb, offeringIds: number[]): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(inArray(priceVersions.offeringId, offeringIds));
  return rows.length;
}
