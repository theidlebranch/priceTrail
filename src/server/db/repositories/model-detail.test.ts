// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The price row is planted with publishPriceVersion(). This file does not
 * insert into the price tables. A closed version stays in the history
 * list and must not come back as the current price. A retracted version
 * stays out of both lists.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/model-detail.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import { findModelDetail, hasTrackedModel } from "@/server/db/repositories/model-detail";
import { observationItems, observations, priceVersionEvidence, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST_SEEN = new Date("2026-01-15T16:00:00.000Z");
const LAST_SEEN = new Date("2026-05-20T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-02T16:00:00.000Z");
const RETRACTED = new Date("2026-06-03T16:00:00.000Z");
const RAW_MARKER = "SECRET-RAW-PAGE";
const PARSED_MARKER = "SECRET-PARSED";

describe.skipIf(databaseUrl.length === 0)("findModelDetail", () => {
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

  it("returns null when the lab and model slug are missing", async () => {
    await withDetail(async (tx) => {
      expect(await findModelDetail(tx, uniqueSlug("lab"), uniqueSlug("model"))).toBeNull();
    });
  });

  it("says a model is tracked when the row exists, even with no price", async () => {
    await withDetail(async (tx) => {
      expect(await hasTrackedModel(tx, uniqueSlug("lab"), uniqueSlug("model"))).toBe(false);

      const planted = await plantModel(tx);
      await plantPublished(tx, planted.offeringId, "10");
      expect(await hasTrackedModel(tx, planted.labSlug, planted.modelSlug)).toBe(true);

      const catalog = createCatalogRepository(tx);
      const lab = await catalog.insertLab({ name: "OpenAI", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "No price yet",
        slug: uniqueSlug("model"),
      });
      expect(await hasTrackedModel(tx, lab.slug, model.slug)).toBe(true);
    });
  });

  it("returns the open price as a decimal string and the official URL", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      await plantWitness(tx, planted.offeringId);

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);

      expect(detail).toEqual({
        labName: "Anthropic",
        modelName: "Claude Fable 5.1",
        deprecatedAt: null,
        offerings: [
          {
            openVersions: [
              {
                firstSeenAt: FIRST_SEEN,
                announcedOn: null,
                archiveUrl: null,
                archiveStatus: "pending",
                components: [
                  {
                    dimension: "input",
                    unit: "usd_per_1m_tokens",
                    amount: "10",
                    condition: {},
                  },
                ],
              },
            ],
            historyVersions: [
              {
                firstSeenAt: FIRST_SEEN,
                announcedOn: null,
                lastSeenAt: null,
                archiveUrl: null,
                archiveStatus: "pending",
                components: [
                  {
                    dimension: "input",
                    unit: "usd_per_1m_tokens",
                    amount: "10",
                    condition: {},
                  },
                ],
              },
            ],
            officialSourceUrls: [published.sourceUrl],
            reviewStatuses: ["confirmed"],
          },
        ],
      });
      const packed = JSON.stringify(detail);
      expect(packed).not.toContain(RAW_MARKER);
      expect(packed).not.toContain(PARSED_MARKER);
    });
  });

  it("returns the Wayback permalink of the snapshot that opened the price", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      const permalink =
        "https://web.archive.org/web/20260115160000/https://example.test/pricing";
      await setArchive(tx, published.itemId, permalink, "archived");

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const version = detail?.offerings[0]?.openVersions[0];

      expect(version?.archiveUrl).toBe(permalink);
      expect(version?.archiveStatus).toBe("archived");
      expect(JSON.stringify(detail)).not.toContain(RAW_MARKER);
    });
  });

  it("keeps a later archived visit off the price that an earlier snapshot opened", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      const later =
        "https://web.archive.org/web/20260602160000/https://example.test/pricing";
      await plantItemOnSource(tx, planted.offeringId, published.sourceUrl, "confirmed", {
        usdPer1M: "10",
      });
      const laterItems = await tx
        .select({ id: observationItems.id })
        .from(observationItems)
        .where(eq(observationItems.offeringId, planted.offeringId));
      const laterItem = laterItems.find((item) => item.id !== published.itemId);
      if (laterItem === undefined) {
        throw new Error("later observation item is missing");
      }
      await setArchive(tx, laterItem.id, later, "archived");

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);

      expect(detail?.offerings[0]?.openVersions[0]?.archiveUrl).toBeNull();
      expect(detail?.offerings[0]?.openVersions[0]?.archiveStatus).toBe("pending");
      expect(JSON.stringify(detail)).not.toContain(later);
    });
  });

  it("throws when one published price has two evidence rows", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      const extraItemId = await plantItem(
        tx,
        planted.offeringId,
        `https://example.test/pricing/${randomUUID()}`,
        "official",
      );
      await tx.insert(priceVersionEvidence).values({
        priceVersionId: published.priceVersionId,
        observationItemId: extraItemId,
      });

      await expect(findModelDetail(tx, planted.labSlug, planted.modelSlug)).rejects.toThrow(
        /more than one evidence row/,
      );
    });
  });

  it("returns no open version when the model has not been published", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);

      expect(detail?.offerings).toEqual([
        { openVersions: [], historyVersions: [], officialSourceUrls: [], reviewStatuses: [] },
      ]);
    });
  });

  it("keeps the newer open price and drops the version that was closed", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "1.25");
      await publishPriceVersion(tx, {
        observationItemId: published.itemId,
        firstSeenAt: NEXT_SEEN,
        previousLastSeenAt: LAST_SEEN,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "1" }],
      });

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const version = detail?.offerings[0]?.openVersions[0];

      expect(detail?.offerings).toHaveLength(1);
      expect(version?.firstSeenAt).toEqual(NEXT_SEEN);
      expect(version?.components).toEqual([
        {
          dimension: "input",
          unit: "usd_per_1m_tokens",
          amount: "1",
          condition: {},
        },
      ]);
      expect(detail?.offerings[0]?.historyVersions).toEqual([
        {
          firstSeenAt: FIRST_SEEN,
          announcedOn: null,
          lastSeenAt: LAST_SEEN,
          archiveUrl: null,
          archiveStatus: "pending",
          components: [
            {
              dimension: "input",
              unit: "usd_per_1m_tokens",
              amount: "1.25",
              condition: {},
            },
          ],
        },
        {
          firstSeenAt: NEXT_SEEN,
          announcedOn: null,
          lastSeenAt: null,
          archiveUrl: null,
          archiveStatus: "pending",
          components: [
            {
              dimension: "input",
              unit: "usd_per_1m_tokens",
              amount: "1",
              condition: {},
            },
          ],
        },
      ]);
    });
  });

  it("keeps the fix and drops the retracted price", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "0.80");
      await publishPriceVersion(tx, {
        observationItemId: published.itemId,
        firstSeenAt: FIRST_SEEN,
        replacesVersionId: published.priceVersionId,
        retractedAt: RETRACTED,
        components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount: "1" }],
      });

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const amounts = detail?.offerings[0]?.openVersions.flatMap((version) =>
        version.components.map((component) => component.amount),
      );

      expect(amounts).toEqual(["1"]);
      const historyAmounts = detail?.offerings[0]?.historyVersions.flatMap((version) =>
        version.components.map((component) => component.amount),
      );
      expect(historyAmounts).toEqual(["1"]);
    });
  });

  it("keeps the published amount when a later official item is flagged", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      await plantItemOnSource(tx, planted.offeringId, published.sourceUrl, "flagged", {
        usdPer1M: "999",
        marker: PARSED_MARKER,
      });

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const amounts = detail?.offerings[0]?.openVersions.flatMap((version) =>
        version.components.map((component) => component.amount),
      );

      expect(amounts).toEqual(["10"]);
      expect(detail?.offerings[0]?.reviewStatuses).toEqual(["confirmed", "flagged"]);
      expect(detail?.offerings[0]?.officialSourceUrls).toEqual([published.sourceUrl]);
      const packed = JSON.stringify(detail);
      expect(packed).not.toContain("999");
      expect(packed).not.toContain(PARSED_MARKER);
      expect(packed).not.toContain(RAW_MARKER);
    });
  });

  it("does not treat a rejected official item as under review", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const published = await plantPublished(tx, planted.offeringId, "10");
      await plantItemOnSource(tx, planted.offeringId, published.sourceUrl, "rejected", {
        usdPer1M: "999",
      });

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const amounts = detail?.offerings[0]?.openVersions.flatMap((version) =>
        version.components.map((component) => component.amount),
      );

      expect(amounts).toEqual(["10"]);
      expect(detail?.offerings[0]?.reviewStatuses).toEqual(["confirmed", "rejected"]);
      expect(JSON.stringify(detail)).not.toContain("999");
    });
  });

  it("ignores a flagged aggregator item", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      await plantPublished(tx, planted.offeringId, "10");
      await plantItem(
        tx,
        planted.offeringId,
        `https://example.test/witness/${randomUUID()}`,
        "aggregator",
        "flagged",
        { usdPer1M: "999" },
      );

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);

      expect(detail?.offerings[0]?.reviewStatuses).toEqual(["confirmed"]);
      expect(JSON.stringify(detail)).not.toContain("999");
    });
  });

  it("ignores a non-global offering", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      await plantPublished(tx, planted.offeringId, "10");
      const regional = await createCatalogRepository(tx).insertOffering({
        modelId: planted.modelId,
        platform: "official-api",
        region: "eu",
      });
      await plantPublished(tx, regional.id, "99");

      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);
      const amounts = detail?.offerings.flatMap((offering) =>
        offering.openVersions.flatMap((version) =>
          version.components.map((component) => component.amount),
        ),
      );

      expect(detail?.offerings).toHaveLength(1);
      expect(amounts).toEqual(["10"]);
    });
  });

  it("returns the model with no offerings when the only offering is not global", async () => {
    await withDetail(async (tx) => {
      const catalog = createCatalogRepository(tx);
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Fable 5.1",
        slug: uniqueSlug("model"),
      });
      const offering = await catalog.insertOffering({
        modelId: model.id,
        platform: "official-api",
        region: "eu",
      });
      await plantPublished(tx, offering.id, "99");

      const detail = await findModelDetail(tx, lab.slug, model.slug);

      expect(detail?.offerings).toEqual([]);
    });
  });

  async function withDetail(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("model detail test rolled back");
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
    name: "Claude Fable 5.1",
    slug: uniqueSlug("model"),
  });
  const offering = await catalog.insertOffering({
    modelId: model.id,
    platform: "official-api",
  });
  return {
    labSlug: lab.slug,
    modelSlug: model.slug,
    modelId: model.id,
    offeringId: offering.id,
  };
}

