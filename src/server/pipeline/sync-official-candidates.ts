import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { VisitAlertCard } from "@/core/alerts/site-alert";
import {
  planOfficialCandidateChanges,
  type OfficialCandidatePlan,
  type PricingVisit,
  type StoredOfficialCard,
} from "@/core/pricing/official-candidates";
import { normalizedPriceSchema } from "@/core/pricing/shape";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { candidateModels, fetchLog, labs, models, observations } from "@/server/db/schema";

/**
 * Open cards from the latest stored pricing snapshot.
 *
 * A new name is an untracked slug whose note does not say retired or
 * deprecated. That note opens a retirement card instead. A tracked model
 * missing from two good visits opens a gone card. A bad visit does not
 * open either of those, and it does not reset a miss. An approved
 * new-name card stays, and a later retirement or gone card is a new
 * row. A pending new-name card becomes the retirement card. A rejected
 * card does not come back. A rejected new-name card also blocks a
 * retirement card. An observation that is not a price list is skipped
 * unless a fetch log points at it. The returned cards are the ones this
 * call inserted or turned into a retirement. This does not call
 * publishPriceVersion().
 */

const storedSnapshotSchema = z.object({
  rows: z.array(normalizedPriceSchema),
  warnings: z.array(z.string()),
});

export async function syncOfficialCandidates(
  db: EvidenceDb,
  input: { sourceId: number; labSlug: string },
): Promise<VisitAlertCard[]> {
  const snapshot = await latestSnapshot(db, input.sourceId);
  if (snapshot === null) {
    return [];
  }

  const lab = await findLab(db, input.labSlug);
  const tracked = await trackedModels(db, lab.id);
  const stored = await storedCards(db, input.sourceId);
  const goodVisit = await latestVisitIsGood(db, input.sourceId);
  const plan = planOfficialCandidateChanges({
    rows: snapshot.rows,
    tracked,
    visits: goodVisit ? await pricingVisits(db, input.sourceId) : [],
    goodVisit,
    stored,
  });
  if (plan.inserts.length === 0 && plan.conversions.length === 0) {
    return [];
  }

  const openedAt = goodVisit ? await newestFetchedAt(db, input.sourceId) : snapshot.fetchedAt;
  const conversions: OfficialCandidatePlan["conversions"] = [];
  for (const conversion of plan.conversions) {
    const updated = await db
      .update(candidateModels)
      .set({
        kind: "retirement",
        hint: conversion.hint,
        rawName: conversion.rawName,
        firstSeenAt: snapshot.fetchedAt,
      })
      .where(
        and(
          eq(candidateModels.id, conversion.id),
          eq(candidateModels.sourceId, input.sourceId),
          eq(candidateModels.kind, "new_name"),
          eq(candidateModels.status, "pending_review"),
        ),
      )
      .returning({ id: candidateModels.id });
    if (updated.length > 0) {
      conversions.push(conversion);
    }
  }
  const openedPlan = { inserts: plan.inserts, conversions };
  if (plan.inserts.length === 0) {
    return openedCards(openedPlan);
  }

  await db.insert(candidateModels).values(
    plan.inserts.map((card) => ({
      labId: lab.id,
      rawName: card.rawName,
      rawSlug: card.rawSlug,
      sourceId: input.sourceId,
      firstSeenAt: card.kind === "gone" ? openedAt : snapshot.fetchedAt,
      kind: card.kind,
      hint: card.hint,
    })),
  );
  return openedCards(openedPlan);
}

function openedCards(plan: OfficialCandidatePlan): VisitAlertCard[] {
  return [
    ...plan.conversions.map((conversion) => ({
      kind: "retirement" as const,
      modelName: conversion.rawName,
      modelSlug: conversion.rawSlug,
    })),
    ...plan.inserts.map((card) => ({
      kind: card.kind,
      modelName: card.rawName,
      modelSlug: card.rawSlug,
    })),
  ];
}

