import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { reviewerId } from "@/core/auth/review-access";
import {
  componentsForConfirm,
  ReviewRefusal,
  sameConfirmPrice,
  type ConfirmPriceComponent,
} from "@/core/review/confirm-price";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import {
  fetchLog,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";

/**
 * Confirm or reject one flagged observation item.
 *
 * Confirm sets review_status to confirmed, then calls publishPriceVersion()
 * when the parsed rows are a new price or the first price. The status has
 * to change first, because that function refuses a flagged item. Both
 * writes share this transaction. A throw rolls the stamp back.
 *
 * The same parsed price is not a new period. Confirm still records the
 * reviewer, and the open price stays open. Reject records the reviewer
 * and does not publish.
 *
 * reviewedAt is passed in. This file does not call new Date().
 */

export type DecideReviewItemInput = {
  observationItemId: number;
  decision: "confirm" | "reject";
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export type DecideReviewItemResult =
  | { decision: "rejected" }
  | { decision: "confirmed"; published: false }
  | { decision: "confirmed"; published: true; priceVersionId: number };

type LockedItem = {
  id: number;
  reviewStatus: string;
  groundingResult: unknown;
  offeringId: number;
  fetchedAt: Date;
  parsedData: unknown;
  sourceId: number;
  sourceType: string;
  modelSlug: string;
};

type StoredComponent = {
  dimension: string;
  unit: string;
  amount: string;
  condition: unknown;
};

export async function decideReviewItem(
  db: PublishDb,
  input: DecideReviewItemInput,
): Promise<DecideReviewItemResult> {
  const observationItemId = readItemId(input.observationItemId);
  const note = readNote(input.note);
  const reviewedBy = readReviewer(input.reviewedBy);
  const reviewedAt = readReviewedAt(input.reviewedAt);
  if (input.decision !== "confirm" && input.decision !== "reject") {
    throw new ReviewRefusal("review decision is not confirm or reject");
  }
  const decision = input.decision;

  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: observationItems.id })
      .from(observationItems)
      .where(eq(observationItems.id, observationItemId))
      .limit(1)
      .for("update");
    if (locked.length === 0) {
      throw new ReviewRefusal(`observation item ${observationItemId} does not exist`);
    }

    const item = await loadItem(tx, observationItemId);
    if (item.reviewStatus !== "flagged") {
      throw new ReviewRefusal(
        `observation item ${item.id} has review_status ${item.reviewStatus}; only flagged can be decided`,
      );
    }
    if (item.sourceType !== "official") {
      throw new ReviewRefusal(`source type ${item.sourceType} is not official`);
    }
    if (item.groundingResult !== null) {
      throw new ReviewRefusal("grounding_result has no reader yet");
    }

    if (decision === "reject") {
      await stamp(tx, item.id, "rejected", { note, reviewedBy, reviewedAt });
      return { decision: "rejected" };
    }

    await assertNoEarlierFlaggedItem(tx, item);

    const components = componentsForConfirm(item.parsedData, item.modelSlug);
    const openVersions = await findOpenVersions(tx, item.offeringId);
    if (openVersions.length > 1) {
      throw new ReviewRefusal(
        `offering ${item.offeringId} has more than one open price version`,
      );
    }
    const open = openVersions[0];
    if (open === undefined) {
      await stamp(tx, item.id, "confirmed", { note, reviewedBy, reviewedAt });
      const published = await publishPriceVersion(tx, {
        observationItemId: item.id,
        components,
        firstSeenAt: item.fetchedAt,
      });
      return {
        decision: "confirmed",
        published: true,
        priceVersionId: published.priceVersionId,
      };
    }

    const openComponents = await componentsFor(tx, open.id);
    if (sameConfirmPrice(components, openComponents)) {
      await stamp(tx, item.id, "confirmed", { note, reviewedBy, reviewedAt });
      return { decision: "confirmed", published: false };
    }

    const previousLastSeenAt = await previousSighting(tx, item, open.firstSeenAt, openComponents);
    await stamp(tx, item.id, "confirmed", { note, reviewedBy, reviewedAt });
    const published = await publishPriceVersion(tx, {
      observationItemId: item.id,
      components,
      firstSeenAt: item.fetchedAt,
      previousLastSeenAt,
    });
    return {
      decision: "confirmed",
      published: true,
      priceVersionId: published.priceVersionId,
    };
  });
}

async function loadItem(db: PublishDb, observationItemId: number): Promise<LockedItem> {
  const rows = await db
    .select({
      id: observationItems.id,
      reviewStatus: observationItems.reviewStatus,
      groundingResult: observationItems.groundingResult,
      offeringId: observationItems.offeringId,
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
      sourceId: observations.sourceId,
      sourceType: sources.type,
      modelSlug: models.slug,
    })
    .from(observationItems)
    .innerJoin(observations, eq(observations.id, observationItems.observationId))
    .innerJoin(sources, eq(sources.id, observations.sourceId))
    .innerJoin(offerings, eq(offerings.id, observationItems.offeringId))
    .innerJoin(models, eq(models.id, offerings.modelId))
    .where(eq(observationItems.id, observationItemId))
    .limit(1);
  const item = rows[0];
  if (item === undefined) {
    throw new ReviewRefusal(`observation item ${observationItemId} does not exist`);
  }
  return item;
}

async function assertNoEarlierFlaggedItem(db: PublishDb, item: LockedItem): Promise<void> {
  const earlier = await db
    .select({ id: observationItems.id })
    .from(observationItems)
    .innerJoin(observations, eq(observations.id, observationItems.observationId))
    .where(
      and(
        eq(observationItems.offeringId, item.offeringId),
        eq(observationItems.reviewStatus, "flagged"),
        lt(observations.fetchedAt, item.fetchedAt),
      ),
    )
    .limit(1);
  if (earlier.length > 0) {
    throw new ReviewRefusal("an earlier flagged item for this offering is still waiting");
  }
}

