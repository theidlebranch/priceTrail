import { and, eq } from "drizzle-orm";
import { reviewerId } from "@/core/auth/review-access";
import { ReviewRefusal } from "@/core/review/confirm-price";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { candidateModels, labs, sources } from "@/server/db/schema";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { approveWitnessModel, type ApproveWitnessModelResult } from "@/server/review/approve-witness-model";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { isOfficialModelListUrl } from "@/server/sources/official-model-list";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";

/**
 * Approve a new-name card from a witness or an official model list.
 *
 * LiteLLM and OpenRouter still go through approveWitnessModel(), which
 * keeps its own URL check. The three platform_api lists add the model
 * and one global official-api offering, and they do not add an
 * aggregator_slug alias. A retirement card is not approved here.
 * A blank note writes nothing. This file does not call
 * publishPriceVersion() and does not call new Date().
 */

const WITNESS_URLS = new Set([LITELLM_COST_MAP_URL, OPENROUTER_MODELS_URL]);
const LABS = new Set(["anthropic", "openai", "google"]);

export type ApprovePlatformModelInput = {
  candidateId: number;
  note: string;
  reviewedBy: string;
  reviewedAt: Date;
};

export async function approveNewName(
  db: SignalDb,
  input: ApprovePlatformModelInput,
): Promise<ApproveWitnessModelResult> {
  readDecision(input);
  const card = await peekCard(db, input.candidateId);
  if (card.sourceType === "aggregator" && WITNESS_URLS.has(card.sourceUrl)) {
    return approveWitnessModel(db, input);
  }
  if (card.sourceType === "platform_api" && isOfficialModelListUrl(card.sourceUrl)) {
    return approvePlatformModel(db, input);
  }
  throw new ReviewRefusal("source url is not LiteLLM, OpenRouter, or an official model list");
}

export async function approvePlatformModel(
  db: SignalDb,
  input: ApprovePlatformModelInput,
): Promise<ApproveWitnessModelResult> {
  const candidateId = readDecision(input).candidateId;
  const note = input.note.trim();
  const reviewedBy = readReviewer(input.reviewedBy);
  const reviewedAt = input.reviewedAt;

  return db.transaction(async (tx) => {
    await lockCard(tx, candidateId);
    const card = await loadCard(tx, candidateId);
    if (card.status !== "pending_review") {
      throw new ReviewRefusal(`candidate model ${card.id} is not pending`);
    }
    if (card.kind !== "new_name") {
      throw new ReviewRefusal("retirement cards use accept");
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
    if (existing !== null) {
      throw new ReviewRefusal(`model ${card.rawSlug} is already tracked`);
    }
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
    await markApproved(tx, card.id, model.id, reviewedBy, reviewedAt, note);
    return { modelId: model.id };
  });
}

async function peekCard(db: SignalDb, candidateId: number) {
  const rows = await db
    .select({
      sourceType: sources.type,
      sourceUrl: sources.url,
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

async function lockCard(tx: SignalDb, candidateId: number): Promise<void> {
  const locked = await tx
    .select({ id: candidateModels.id })
    .from(candidateModels)
    .where(eq(candidateModels.id, candidateId))
    .limit(1)
    .for("update");
  if (locked.length === 0) {
    throw new ReviewRefusal("candidate model was not found");
  }
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

async function markApproved(
  tx: SignalDb,
  candidateId: number,
  modelId: number,
  reviewedBy: string,
  reviewedAt: Date,
  note: string,
): Promise<void> {
  const updated = await tx
    .update(candidateModels)
    .set({
      status: "approved",
      resolvedModelId: modelId,
      reviewedBy,
      reviewedAt,
      reviewNote: note,
    })
    .where(and(eq(candidateModels.id, candidateId), eq(candidateModels.status, "pending_review")))
    .returning({ id: candidateModels.id });
  if (updated.length !== 1) {
    throw new ReviewRefusal(`candidate model ${candidateId} is not pending`);
  }
}

function assertPublicModelSlug(slug: string): void {
  if (slug.length === 0 || slug.includes("/") || slug === "." || slug === "..") {
    throw new ReviewRefusal(`model slug is empty, contains a slash, or is "." or ".."`);
  }
}

function readDecision(input: ApprovePlatformModelInput): { candidateId: number } {
  if (!Number.isInteger(input.candidateId) || input.candidateId <= 0) {
    throw new ReviewRefusal("candidate id must be a whole number");
  }
  if (typeof input.note !== "string" || input.note.trim().length === 0) {
    throw new ReviewRefusal("review note is empty");
  }
  readReviewer(input.reviewedBy);
  if (!(input.reviewedAt instanceof Date) || Number.isNaN(input.reviewedAt.getTime())) {
    throw new ReviewRefusal("reviewedAt must be a valid date");
  }
  return { candidateId: input.candidateId };
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