async function latestSnapshot(
  db: EvidenceDb,
  sourceId: number,
): Promise<{ fetchedAt: Date; rows: z.infer<typeof storedSnapshotSchema>["rows"] } | null> {
  const rows = await db
    .select({
      fetchedAt: observations.fetchedAt,
      parsedData: observations.parsedData,
    })
    .from(observations)
    .where(eq(observations.sourceId, sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id));
  for (const row of rows) {
    const parsed = storedSnapshotSchema.safeParse(row.parsedData);
    if (!parsed.success) {
      continue;
    }
    return { fetchedAt: row.fetchedAt, rows: parsed.data.rows };
  }
  return null;
}

async function findLab(db: EvidenceDb, labSlug: string): Promise<{ id: number }> {
  const rows = await db
    .select({ id: labs.id })
    .from(labs)
    .where(eq(labs.slug, labSlug))
    .limit(1);
  const lab = rows[0];
  if (lab === undefined) {
    throw new Error(`lab ${labSlug} is not in the catalog`);
  }
  return lab;
}

async function trackedModels(
  db: EvidenceDb,
  labId: number,
): Promise<{ slug: string; name: string }[]> {
  const rows = await db
    .select({ slug: models.slug, name: models.name })
    .from(models)
    .where(eq(models.labId, labId));
  return rows;
}

async function latestVisitIsGood(db: EvidenceDb, sourceId: number): Promise<boolean> {
  const rows = await db
    .select({ outcome: fetchLog.outcome })
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id))
    .limit(1);
  const outcome = rows[0]?.outcome;
  return outcome === "changed" || outcome === "unchanged";
}

async function newestFetchedAt(db: EvidenceDb, sourceId: number): Promise<Date> {
  const rows = await db
    .select({ fetchedAt: fetchLog.fetchedAt })
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`source ${sourceId} has no fetch log`);
  }
  return row.fetchedAt;
}

async function pricingVisits(db: EvidenceDb, sourceId: number): Promise<PricingVisit[]> {
  const logs = await db
    .select({
      outcome: fetchLog.outcome,
      observationId: fetchLog.observationId,
    })
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(asc(fetchLog.fetchedAt), asc(fetchLog.id));
  const snapshots = await db
    .select({ id: observations.id, parsedData: observations.parsedData })
    .from(observations)
    .where(eq(observations.sourceId, sourceId));
  const referencedIds = new Set(
    logs.flatMap((log) => (log.observationId === null ? [] : [log.observationId])),
  );
  const presentById = new Map<number, string[]>();
  for (const snapshot of snapshots) {
    if (!referencedIds.has(snapshot.id)) {
      continue;
    }
    const parsed = storedSnapshotSchema.safeParse(snapshot.parsedData);
    if (!parsed.success) {
      throw new Error(`observation ${snapshot.id} is not a parsed price list`);
    }
    presentById.set(snapshot.id, [...new Set(parsed.data.rows.map((row) => row.modelSlug))]);
  }

  let current: readonly string[] | null = null;
  const oldestFirst: PricingVisit[] = [];
  for (const log of logs) {
    if (log.outcome === "changed") {
      if (log.observationId === null) {
        throw new Error("a changed check has no observation");
      }
      const present = presentById.get(log.observationId);
      if (present === undefined) {
        throw new Error(`observation ${log.observationId} is missing`);
      }
      current = present;
      oldestFirst.push({ outcome: "changed", presentSlugs: present });
      continue;
    }
    if (log.outcome === "unchanged") {
      if (current === null) {
        throw new Error("an unchanged visit has no snapshot");
      }
      oldestFirst.push({ outcome: "unchanged", presentSlugs: current });
      continue;
    }
    if (log.outcome === "parser_suspect" || log.outcome === "fetch_error") {
      oldestFirst.push({ outcome: log.outcome, presentSlugs: [] });
      continue;
    }
    throw new Error(`fetch outcome ${log.outcome} is unknown`);
  }
  return oldestFirst.reverse();
}

async function storedCards(db: EvidenceDb, sourceId: number): Promise<StoredOfficialCard[]> {
  const rows = await db
    .select({
      id: candidateModels.id,
      rawSlug: candidateModels.rawSlug,
      kind: candidateModels.kind,
      status: candidateModels.status,
    })
    .from(candidateModels)
    .where(eq(candidateModels.sourceId, sourceId));
  return rows;
}
