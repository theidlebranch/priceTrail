import { and, eq, inArray, isNull } from "drizzle-orm";
import { normalizedPriceSchema, type NormalizedPrice } from "@/core/pricing/shape";
import {
  SAME_PRICE_NOTE,
  SAME_PRICE_REVIEWER,
  trackedPriceUnchanged,
  type OpenPriceComponent,
} from "@/core/review/confirm-price";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
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
 * Settle flagged items whose price for the visit day did not change.
 *
 * A later dated price does not count. The comparison is the price that
 * applied on that visit, against the open price now. An open price whose
 * firstSeenAt is after the visit stays flagged, so a later publish cannot
 * clear the earlier difference.
 *
 * planSamePriceClears() only reads. clearSamePriceFlags() stamps the
 * matching items confirmed, with reviewed_at set to that snapshot's
 * visit time. It does not download a page and does not call
 * publishPriceVersion(). A real price difference stays flagged.
 */

export type SamePriceFlag = {
  id: number;
  labSlug: string;
  modelSlug: string;
  observationId: number;
};

export type SamePriceClearPlan = {
  clear: SamePriceFlag[];
  keep: SamePriceFlag[];
};

type WaitingItem = SamePriceFlag & {
  offeringId: number;
  fetchedAt: Date;
  parsedData: unknown;
};

type OpenPrice = {
  firstSeenAt: Date;
  components: OpenPriceComponent[];
};

export async function planSamePriceClears(db: EvidenceDb): Promise<SamePriceClearPlan> {
  const decided = await decideSamePriceFlags(db);
  return { clear: decided.clear.map(toFlag), keep: decided.keep };
}

export async function clearSamePriceFlags(db: EvidenceDb): Promise<SamePriceClearPlan> {
  const decided = await decideSamePriceFlags(db);
  for (const item of decided.clear) {
    const updated = await db
      .update(observationItems)
      .set({
        reviewStatus: "confirmed",
        reviewedBy: SAME_PRICE_REVIEWER,
        reviewedAt: item.fetchedAt,
        reviewNote: SAME_PRICE_NOTE,
      })
      .where(and(eq(observationItems.id, item.id), eq(observationItems.reviewStatus, "flagged")))
      .returning({ id: observationItems.id });
    if (updated.length !== 1) {
      throw new Error(`observation item ${item.id} was no longer flagged`);
    }
  }
  return { clear: decided.clear.map(toFlag), keep: decided.keep };
}

function toFlag(item: SamePriceFlag): SamePriceFlag {
  return {
    id: item.id,
    labSlug: item.labSlug,
    modelSlug: item.modelSlug,
    observationId: item.observationId,
  };
}

async function decideSamePriceFlags(db: EvidenceDb): Promise<{
  clear: Array<SamePriceFlag & { fetchedAt: Date }>;
  keep: SamePriceFlag[];
}> {
  const waiting = await listFlaggedOfficialItems(db);
  const openPrices = await loadOpenPrices(
    db,
    waiting.map((item) => item.offeringId),
  );
  const clear: Array<SamePriceFlag & { fetchedAt: Date }> = [];
  const keep: SamePriceFlag[] = [];

  for (const item of waiting) {
    const nextRows = readRows(item.parsedData);
    const open = openPrices.get(item.offeringId);
    const unchanged =
      nextRows !== null &&
      open !== undefined &&
      open.firstSeenAt.getTime() <= item.fetchedAt.getTime() &&
      trackedPriceUnchanged({
        nextRows,
        modelSlug: item.modelSlug,
        fetchedAt: item.fetchedAt,
        open: open.components,
      });
    const flag = {
      id: item.id,
      labSlug: item.labSlug,
      modelSlug: item.modelSlug,
      observationId: item.observationId,
    };
    if (unchanged) {
      clear.push({ ...flag, fetchedAt: item.fetchedAt });
    } else {
      keep.push(flag);
    }
  }

  return { clear, keep };
}

async function listFlaggedOfficialItems(db: EvidenceDb): Promise<WaitingItem[]> {
  return db
    .select({
      id: observationItems.id,
      labSlug: labs.slug,
      modelSlug: models.slug,
      observationId: observations.id,
      offeringId: observationItems.offeringId,
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
    })
    .from(observationItems)
    .innerJoin(observations, eq(observationItems.observationId, observations.id))
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .innerJoin(offerings, eq(observationItems.offeringId, offerings.id))
    .innerJoin(models, eq(offerings.modelId, models.id))
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(and(eq(observationItems.reviewStatus, "flagged"), eq(sources.type, "official")))
    .orderBy(observationItems.id);
}

async function loadOpenPrices(
  db: EvidenceDb,
  offeringIds: readonly number[],
): Promise<Map<number, OpenPrice>> {
  const open = new Map<number, OpenPrice>();
  if (offeringIds.length === 0) {
    return open;
  }

  const versions = await db
    .select({
      id: priceVersions.id,
      offeringId: priceVersions.offeringId,
      firstSeenAt: priceVersions.firstSeenAt,
    })
    .from(priceVersions)
    .where(
      and(
        inArray(priceVersions.offeringId, [...offeringIds]),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    );

  const versionIdsByOffering = new Map<number, { id: number; firstSeenAt: Date }[]>();
  for (const version of versions) {
    const list = versionIdsByOffering.get(version.offeringId) ?? [];
    list.push({ id: version.id, firstSeenAt: version.firstSeenAt });
    versionIdsByOffering.set(version.offeringId, list);
  }

  const singleVersionIds: number[] = [];
  for (const ids of versionIdsByOffering.values()) {
    const version = ids.length === 1 ? ids[0] : undefined;
    if (version !== undefined) {
      singleVersionIds.push(version.id);
    }
  }
  if (singleVersionIds.length === 0) {
    return open;
  }

  const components = await db
    .select({
      priceVersionId: priceComponents.priceVersionId,
      dimension: priceComponents.dimension,
      unit: priceComponents.unit,
      amount: priceComponents.amount,
      condition: priceComponents.condition,
    })
    .from(priceComponents)
    .where(inArray(priceComponents.priceVersionId, singleVersionIds));

  const byVersion = new Map<number, OpenPriceComponent[]>();
  for (const component of components) {
    const list = byVersion.get(component.priceVersionId) ?? [];
    list.push({
      dimension: component.dimension,
      unit: component.unit,
      amount: component.amount,
      condition: component.condition,
    });
    byVersion.set(component.priceVersionId, list);
  }

  for (const [offeringId, ids] of versionIdsByOffering) {
    const version = ids.length === 1 ? ids[0] : undefined;
    if (version === undefined) {
      continue;
    }
    const rows = byVersion.get(version.id);
    if (rows !== undefined && rows.length > 0) {
      open.set(offeringId, { firstSeenAt: version.firstSeenAt, components: rows });
    }
  }
  return open;
}

function readRows(parsedData: unknown): NormalizedPrice[] | null {
  if (parsedData === null || typeof parsedData !== "object" || !("rows" in parsedData)) {
    return null;
  }
  const rows = parsedData.rows;
  if (!Array.isArray(rows)) {
    return null;
  }
  const parsed: NormalizedPrice[] = [];
  for (const row of rows) {
    const result = normalizedPriceSchema.safeParse(row);
    if (!result.success) {
      return null;
    }
    parsed.push(result.data);
  }
  return parsed;
}
