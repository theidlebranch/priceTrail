import { and, desc, eq } from "drizzle-orm";
import { reviewerId } from "@/core/auth/review-access";
import { componentsForConfirm, ReviewRefusal } from "@/core/review/confirm-price";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  candidateModels,
  observationItems,
  observations,
  sources,
} from "@/server/db/schema";

/**
 * Add one official-page model and publish its current price.
 *
 * The card, the model, the offering, the confirmed item, and the price
 * share one transaction. A refusal rolls all of them back, and the card
 * stays pending. The price is the segment that includes reviewedAt.
 * announced_on stays empty. This is the first price for the new offering.
 *
 * reviewedAt is passed in. This file does not call new Date().
 */

export type PublishNewOfficialModelInput = {
  candidateId: number;
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export type PublishNewOfficialModelResult = {
  modelId: number;
  priceVersionId: number;
};

export async function publishNewOfficialModel(
  db: PublishDb,
  input: PublishNewOfficialModelInput,
): Promise<PublishNewOfficialModelResult> {
  const candidateId = readCandidateId(input.candidateId);
  const note = readNote(input.note);
  const reviewedBy = readReviewer(input.reviewedBy);
  const reviewedAt = readReviewedAt(input.reviewedAt);

  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: candidateModels.id })
      .from(candidateModels)
      .where(eq(candidateModels.id, candidateId))
      .limit(1)
      .for("update");
    if (locked.length === 0) {
      throw new ReviewRefusal("candidate model was not found");
    }

    const card = await loadCard(tx, candidateId);
    if (card.status !== "pending_review") {
      throw new ReviewRefusal(`candidate model ${card.id} is ${card.status}`);
    }
    if (card.sourceType !== "official") {
      throw new ReviewRefusal(`source type ${card.sourceType} is not official`);
    }
    assertPublicModelSlug(card.rawSlug);

    const snapshot = await latestSnapshot(tx, card.sourceId);
    const components = componentsForConfirm(snapshot.parsedData, card.rawSlug, reviewedAt);
    const catalog = createCatalogRepository(tx);
    const existing = await catalog.findModelByLabAndSlug(card.labId, card.rawSlug);
    if (existing !== null) {
      throw new ReviewRefusal(`model ${card.rawSlug} is already tracked`);
    }

    const model = await catalog.insertModel({
      labId: card.labId,
      name: card.rawName,
      slug: card.rawSlug,
    });
    const offering = await catalog.insertOffering({
      modelId: model.id,
      platform: "official-api",
    });
    const item = requireInsertedRow(
      await tx
        .insert(observationItems)
        .values({
          observationId: snapshot.id,
          offeringId: offering.id,
          reviewStatus: "confirmed",
          reviewedBy,
          reviewedAt,
          reviewNote: note,
        })
        .returning({ id: observationItems.id }),
      "insert observation item",
    );
    const published = await publishPriceVersion(tx, {
      observationItemId: item.id,
      components,
      firstSeenAt: snapshot.fetchedAt,
    });
    const updated = await tx
      .update(candidateModels)
      .set({
        status: "approved",
        resolvedModelId: model.id,
        reviewedBy,
        reviewedAt,
        reviewNote: note,
      })
      .where(and(eq(candidateModels.id, card.id), eq(candidateModels.status, "pending_review")))
      .returning({ id: candidateModels.id });
    if (updated.length !== 1) {
      throw new ReviewRefusal(`candidate model ${card.id} was no longer pending`);
    }
    return { modelId: model.id, priceVersionId: published.priceVersionId };
  });
}

async function loadCard(db: PublishDb, candidateId: number) {
  const rows = await db
    .select({
      id: candidateModels.id,
      status: candidateModels.status,
      labId: candidateModels.labId,
      rawName: candidateModels.rawName,
      rawSlug: candidateModels.rawSlug,
      sourceId: candidateModels.sourceId,
      sourceType: sources.type,
    })
    .from(candidateModels)
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .where(eq(candidateModels.id, candidateId))
    .limit(1);
  const card = rows[0];
  if (card === undefined) {
    throw new ReviewRefusal("candidate model was not found");
  }
  return card;
}

async function latestSnapshot(db: PublishDb, sourceId: number) {
  const rows = await db
    .select({
      id: observations.id,
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
    })
    .from(observations)
    .where(eq(observations.sourceId, sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  const snapshot = rows[0];
  if (snapshot === undefined) {
    throw new ReviewRefusal("official page has no stored snapshot");
  }
  return snapshot;
}

function assertPublicModelSlug(slug: string): void {
  if (slug.length === 0 || slug.includes("/") || slug === "." || slug === "..") {
    throw new ReviewRefusal(`model slug is empty, contains a slash, or is "." or ".."`);
  }
}

function readCandidateId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ReviewRefusal("candidate id must be a whole number");
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
