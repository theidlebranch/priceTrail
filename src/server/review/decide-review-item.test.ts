// @vitest-environment node

/**
 * A blank note, a bad reviewer id, and a bad time throw before any query.
 * Those tests use a stand-in database. The writes talk to Neon and skip
 * when DATABASE_URL is missing, which is what CI does. Each database test
 * rolls its transaction back, so a passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/review/decide-review-item.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  fetchLog,
  observationItems,
  observations,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { decideReviewItem, type DecideReviewItemInput } from "@/server/review/decide-review-item";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const T0 = new Date("2026-10-18T12:00:00.000Z");
const T1 = new Date("2026-11-01T00:00:00.000Z");
const T2 = new Date("2026-11-03T00:00:00.000Z");
const T3 = new Date("2026-11-04T00:00:00.000Z");
const T4 = new Date("2026-11-06T18:00:00.000Z");
const REVIEWED_AT = new Date("2026-11-06T19:00:00.000Z");

describe("decideReviewItem input checks", () => {
  it("throws when the note is blank and does not open a transaction", async () => {
    await expect(
      decideReviewItem(untouchedDb(), decision(1, "confirm", "   ")),
    ).rejects.toThrow(/review note is empty/);
  });

  it("throws when reviewed_by is not a reviewer id", async () => {
    await expect(
      decideReviewItem(untouchedDb(), { ...decision(1, "reject"), reviewedBy: "seed" }),
    ).rejects.toThrow(/reviewed_by/);
  });

  it("throws when reviewedAt is not a real time", async () => {
    await expect(
      decideReviewItem(untouchedDb(), {
        ...decision(1, "confirm"),
        reviewedAt: new Date("not-a-date"),
      }),
    ).rejects.toThrow(/reviewedAt/);
  });
});

describe.skipIf(databaseUrl.length === 0)("decideReviewItem", () => {
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

  it("publishes the first price and stamps the reviewer", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "3",
        reviewStatus: "flagged",
      });

      const result = await decideReviewItem(tx, decision(item.id, "confirm"));

      expect(result).toEqual({ decision: "confirmed", published: true, priceVersionId: expect.any(Number) });
      const versions = await versionsFor(tx, planted.offeringId);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        firstSeenAt: T4,
        lastSeenAt: null,
        announcedOn: null,
        retractedAt: null,
      });
      expect(await amountsFor(tx, versions[0].id)).toEqual([
        { dimension: "input", amount: "3", condition: {} },
      ]);
      expect(await stampFor(tx, item.id)).toMatchObject({
        reviewStatus: "confirmed",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
        reviewNote: "Checked the table.",
      });
    });
  });

  it("rejects a snapshot that is not a price list and publishes nothing", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        parsedData: { example: "pending-review", usdPer1M: "999" },
        reviewStatus: "flagged",
      });

      const result = await decideReviewItem(tx, decision(item.id, "reject", "Not a price list."));

      expect(result).toEqual({ decision: "rejected" });
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
      expect(await stampFor(tx, item.id)).toMatchObject({
        reviewStatus: "rejected",
        reviewNote: "Not a price list.",
      });
    });
  });

  it("does not publish when confirm is given a snapshot that is not a price list", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        parsedData: { example: "pending-review", usdPer1M: "999" },
        reviewStatus: "flagged",
      });

      await expect(decideReviewItem(tx, decision(item.id, "confirm"))).rejects.toThrow(
        /not a parsed price list/,
      );
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
      expect((await stampFor(tx, item.id)).reviewStatus).toBe("flagged");
    });
  });

  it("closes the open price at the last unchanged check that still showed it", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const original = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "10",
        reviewStatus: "confirmed",
      });
      await publishPriceVersion(tx, {
        observationItemId: original.id,
        firstSeenAt: T0,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "10" }],
      });
      await plantUnchanged(tx, sourceId, T1);
      const next = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "12",
        reviewStatus: "flagged",
      });

      const result = await decideReviewItem(tx, decision(next.id, "confirm"));

      expect(result).toMatchObject({ decision: "confirmed", published: true });
      const versions = await versionsFor(tx, planted.offeringId);
      expect(versions).toHaveLength(2);
      expect(versions[0]).toMatchObject({ firstSeenAt: T0, lastSeenAt: T1, announcedOn: null });
      expect(versions[1]).toMatchObject({ firstSeenAt: T4, lastSeenAt: null, announcedOn: null });
      expect(await amountsFor(tx, versions[1].id)).toEqual([
        { dimension: "input", amount: "12", condition: {} },
      ]);
    });
  });

  it("ignores an unchanged check that came after a different snapshot", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const original = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "10",
        reviewStatus: "confirmed",
      });
      await publishPriceVersion(tx, {
        observationItemId: original.id,
        firstSeenAt: T0,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "10" }],
      });
      await plantUnchanged(tx, sourceId, T1);
      await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T2,
        amount: "11",
        reviewStatus: "rejected",
      });
      await plantUnchanged(tx, sourceId, T3);
      const next = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "12",
        reviewStatus: "flagged",
      });

      await decideReviewItem(tx, decision(next.id, "confirm"));

      const versions = await versionsFor(tx, planted.offeringId);
      expect(versions[0]?.lastSeenAt).toEqual(T1);
      expect(versions[1]?.firstSeenAt).toEqual(T4);
    });
  });

  it("stamps a matching price without opening another period", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const original = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "10",
        reviewStatus: "confirmed",
      });
      await publishPriceVersion(tx, {
        observationItemId: original.id,
        firstSeenAt: T0,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "10" }],
      });
      const next = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "10.0",
        reviewStatus: "flagged",
      });

      const result = await decideReviewItem(tx, decision(next.id, "confirm"));

      expect(result).toEqual({ decision: "confirmed", published: false });
      const versions = await versionsFor(tx, planted.offeringId);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ lastSeenAt: null, retractedAt: null });
      expect((await stampFor(tx, next.id)).reviewStatus).toBe("confirmed");
    });
  });

  it("throws when no earlier snapshot matches the open price", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const original = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "4",
        reviewStatus: "confirmed",
      });
      await publishPriceVersion(tx, {
        observationItemId: original.id,
        firstSeenAt: T0,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "10" }],
      });
      const next = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "12",
        reviewStatus: "flagged",
      });

      await expect(decideReviewItem(tx, decision(next.id, "confirm"))).rejects.toThrow(
        /no earlier snapshot matches the open price/,
      );
      const versions = await versionsFor(tx, planted.offeringId);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.lastSeenAt).toBeNull();
      expect((await stampFor(tx, next.id)).reviewStatus).toBe("flagged");
    });
  });

  it("throws when the parsed rows include a schedule and stays flagged", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "2",
        validFrom: "2026-12-01",
        reviewStatus: "flagged",
      });

      await expect(decideReviewItem(tx, decision(item.id, "confirm"))).rejects.toThrow(/schedule/);
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
      expect((await stampFor(tx, item.id)).reviewStatus).toBe("flagged");
    });
  });

  it("throws when an earlier flagged item for this offering is still waiting", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "10",
        reviewStatus: "flagged",
      });
      const later = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "12",
        reviewStatus: "flagged",
      });

      await expect(decideReviewItem(tx, decision(later.id, "confirm"))).rejects.toThrow(
        /earlier flagged item/,
      );
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
      expect((await stampFor(tx, later.id)).reviewStatus).toBe("flagged");
    });
  });

  it("still rejects a later item while an earlier one is waiting", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const earlier = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T0,
        amount: "10",
        reviewStatus: "flagged",
      });
      const later = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "12",
        reviewStatus: "flagged",
      });

      await decideReviewItem(tx, decision(later.id, "reject"));

      expect((await stampFor(tx, later.id)).reviewStatus).toBe("rejected");
      expect((await stampFor(tx, earlier.id)).reviewStatus).toBe("flagged");
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
    });
  });

  it("throws when the same item is confirmed twice", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "3",
        reviewStatus: "flagged",
      });

      await decideReviewItem(tx, decision(item.id, "confirm"));
      await expect(decideReviewItem(tx, decision(item.id, "confirm", "Again."))).rejects.toThrow(
        /only flagged/,
      );
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(1);
    });
  });

  it("throws when the source is not official", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "aggregator");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "3",
        reviewStatus: "flagged",
      });

      await expect(decideReviewItem(tx, decision(item.id, "confirm"))).rejects.toThrow(/official/);
      expect((await stampFor(tx, item.id)).reviewStatus).toBe("flagged");
      expect(await versionsFor(tx, planted.offeringId)).toHaveLength(0);
    });
  });

  it("throws when a cell-check result is stored", async () => {
    await withDecision(async (tx) => {
      const planted = await plantCatalog(tx);
      const sourceId = await plantSource(tx, "official");
      const item = await plantItem(tx, {
        sourceId,
        offeringId: planted.offeringId,
        modelSlug: planted.modelSlug,
        fetchedAt: T4,
        amount: "3",
        reviewStatus: "flagged",
        groundingResult: { matched: true },
      });

      await expect(decideReviewItem(tx, decision(item.id, "confirm"))).rejects.toThrow(
        /grounding_result/,
      );
      expect((await stampFor(tx, item.id)).reviewStatus).toBe("flagged");
    });
  });

  async function withDecision(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("review decision test rolled back");
    this.name = "RolledBack";
  }
}

function untouchedDb(): PublishDb {
  return {
    transaction: () => {
      throw new Error("decideReviewItem touched the database");
    },
  } as unknown as PublishDb;
}

function decision(
  observationItemId: number,
  choice: DecideReviewItemInput["decision"],
  note = "Checked the table.",
): DecideReviewItemInput {
  return {
    observationItemId,
    decision: choice,
    note,
    reviewedBy: "google:reviewer1",
    reviewedAt: REVIEWED_AT,
  };
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function plantCatalog(tx: PublishDb) {
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

async function plantSource(tx: PublishDb, type: "official" | "aggregator"): Promise<number> {
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url: `https://example.test/review/${randomUUID()}`, type })
      .returning({ id: sources.id }),
    "insert source",
  );
  return source.id;
}

async function plantItem(
  tx: PublishDb,
  input: {
    sourceId: number;
    offeringId: number;
    modelSlug: string;
    fetchedAt: Date;
    reviewStatus: "flagged" | "confirmed" | "rejected";
    amount?: string;
    validFrom?: string;
    parsedData?: unknown;
    groundingResult?: unknown;
  },
): Promise<{ id: number }> {
  const parsedData =
    input.parsedData ??
    {
      rows: [
        {
          provider: "anthropic",
          modelName: "Claude Mythos 5.1",
          modelSlug: input.modelSlug,
          dimension: "input",
          usdPer1M: input.amount,
          source: "official",
          ...(input.validFrom === undefined ? {} : { validFrom: input.validFrom }),
        },
      ],
      warnings: [],
    };
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: input.sourceId,
        fetchedAt: input.fetchedAt,
        contentHash: uniqueSlug("content"),
        rawContent: uniqueSlug("raw"),
        rawContentHash: uniqueSlug("raw-hash"),
        parsedData,
      })
      .returning({ id: observations.id }),
    "insert observation",
  );
  return requireInsertedRow(
    await tx
      .insert(observationItems)
      .values({
        observationId: observation.id,
        offeringId: input.offeringId,
        reviewStatus: input.reviewStatus,
        groundingResult: input.groundingResult,
      })
      .returning({ id: observationItems.id }),
    "insert observation item",
  );
}

async function plantUnchanged(tx: PublishDb, sourceId: number, fetchedAt: Date): Promise<void> {
  requireInsertedRow(
    await tx
      .insert(fetchLog)
      .values({
        sourceId,
        fetchedAt,
        httpStatus: 200,
        outcome: "unchanged",
        observationId: null,
        note: null,
      })
      .returning({ id: fetchLog.id }),
    "insert fetch log",
  );
}

async function versionsFor(tx: PublishDb, offeringId: number) {
  return tx
    .select()
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId))
    .orderBy(priceVersions.id);
}

async function amountsFor(tx: PublishDb, priceVersionId: number) {
  const rows = await tx
    .select()
    .from(priceComponents)
    .where(eq(priceComponents.priceVersionId, priceVersionId))
    .orderBy(priceComponents.id);
  return rows.map((row) => ({
    dimension: row.dimension,
    amount: row.amount,
    condition: row.condition,
  }));
}

async function stampFor(tx: PublishDb, itemId: number) {
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
