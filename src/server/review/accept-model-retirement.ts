import { and, eq } from "drizzle-orm";
import { reviewerId } from "@/core/auth/review-access";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { candidateModels, labs, models, sources } from "@/server/db/schema";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { isOfficialModelListUrl } from "@/server/sources/official-model-list";

/**
 * Accept a retirement hint from an official model list.
 *
 * The card, and the model when we do not track it yet, share one
 * transaction. Accept sets deprecated_at to the review time passed in.
 * It creates one global official-api offering for a new model and does
 * not add an alias. Reject is a separate function and leaves the model
 * as it is. A blank note writes nothing. A second decision throws.
 * This file does not call publishPriceVersion() and does not call new Date().
 */

const LABS = new Set(["anthropic", "openai", "google"]);

export type AcceptModelRetirementInput = {
  candidateId: number;
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export async function acceptModelRetirement(
  db: SignalDb,
  input: AcceptModelRetirementInput,
): Promise<{ modelId: number }> {
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
      throw new ReviewRefusal(`candidate model ${card.id} is not pending`);
    }
    if (card.kind !== "retirement") {
      throw new ReviewRefusal("new-name cards use approve");
    }
    if (card.sourceType !== "platform_api" || !isOfficialModelListUrl(card.sourceUrl)) {
      throw new ReviewRefusal("source url is not an official model list");
    }
    if (!LABS.has(card.labSlug)) {
      throw new ReviewRefusal(`lab ${card.labSlug} is not a model-list lab`);
    }
    assertPublicModelSlug(card.rawSlug);

    const catalog = createCatalogRepository(tx);
    const existing = await catalog.findModelByLabAndSlug(card.labId, card.rawSlug);
    const modelId = existing?.id ?? (await createRetiredModel(tx, card, reviewedAt)).id;
    if (existing !== null) {
      await tx.update(models).set({ deprecatedAt: reviewedAt }).where(eq(models.id, existing.id));
    }

    const updated = await tx
      .update(candidateModels)
      .set({
        status: "approved",
        resolvedModelId: modelId,
        reviewedBy,
        reviewedAt,
        reviewNote: note,
      })
      .where(and(eq(candidateModels.id, card.id), eq(candidateModels.status, "pending_review")))
      .returning({ id: candidateModels.id });
    if (updated.length !== 1) {
      throw new ReviewRefusal(`candidate model ${card.id} is not pending`);
    }
    return { modelId };
  });
}

async function createRetiredModel(
  tx: SignalDb,
  card: { labId: number; rawName: string; rawSlug: string },
  reviewedAt: Date,
): Promise<{ id: number }> {
  const catalog = createCatalogRepository(tx);
  const takenAlias = await catalog.findModelAlias(card.rawSlug);
  if (takenAlias !== null) {
    throw new ReviewRefusal(`model name ${card.rawSlug} is already an alias`);
  }
  const model = await catalog.insertModel({
    labId: card.labId,
    name: card.rawName,
    slug: card.rawSlug,
  });
  await catalog.insertOffering({
    modelId: model.id,
    platform: "official-api",
  });
  await tx.update(models).set({ deprecatedAt: reviewedAt }).where(eq(models.id, model.id));
  return model;
}

async function loadCard(db: SignalDb, candidateId: number) {
  const rows = await db
    .select({
      id: candidateModels.id,
      status: candidateModels.status,
      kind: candidateModels.kind,
      labId: candidateModels.labId,
      labSlug: labs.slug,
      rawName: candidateModels.rawName,
      rawSlug: candidateModels.rawSlug,
      sourceType: sources.type,
      sourceUrl: sources.url,
    })
    .from(candidateModels)
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .innerJoin(labs, eq(labs.id, candidateModels.labId))
    .where(eq(candidateModels.id, candidateId))
    .limit(1);
  const card = rows[0];
  if (card === undefined) {
    throw new ReviewRefusal("candidate model was not found");
  }
  return card;
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
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReviewRefusal("review note is empty");
  }
  return value.trim();
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
