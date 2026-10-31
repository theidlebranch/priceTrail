// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The price row is planted with publishPriceVersion(). This file does not
 * insert into the price tables. A closed or retracted version must not
 * come back as the current price.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/model-detail.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import { findModelDetail } from "@/server/db/repositories/model-detail";
import { observationItems, observations, sources } from "@/server/db/schema";
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
          },
        ],
      });
      const packed = JSON.stringify(detail);
      expect(packed).not.toContain(RAW_MARKER);
      expect(packed).not.toContain(PARSED_MARKER);
    });
  });

  it("returns no open version when the model has not been published", async () => {
    await withDetail(async (tx) => {
      const planted = await plantModel(tx);
      const detail = await findModelDetail(tx, planted.labSlug, planted.modelSlug);

      expect(detail?.offerings).toEqual([{ openVersions: [], officialSourceUrls: [] }]);
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
        parsedData: { marker: PARSED_MARKER },
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
        reviewStatus: "confirmed",
      })
      .returning(),
    "insert observation item",
  );
  return item.id;
}
