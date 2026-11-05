import { readFileSync } from "node:fs";
import path from "node:path";
import { parseGooglePricing } from "@/core/pricing/google";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import type { PublishDb } from "@/server/db/publish-price-version";
import { sources } from "@/server/db/schema";

/**
 * The Google models we track, without publishing a price.
 *
 * Argon and Flash are schedules. Gemini 2.5 Pro is a token tier. The price
 * seed refuses both shapes, and it calls publishPriceVersion(). This list
 * stays separate so those models can exist in the catalog first.
 *
 * gemini-3.1-pro-preview is not here. That heading lists two model codes,
 * so the parser emits no rows. Tracking it would make every visit look broken.
 *
 * The caller passes a transaction. A throw after the first insert then
 * undoes the whole catalog. This file does not insert an observation, and
 * it does not call publishPriceVersion().
 */

const GOOGLE_LAB_NAME = "Google";

export const GOOGLE_LAB_SLUG = "google";
export const GOOGLE_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing?hl=en";

export const GOOGLE_CATALOG_SLUGS = [
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-2.5-pro",
] as const;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/google-pricing.2026-10-18.html",
);

export type GoogleCatalogModel = {
  slug: string;
  name: string;
};

export type GoogleCatalogResult = {
  labId: number;
  modelIds: number[];
  offeringIds: number[];
  sourceId: number;
};

export type PlantGoogleCatalogInput = {
  slugs?: readonly string[];
  labSlug?: string;
  sourceUrl?: string;
};

/**
 * Names for the slugs we are about to insert.
 *
 * A slug with no parser row throws here, before any insert. The display
 * name comes from the parser, so we do not type a second copy of it.
 */
export function googleCatalogModelNames(
  slugs: readonly string[],
  rows: readonly NormalizedPrice[],
): GoogleCatalogModel[] {
  const models: GoogleCatalogModel[] = [];
  for (const slug of slugs) {
    const name = rows.find((row) => row.modelSlug === slug)?.modelName;
    if (name === undefined) {
      throw new Error(`google catalog model ${slug} is not in the parser output`);
    }
    models.push({ slug, name });
  }
  return models;
}

/**
 * Insert the Google lab, three models, their official offerings, and the
 * pricing-page source.
 *
 * Tests pass their own lab slug and URL so they do not collide with a
 * catalog that is already saved. The script calls this with no input, which
 * uses the real slug and the real English URL.
 */
export async function plantGoogleCatalog(
  db: PublishDb,
  input: PlantGoogleCatalogInput = {},
): Promise<GoogleCatalogResult> {
  const slugs = input.slugs ?? GOOGLE_CATALOG_SLUGS;
  const labSlug = input.labSlug ?? GOOGLE_LAB_SLUG;
  const sourceUrl = input.sourceUrl ?? GOOGLE_PRICING_URL;
  const parsed = parseGooglePricing(readFileSync(FIXTURE_PATH, "utf8"));
  const models = googleCatalogModelNames(slugs, parsed.rows);

  const catalog = createCatalogRepository(db);
  const existing = await catalog.findLabBySlug(labSlug);
  if (existing !== null) {
    throw new Error(`lab ${labSlug} already exists; refusing to seed again`);
  }

  const lab = await catalog.insertLab({ name: GOOGLE_LAB_NAME, slug: labSlug });
  const modelIds: number[] = [];
  const offeringIds: number[] = [];
  for (const modelSpec of models) {
    const model = await catalog.insertModel({
      labId: lab.id,
      name: modelSpec.name,
      slug: modelSpec.slug,
    });
    const offering = await catalog.insertOffering({
      modelId: model.id,
      platform: "official-api",
    });
    modelIds.push(model.id);
    offeringIds.push(offering.id);
  }

  const source = requireInsertedRow(
    await db
      .insert(sources)
      .values({
        url: sourceUrl,
        type: "official",
      })
      .returning(),
    "insert source",
  );

  return {
    labId: lab.id,
    modelIds,
    offeringIds,
    sourceId: source.id,
  };
}
