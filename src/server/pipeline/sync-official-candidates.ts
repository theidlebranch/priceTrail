import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  goneModelCards,
  officialCandidateCards,
  pricingRetirementCards,
  type PricingVisit,
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
 * open either of those, and it does not reset a miss. A slug that
 * already has a card, including a rejected one, is left alone. This
 * does not call publishPriceVersion().
 */

const storedSnapshotSchema = z.object({
  rows: z.array(normalizedPriceSchema),
  warnings: z.array(z.string()),
});

export async function syncOfficialCandidates(
  db: EvidenceDb,
  input: { sourceId: number; labSlug: string },
): Promise<number> {
  const snapshot = await latestSnapshot(db, input.sourceId);
  if (snapshot === null) {
    return 0;
  }

  const lab = await findLab(db, input.labSlug);
  const tracked = await trackedModels(db, lab.id);
  const existingCandidateSlugs = await candidateSlugs(db, input.sourceId);
  const newNames = officialCandidateCards({
    rows: snapshot.rows,
    trackedSlugs: tracked.map((model) => model.slug),
    existingCandidateSlugs,
  });
  const goodVisit = await latestVisitIsGood(db, input.sourceId);
  const retirements = goodVisit
    ? pricingRetirementCards({ rows: snapshot.rows, existingCandidateSlugs })
    : [];
  const gone = goodVisit
    ? goneModelCards({
        visits: await pricingVisits(db, input.sourceId),
        tracked,
        existingCandidateSlugs,
      })
    : [];
  const openedAt = goodVisit ? await newestFetchedAt(db, input.sourceId) : snapshot.fetchedAt;
  const cards = [
    ...newNames.map((card) => ({
      rawName: card.modelName,
      rawSlug: card.modelSlug,
      kind: "new_name" as const,
      hint: null,
      firstSeenAt: snapshot.fetchedAt,
    })),
    ...retirements.map((card) => ({
      rawName: card.modelName,
      rawSlug: card.modelSlug,
      kind: "retirement" as const,
      hint: card.hint,
      firstSeenAt: snapshot.fetchedAt,
    })),
    ...gone.map((card) => ({
      rawName: card.modelName,
      rawSlug: card.modelSlug,
      kind: "gone" as const,
      hint: card.hint,
      firstSeenAt: openedAt,
    })),
  ];
  if (cards.length === 0) {
    return 0;
  }

  await db.insert(candidateModels).values(
    cards.map((card) => ({
      labId: lab.id,
      rawName: card.rawName,
      rawSlug: card.rawSlug,
      sourceId: input.sourceId,
      firstSeenAt: card.firstSeenAt,
      kind: card.kind,
      hint: card.hint,
    })),
  );
  return cards.length;
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
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const parsed = storedSnapshotSchema.safeParse(row.parsedData);
  if (!parsed.success) {
    throw new Error(`observation for source ${sourceId} is not a parsed price list`);
  }
  return { fetchedAt: row.fetchedAt, rows: parsed.data.rows };
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
  const presentById = new Map<number, string[]>();
  for (const snapshot of snapshots) {
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

async function candidateSlugs(db: EvidenceDb, sourceId: number): Promise<string[]> {
  const rows = await db
    .select({ rawSlug: candidateModels.rawSlug })
    .from(candidateModels)
    .where(eq(candidateModels.sourceId, sourceId));
  return rows.map((row) => row.rawSlug);
}