/**
 * The last time this source still showed the open price.
 *
 * That is the latest earlier snapshot whose rows for this model match
 * the open components. An unchanged check counts only when it happened
 * after that snapshot and before the next snapshot. A later unchanged
 * check can belong to a different page, so it is not used. No matching
 * snapshot throws. This function does not invent a time.
 */
async function previousSighting(
  db: PublishDb,
  item: LockedItem,
  openFirstSeenAt: Date,
  openComponents: readonly StoredComponent[],
): Promise<Date> {
  const earlier = await db
    .select({
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
    })
    .from(observations)
    .where(
      and(eq(observations.sourceId, item.sourceId), lt(observations.fetchedAt, item.fetchedAt)),
    )
    .orderBy(desc(observations.fetchedAt));

  let matchedAt: Date | undefined;
  for (const observation of earlier) {
    if (observation.fetchedAt.getTime() < openFirstSeenAt.getTime()) {
      continue;
    }
    if (!snapshotMatchesOpen(observation.parsedData, item.modelSlug, openComponents)) {
      continue;
    }
    matchedAt = observation.fetchedAt;
    break;
  }
  if (matchedAt === undefined) {
    throw new ReviewRefusal("no earlier snapshot matches the open price");
  }

  const nextSnapshot = await db
    .select({ fetchedAt: observations.fetchedAt })
    .from(observations)
    .where(and(eq(observations.sourceId, item.sourceId), gt(observations.fetchedAt, matchedAt)))
    .orderBy(asc(observations.fetchedAt))
    .limit(1);
  const windowEnd = nextSnapshot[0]?.fetchedAt ?? item.fetchedAt;

  const unchanged = await db
    .select({ fetchedAt: fetchLog.fetchedAt })
    .from(fetchLog)
    .where(
      and(
        eq(fetchLog.sourceId, item.sourceId),
        eq(fetchLog.outcome, "unchanged"),
        gt(fetchLog.fetchedAt, matchedAt),
        lt(fetchLog.fetchedAt, windowEnd),
      ),
    )
    .orderBy(desc(fetchLog.fetchedAt))
    .limit(1);

  const previousLastSeenAt = unchanged[0]?.fetchedAt ?? matchedAt;
  if (previousLastSeenAt.getTime() >= item.fetchedAt.getTime()) {
    throw new ReviewRefusal("previous sighting is not before this snapshot");
  }
  if (previousLastSeenAt.getTime() < openFirstSeenAt.getTime()) {
    throw new ReviewRefusal("previous sighting is before the open price started");
  }
  return previousLastSeenAt;
}

function snapshotMatchesOpen(
  parsedData: unknown,
  modelSlug: string,
  openComponents: readonly StoredComponent[],
): boolean {
  let components: ConfirmPriceComponent[];
  try {
    components = componentsForConfirm(parsedData, modelSlug);
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return false;
    }
    throw error;
  }
  return sameConfirmPrice(components, openComponents);
}

async function findOpenVersions(
  db: PublishDb,
  offeringId: number,
): Promise<{ id: number; firstSeenAt: Date }[]> {
  return db
    .select({
      id: priceVersions.id,
      firstSeenAt: priceVersions.firstSeenAt,
    })
    .from(priceVersions)
    .where(
      and(
        eq(priceVersions.offeringId, offeringId),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    );
}

async function componentsFor(db: PublishDb, priceVersionId: number): Promise<StoredComponent[]> {
  return db
    .select({
      dimension: priceComponents.dimension,
      unit: priceComponents.unit,
      amount: priceComponents.amount,
      condition: priceComponents.condition,
    })
    .from(priceComponents)
    .where(eq(priceComponents.priceVersionId, priceVersionId));
}

async function stamp(
  db: PublishDb,
  observationItemId: number,
  reviewStatus: "confirmed" | "rejected",
  review: { note: string; reviewedBy: string; reviewedAt: Date },
): Promise<void> {
  const updated = await db
    .update(observationItems)
    .set({
      reviewStatus,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt,
      reviewNote: review.note,
    })
    .where(
      and(
        eq(observationItems.id, observationItemId),
        eq(observationItems.reviewStatus, "flagged"),
      ),
    )
    .returning({ id: observationItems.id });
  if (updated.length !== 1) {
    throw new ReviewRefusal(`observation item ${observationItemId} was no longer flagged`);
  }
}

function readItemId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ReviewRefusal("observation item id must be a whole number");
  }
  return value;
}

function readNote(value: string): string {
  if (typeof value !== "string") {
    throw new ReviewRefusal("review note is empty");
  }
  const note = value.trim();
  if (note.length === 0) {
    throw new ReviewRefusal("review note is empty");
  }
  return note;
}

function readReviewer(value: string): string {
  if (typeof value !== "string") {
    throw new ReviewRefusal("reviewed_by is not a reviewer id");
  }
  const separator = value.indexOf(":");
  if (separator <= 0) {
    throw new ReviewRefusal("reviewed_by is not a reviewer id");
  }
  try {
    return reviewerId(value.slice(0, separator), value.slice(separator + 1));
  } catch (error) {
    if (error instanceof Error) {
      throw new ReviewRefusal(`reviewed_by is not a reviewer id. ${error.message}`);
    }
    throw new ReviewRefusal("reviewed_by is not a reviewer id");
  }
}

function readReviewedAt(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ReviewRefusal("reviewedAt must be a valid date");
  }
  return value;
}
