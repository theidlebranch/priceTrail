import { and, desc, eq, isNull } from "drizzle-orm";
import {
  GOOGLE_CATALOG_SLUGS,
  GOOGLE_LAB_SLUG,
  GOOGLE_PRICING_URL,
} from "@/server/db/google-catalog";
import type { PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import { observationItems, observations, priceVersions, sources } from "@/server/db/schema";

/**
 * Copy the latest Google snapshot into a new observation, and flag the
 * offerings that still have no open price and no item waiting.
 *
 * The old Argon and Flash items were rejected. A rejected item cannot be
 * confirmed, and an unchanged page does not create a new item. This gives
 * those offerings a fresh flagged item from the snapshot already stored.
 *
 * fetchedAt is passed in. This file does not call new Date(). It does not
 * download, does not call Wayback, and does not call publishPriceVersion().
 * A second run finds the flagged items and throws.
 */

const OFFICIAL_PLATFORM = "official-api";
const GLOBAL_REGION = "global";

export type RequeueGoogleInput = {
  fetchedAt: Date;
  labSlug?: string;
  sourceUrl?: string;
};

export type RequeueGoogleResult = {
  observationId: number;
  offeringIds: number[];
};

export async function requeueGoogleOfferingsWithoutPrice(
  db: PublishDb,
  input: RequeueGoogleInput,
): Promise<RequeueGoogleResult> {
  if (!(input.fetchedAt instanceof Date) || Number.isNaN(input.fetchedAt.getTime())) {
    throw new Error("fetchedAt must be a valid date");
  }
  const labSlug = input.labSlug ?? GOOGLE_LAB_SLUG;
  const sourceUrl = input.sourceUrl ?? GOOGLE_PRICING_URL;

  const catalog = createCatalogRepository(db);
  const lab = await catalog.findLabBySlug(labSlug);
  if (lab === null) {
    throw new Error(`lab ${labSlug} is not in the database`);
  }

  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, sourceUrl))
    .limit(1);
  const source = sourceRows[0];
  if (source === undefined) {
    throw new Error("google official source is missing");
  }

  const latestRows = await db
    .select()
    .from(observations)
    .where(eq(observations.sourceId, source.id))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  const latest = latestRows[0];
  if (latest === undefined) {
    throw new Error("google source has no stored snapshot");
  }
  if (input.fetchedAt.getTime() <= latest.fetchedAt.getTime()) {
    throw new Error("fetchedAt must be after the latest stored snapshot");
  }

  const offeringIds: number[] = [];
  for (const slug of GOOGLE_CATALOG_SLUGS) {
    const model = await catalog.findModelByLabAndSlug(lab.id, slug);
    if (model === null) {
      throw new Error(`google catalog model ${slug} is not in the database`);
    }
    const offering = await catalog.findOffering(model.id, OFFICIAL_PLATFORM, GLOBAL_REGION);
    if (offering === null) {
      throw new Error(`google catalog model ${slug} has no global offering`);
    }
    if (await hasOpenPrice(db, offering.id) || (await hasFlaggedItem(db, offering.id))) {
      continue;
    }
    offeringIds.push(offering.id);
  }
  if (offeringIds.length === 0) {
    throw new Error("no Google offering is waiting to be requeued");
  }

  const observation = requireInsertedRow(
    await db
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: input.fetchedAt,
        contentHash: latest.contentHash,
        rawContent: latest.rawContent,
        rawContentHash: latest.rawContentHash,
        parsedData: latest.parsedData,
        archiveUrl: latest.archiveUrl,
        archiveStatus: latest.archiveStatus,
      })
      .returning({ id: observations.id }),
    "insert requeued observation",
  );
  for (const offeringId of offeringIds) {
    requireInsertedRow(
      await db
        .insert(observationItems)
        .values({
          observationId: observation.id,
          offeringId,
          reviewStatus: "flagged",
        })
        .returning({ id: observationItems.id }),
      "insert requeued observation item",
    );
  }

  return { observationId: observation.id, offeringIds };
}

async function hasOpenPrice(db: PublishDb, offeringId: number): Promise<boolean> {
  const rows = await db
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(
      and(
        eq(priceVersions.offeringId, offeringId),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hasFlaggedItem(db: PublishDb, offeringId: number): Promise<boolean> {
  const rows = await db
    .select({ id: observationItems.id })
    .from(observationItems)
    .where(
      and(
        eq(observationItems.offeringId, offeringId),
        eq(observationItems.reviewStatus, "flagged"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
