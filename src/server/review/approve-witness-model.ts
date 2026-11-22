import { and, eq } from "drizzle-orm";
import { reviewerId } from "@/core/auth/review-access";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { candidateModels, labs, sources } from "@/server/db/schema";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";

/**
 * Add one model from a LiteLLM or OpenRouter new-name card.
 *
 * The card, the model, the global official offering, and the
 * aggregator_slug alias share one transaction. A refusal rolls all of
 * them back, and the card stays pending. There is no price and no
 * observation item. publishPriceVersion() is not called.
 *
 * reviewedAt is passed in. This file does not call new Date().
 * A name that is missing from the official page still fails the next
 * visit. This function does not change that check.
 */

const WITNESS_LABS = new Set(["anthropic", "openai", "google"]);
const WITNESS_URLS = new Set([LITELLM_COST_MAP_URL, OPENROUTER_MODELS_URL]);

export type ApproveWitnessModelInput = {
  candidateId: number;
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export type ApproveWitnessModelResult = {
  modelId: number;
};

export async function approveWitnessModel(
  db: SignalDb,
  input: ApproveWitnessModelInput,
): Promise<ApproveWitnessModelResult> {
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
    if (card.sourceType !== "aggregator") {
      throw new ReviewRefusal(`source type ${card.sourceType} is not a witness`);
    }
    if (!WITNESS_URLS.has(card.sourceUrl)) {
      throw new ReviewRefusal("source url is not LiteLLM or OpenRouter");
    }
    if (!WITNESS_LABS.has(card.labSlug)) {
      throw new ReviewRefusal(`lab ${card.labSlug} is not a witness lab`);
    }
    assertPublicModelSlug(card.rawSlug);

    const catalog = createCatalogRepository(tx);
    const existing = await catalog.findModelByLabAndSlug(card.labId, card.rawSlug);
    if (existing !== null) {
      throw new ReviewRefusal(`model ${card.rawSlug} is already tracked`);
    }
    const takenAlias = await catalog.findModelAlias(card.rawSlug);
    if (takenAlias !== null) {
      throw new ReviewRefusal(`witness name ${card.rawSlug} is already an alias`);
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
    await catalog.insertModelAlias({
      modelId: model.id,
      alias: card.rawSlug,
      kind: "aggregator_slug",
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
      throw new ReviewRefusal(`candidate model ${card.id} is not pending`);
    }
    return { modelId: model.id };
  });
}

async function loadCard(db: SignalDb, candidateId: number) {
  const rows = await db
    .select({
      id: candidateModels.id,
      status: candidateModels.status,
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
