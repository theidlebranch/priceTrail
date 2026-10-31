import { and, eq, inArray, isNull, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "@/server/db/schema";
import {
  labs,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";

/**
 * Read door for one public model page.
 *
 * This file only runs SELECT. It does not insert, update, or delete.
 * publishPriceVersion() stays the only writer of price rows.
 *
 * The current price is the open version: last_seen_at blank and
 * retracted_at blank. A region other than global is left out. The
 * evidence link is sources.url where type is official. raw_content,
 * parsed_data, and archive_url are not selected. A public page does
 * not load the stored page text.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a test.
 * A transaction is a different class with the same select methods.
 */
type ModelDetailDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type ModelDetailComponent = {
  dimension: string;
  unit: string;
  amount: string;
  condition: unknown;
};

type ModelDetailVersion = {
  firstSeenAt: Date;
  announcedOn: string | null;
  components: ModelDetailComponent[];
};

export type ModelDetailOffering = {
  openVersions: ModelDetailVersion[];
  officialSourceUrls: string[];
};

export type ModelDetailRead = {
  labName: string;
  modelName: string;
  deprecatedAt: Date | null;
  offerings: ModelDetailOffering[];
};

export async function findModelDetail(
  db: ModelDetailDb,
  labSlug: string,
  modelSlug: string,
): Promise<ModelDetailRead | null> {
  const modelRows = await db
    .select({
      modelId: models.id,
      labName: labs.name,
      modelName: models.name,
      deprecatedAt: models.deprecatedAt,
    })
    .from(models)
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(and(eq(labs.slug, labSlug), eq(models.slug, modelSlug)))
    .limit(1);

  const model = modelRows[0];
  if (model === undefined) {
    return null;
  }

  const offeringRows = await db
    .select({ id: offerings.id })
    .from(offerings)
    .where(and(eq(offerings.modelId, model.modelId), eq(offerings.region, "global")));

  if (offeringRows.length === 0) {
    return {
      labName: model.labName,
      modelName: model.modelName,
      deprecatedAt: model.deprecatedAt,
      offerings: [],
    };
  }

  const offeringIds = offeringRows.map((offering) => offering.id);
  const versionRows = await db
    .select({
      id: priceVersions.id,
      offeringId: priceVersions.offeringId,
      firstSeenAt: priceVersions.firstSeenAt,
      announcedOn: priceVersions.announcedOn,
    })
    .from(priceVersions)
    .where(
      and(
        inArray(priceVersions.offeringId, offeringIds),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    );

  const versionIds = versionRows.map((version) => version.id);
  const componentRows =
    versionIds.length === 0
      ? []
      : await db
          .select({
            priceVersionId: priceComponents.priceVersionId,
            dimension: priceComponents.dimension,
            unit: priceComponents.unit,
            amount: priceComponents.amount,
            condition: priceComponents.condition,
          })
          .from(priceComponents)
          .where(inArray(priceComponents.priceVersionId, versionIds));

  const sourceRows = await db
    .select({
      offeringId: observationItems.offeringId,
      url: sources.url,
    })
    .from(observationItems)
    .innerJoin(observations, eq(observationItems.observationId, observations.id))
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .where(and(inArray(observationItems.offeringId, offeringIds), eq(sources.type, "official")));

  return {
    labName: model.labName,
    modelName: model.modelName,
    deprecatedAt: model.deprecatedAt,
    offerings: offeringRows.map((offering) =>
      offeringDetail(offering.id, versionRows, componentRows, sourceRows),
    ),
  };
}

function offeringDetail(
  offeringId: number,
  versionRows: {
    id: number;
    offeringId: number;
    firstSeenAt: Date;
    announcedOn: string | null;
  }[],
  componentRows: {
    priceVersionId: number;
    dimension: string;
    unit: string;
    amount: string;
    condition: unknown;
  }[],
  sourceRows: { offeringId: number; url: string }[],
): ModelDetailOffering {
  const openVersions = versionRows
    .filter((version) => version.offeringId === offeringId)
    .map((version) => ({
      firstSeenAt: version.firstSeenAt,
      announcedOn: version.announcedOn,
      components: componentRows
        .filter((component) => component.priceVersionId === version.id)
        .map((component) => ({
          dimension: component.dimension,
          unit: component.unit,
          amount: component.amount,
          condition: component.condition,
        })),
    }));

  const officialSourceUrls = [
    ...new Set(
      sourceRows.filter((source) => source.offeringId === offeringId).map((source) => source.url),
    ),
  ].sort();

  return { openVersions, officialSourceUrls };
}
