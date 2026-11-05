// @vitest-environment node

/**
 * The name check does not open a database. The insert tests talk to Neon.
 * They skip when DATABASE_URL is missing, which is what CI does. Each
 * database test rolls its transaction back, so a passing run leaves no rows.
 *
 * A test passes its own lab slug and URL. The real slug is "google", and
 * pnpm seed:google may already have written it. Both values are unique.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/google-catalog.test.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { parseGooglePricing } from "@/core/pricing/google";
import { createDb } from "@/server/db/client";
import {
  GOOGLE_CATALOG_SLUGS,
  googleCatalogModelNames,
  plantGoogleCatalog,
} from "@/server/db/google-catalog";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import type { PublishDb } from "@/server/db/publish-price-version";
import {
  models,
  observationItems,
  observations,
  offerings,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/google-pricing.2026-10-18.html"),
  "utf8",
);

describe("googleCatalogModelNames", () => {
  const rows = parseGooglePricing(fixture).rows;

  it("reads the display names from the parser", () => {
    expect(googleCatalogModelNames(GOOGLE_CATALOG_SLUGS, rows)).toEqual([
      { slug: "gemini-4-argon", name: "Gemini 4 Argon" },
      { slug: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { slug: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ]);
  });

  it("throws when a slug has no parser row", () => {
    expect(() => googleCatalogModelNames(["gemini-3.1-pro-preview"], rows)).toThrow(
      /gemini-3.1-pro-preview is not in the parser output/,
    );
  });
});

describe.skipIf(databaseUrl.length === 0)("plantGoogleCatalog", () => {
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

  it("inserts the lab, models, offerings, and source, and no prices", async () => {
    await withCatalog(async (tx) => {
      const planted = plantedIds();
      const result = await plantGoogleCatalog(tx, planted);

      expect(result.modelIds).toHaveLength(GOOGLE_CATALOG_SLUGS.length);
      expect(result.offeringIds).toHaveLength(GOOGLE_CATALOG_SLUGS.length);

      const catalog = createCatalogRepository(tx);
      const lab = await catalog.findLabBySlug(planted.labSlug);
      expect(lab).toMatchObject({ id: result.labId, name: "Google", slug: planted.labSlug });

      const modelRows = await tx.select().from(models).where(eq(models.labId, result.labId));
      expect(modelRows.map((model) => model.slug).sort()).toEqual([...GOOGLE_CATALOG_SLUGS].sort());
      expect(modelRows.map((model) => model.name).sort()).toEqual([
        "Gemini 2.5 Pro",
        "Gemini 3.8 Flash",
        "Gemini 4 Argon",
      ]);

      const offeringRows = await tx
        .select()
        .from(offerings)
        .where(inArray(offerings.id, result.offeringIds));
      expect(offeringRows).toHaveLength(3);
      expect(
        offeringRows.every(
          (offering) => offering.platform === "official-api" && offering.region === "global",
        ),
      ).toBe(true);

      const sourceRows = await tx.select().from(sources).where(eq(sources.id, result.sourceId));
      expect(sourceRows).toEqual([
        expect.objectContaining({
          url: planted.sourceUrl,
          type: "official",
          active: true,
          lastCheckedAt: null,
        }),
      ]);

      const observationRows = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceId, result.sourceId));
      expect(observationRows).toHaveLength(0);

      const itemRows = await tx
        .select({ id: observationItems.id })
        .from(observationItems)
        .where(inArray(observationItems.offeringId, result.offeringIds));
      expect(itemRows).toHaveLength(0);

      const priceRows = await tx
        .select({ id: priceVersions.id })
        .from(priceVersions)
        .where(inArray(priceVersions.offeringId, result.offeringIds));
      expect(priceRows).toHaveLength(0);
    });
  });

  it("throws before any insert when a slug is not in the parser output", async () => {
    await withCatalog(async (tx) => {
      const planted = plantedIds();

      await expect(
        plantGoogleCatalog(tx, {
          ...planted,
          slugs: ["gemini-3.1-pro-preview"],
        }),
      ).rejects.toThrow(/gemini-3.1-pro-preview is not in the parser output/);

      const catalog = createCatalogRepository(tx);
      expect(await catalog.findLabBySlug(planted.labSlug)).toBeNull();
      const sourceRows = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.url, planted.sourceUrl));
      expect(sourceRows).toHaveLength(0);
    });
  });

  it("throws when the lab slug is already there and does not insert another", async () => {
    await withCatalog(async (tx) => {
      const planted = plantedIds();
      await plantGoogleCatalog(tx, planted);

      await expect(plantGoogleCatalog(tx, planted)).rejects.toThrow(/already exists/);

      const catalog = createCatalogRepository(tx);
      const lab = await catalog.findLabBySlug(planted.labSlug);
      const modelRows = await tx.select().from(models).where(eq(models.labId, lab?.id ?? -1));
      expect(modelRows).toHaveLength(GOOGLE_CATALOG_SLUGS.length);
    });
  });

  async function withCatalog(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("google catalog test rolled back");
    this.name = "RolledBack";
  }
}

function plantedIds(): { labSlug: string; sourceUrl: string } {
  const id = randomUUID();
  return {
    labSlug: `google-${id}`,
    sourceUrl: `https://example.test/google-pricing/${id}`,
  };
}