/** Publish one input price. Later steps in a test close or correct this row. */
async function plantPublished(tx: PublishDb, offeringId: number, amount: string) {
  const sourceUrl = `https://example.test/pricing/${randomUUID()}`;
  const itemId = await plantItem(tx, offeringId, sourceUrl, "official");
  const published = await publishPriceVersion(tx, {
    observationItemId: itemId,
    firstSeenAt: FIRST_SEEN,
    components: [{ dimension: "input", unit: "usd_per_1m_tokens", amount }],
  });
  return { itemId, sourceUrl, priceVersionId: published.priceVersionId };
}

/** An aggregator row on the same offering. It must not become the evidence link. */
async function plantWitness(tx: PublishDb, offeringId: number): Promise<void> {
  await plantItem(tx, offeringId, `https://example.test/witness/${randomUUID()}`, "aggregator");
}

async function plantItem(
  tx: PublishDb,
  offeringId: number,
  url: string,
  type: "official" | "aggregator",
  reviewStatus: "ok" | "flagged" | "confirmed" | "rejected" = "confirmed",
  parsedData: unknown = { marker: PARSED_MARKER },
): Promise<number> {
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url, type })
      .returning(),
    "insert source",
  );
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: FIRST_SEEN,
        contentHash: uniqueSlug("content"),
        rawContent: `${RAW_MARKER}-${randomUUID()}`,
        rawContentHash: uniqueSlug("raw"),
        parsedData,
      })
      .returning(),
    "insert observation",
  );
  const item = requireInsertedRow(
    await tx
      .insert(observationItems)
      .values({
        observationId: observation.id,
        offeringId,
        reviewStatus,
      })
      .returning(),
    "insert observation item",
  );
  return item.id;
}

