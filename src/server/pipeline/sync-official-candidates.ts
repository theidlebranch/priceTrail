import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { officialCandidateCards } from "@/core/pricing/official-candidates";
import { normalizedPriceSchema } from "@/core/pricing/shape";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { candidateModels, labs, models, observations } from "@/server/db/schema";

/**
 * Open a card for each official-page model we do not track yet.
 *
 * The rows come from the latest stored snapshot, not from a download
 * that just failed. A page that did not change still fills the first
 * backlog. A slug that already has a card, including a rejected one,
 * is left alone. This does not call publishPriceVersion().
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
  const trackedSlugs = await trackedModelSlugs(db, lab.id);
  const existingCandidateSlugs = await candidateSlugs(db, input.sourceId);
  const cards = officialCandidateCards({
    rows: snapshot.rows,
    trackedSlugs,
    existingCandidateSlugs,
  });
  if (cards.length === 0) {
    return 0;
  }

  await db.insert(candidateModels).values(
    cards.map((card) => ({
      labId: lab.id,
      rawName: card.modelName,
      rawSlug: card.modelSlug,
      sourceId: input.sourceId,
      firstSeenAt: snapshot.fetchedAt,
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

async function trackedModelSlugs(db: EvidenceDb, labId: number): Promise<string[]> {
  const rows = await db.select({ slug: models.slug }).from(models).where(eq(models.labId, labId));
  return rows.map((row) => row.slug);
}

async function candidateSlugs(db: EvidenceDb, sourceId: number): Promise<string[]> {
  const rows = await db
    .select({ rawSlug: candidateModels.rawSlug })
    .from(candidateModels)
    .where(eq(candidateModels.sourceId, sourceId));
  return rows.map((row) => row.rawSlug);
}
