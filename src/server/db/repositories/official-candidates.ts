import { and, asc, desc, eq } from "drizzle-orm";
import type { ReviewQueueDb } from "@/server/db/repositories/review-queue";
import { candidateModels, labs, observations, sources } from "@/server/db/schema";

/**
 * Read door for official new-model cards.
 *
 * This file only runs SELECT. Add and publish lives in
 * publishNewOfficialModel(). Reject lives in rejectCandidateModel().
 * The list is pending cards whose source is an official page.
 * A witness card stays on /review/signals.
 */

export type OfficialCandidateListRead = {
  id: number;
  status: string;
  kind: string;
  labName: string;
  modelName: string;
  sourceUrl: string;
  firstSeenAt: Date;
};

export type OfficialCandidateDetailRead = {
  id: number;
  status: string;
  kind: string;
  hint: string | null;
  labName: string;
  modelName: string;
  modelSlug: string;
  sourceUrl: string;
  firstSeenAt: Date;
  fetchedAt: Date | null;
  parsedData: unknown;
};

/**
 * True when this id is a candidate for an official page.
 *
 * The request proxy calls this before the page shell starts. A witness
 * card is absent here, so its id does not open this page.
 */
export async function hasOfficialCandidate(db: ReviewQueueDb, id: number): Promise<boolean> {
  const rows = await db
    .select({ id: candidateModels.id })
    .from(candidateModels)
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .where(and(eq(candidateModels.id, id), eq(sources.type, "official")))
    .limit(1);
  return rows.length > 0;
}

export async function listPendingOfficialCandidates(
  db: ReviewQueueDb,
): Promise<OfficialCandidateListRead[]> {
  return db
    .select({
      id: candidateModels.id,
      status: candidateModels.status,
      kind: candidateModels.kind,
      labName: labs.name,
      modelName: candidateModels.rawName,
      sourceUrl: sources.url,
      firstSeenAt: candidateModels.firstSeenAt,
    })
    .from(candidateModels)
    .innerJoin(labs, eq(labs.id, candidateModels.labId))
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .where(and(eq(candidateModels.status, "pending_review"), eq(sources.type, "official")))
    .orderBy(asc(labs.name), asc(candidateModels.rawSlug));
}

export async function findOfficialCandidate(
  db: ReviewQueueDb,
  id: number,
): Promise<OfficialCandidateDetailRead | null> {
  const rows = await db
    .select({
      id: candidateModels.id,
      status: candidateModels.status,
      kind: candidateModels.kind,
      hint: candidateModels.hint,
      labName: labs.name,
      modelName: candidateModels.rawName,
      modelSlug: candidateModels.rawSlug,
      sourceUrl: sources.url,
      sourceId: candidateModels.sourceId,
      firstSeenAt: candidateModels.firstSeenAt,
    })
    .from(candidateModels)
    .innerJoin(labs, eq(labs.id, candidateModels.labId))
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .where(and(eq(candidateModels.id, id), eq(sources.type, "official")))
    .limit(1);
  const card = rows[0];
  if (card === undefined) {
    return null;
  }

  const snapshots = await db
    .select({
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
    })
    .from(observations)
    .where(eq(observations.sourceId, card.sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  const snapshot = snapshots[0];
  return {
    id: card.id,
    status: card.status,
    kind: card.kind,
    hint: card.hint,
    labName: card.labName,
    modelName: card.modelName,
    modelSlug: card.modelSlug,
    sourceUrl: card.sourceUrl,
    firstSeenAt: card.firstSeenAt,
    fetchedAt: snapshot?.fetchedAt ?? null,
    parsedData: snapshot?.parsedData ?? null,
  };
}