async function setArchive(
  tx: PublishDb,
  itemId: number,
  archiveUrl: string,
  archiveStatus: "pending" | "archived" | "failed",
): Promise<void> {
  const rows = await tx
    .select({ observationId: observationItems.observationId })
    .from(observationItems)
    .where(eq(observationItems.id, itemId))
    .limit(1);
  const item = rows[0];
  if (item === undefined) {
    throw new Error("observation item is missing");
  }
  await tx
    .update(observations)
    .set({ archiveUrl, archiveStatus })
    .where(eq(observations.id, item.observationId));
}

/** A later snapshot of a source the test already inserted. Same URL, so the page still has one official link. */
async function plantItemOnSource(
  tx: PublishDb,
  offeringId: number,
  sourceUrl: string,
  reviewStatus: "ok" | "flagged" | "confirmed" | "rejected",
  parsedData: unknown,
): Promise<void> {
  const sourceRows = await tx
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, sourceUrl))
    .limit(1);
  const source = sourceRows[0];
  if (source === undefined) {
    throw new Error("test source is missing");
  }

  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: NEXT_SEEN,
        contentHash: uniqueSlug("content"),
        rawContent: `${RAW_MARKER}-${randomUUID()}`,
        rawContentHash: uniqueSlug("raw"),
        parsedData,
      })
      .returning(),
    "insert observation",
  );
  requireInsertedRow(
    await tx
      .insert(observationItems)
      .values({
        observationId: observation.id,
        offeringId,
        reviewStatus,
      })
      .returning(),
    "insert observation item",
  );
}
