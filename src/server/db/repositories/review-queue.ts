import { and, desc, eq, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "@/server/db/schema";
import {
  labs,
  models,
  observationItems,
  observations,
  offerings,
  sources,
} from "@/server/db/schema";

/**
 * Read door for the review queue.
 *
 * This file only runs SELECT. It does not insert, update, or delete.
 * publishPriceVersion() stays the only writer of price rows. Confirm
 * and reject are a later step, so this file does not stamp a review.
 *
 * The list is official items still waiting. ok, confirmed, and rejected
 * stay off it. An aggregator item stays off it. The list does not select
 * raw_content, parsed_data, or grounding_result. The detail reads
 * parsed_data and grounding_result for one item. It still does not
 * select raw_content. The cell check has no stored shape yet, so the
 * page refuses a non-null grounding_result instead of drawing a match.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a test.
 * A transaction is a different class with the same select methods.
 */
export type ReviewQueueDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type FlaggedReviewItem = {
  id: number;
  reviewStatus: string;
  labName: string;
  modelName: string;
  sourceUrl: string;
  fetchedAt: Date;
  reviewNote: string | null;
};

export type ReviewItemRead = FlaggedReviewItem & {
  modelSlug: string;
  sourceType: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  groundingResult: unknown;
  parsedData: unknown;
};

/**
 * True when this observation item exists.
 *
 * The request proxy calls this before the page shell starts, so a
 * missing id can answer 404. It does not read the page text or the
 * parsed prices. Any review status still counts as present.
 */
export async function hasReviewItem(db: ReviewQueueDb, id: number): Promise<boolean> {
  const rows = await db
    .select({ id: observationItems.id })
    .from(observationItems)
    .where(eq(observationItems.id, id))
    .limit(1);

  return rows.length > 0;
}

export async function listFlaggedReviewItems(db: ReviewQueueDb): Promise<FlaggedReviewItem[]> {
  return db
    .select({
      id: observationItems.id,
      reviewStatus: observationItems.reviewStatus,
      labName: labs.name,
      modelName: models.name,
      sourceUrl: sources.url,
      fetchedAt: observations.fetchedAt,
      reviewNote: observationItems.reviewNote,
    })
    .from(observationItems)
    .innerJoin(observations, eq(observationItems.observationId, observations.id))
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .innerJoin(offerings, eq(observationItems.offeringId, offerings.id))
    .innerJoin(models, eq(offerings.modelId, models.id))
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(and(eq(observationItems.reviewStatus, "flagged"), eq(sources.type, "official")))
    .orderBy(desc(observations.fetchedAt), desc(observationItems.id));
}

export async function findReviewItem(
  db: ReviewQueueDb,
  id: number,
): Promise<ReviewItemRead | null> {
  const rows = await db
    .select({
      id: observationItems.id,
      reviewStatus: observationItems.reviewStatus,
      labName: labs.name,
      modelName: models.name,
      modelSlug: models.slug,
      sourceUrl: sources.url,
      sourceType: sources.type,
      fetchedAt: observations.fetchedAt,
      reviewNote: observationItems.reviewNote,
      reviewedBy: observationItems.reviewedBy,
      reviewedAt: observationItems.reviewedAt,
      groundingResult: observationItems.groundingResult,
      parsedData: observations.parsedData,
    })
    .from(observationItems)
    .innerJoin(observations, eq(observationItems.observationId, observations.id))
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .innerJoin(offerings, eq(observationItems.offeringId, offerings.id))
    .innerJoin(models, eq(offerings.modelId, models.id))
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(eq(observationItems.id, id))
    .limit(1);

  return rows[0] ?? null;
}
