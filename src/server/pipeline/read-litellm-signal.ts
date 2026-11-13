import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { parseLiteLLM } from "@/core/pricing/litellm";
import type { Condition, NormalizedPrice } from "@/core/pricing/shape";
import {
  compareLiteLLMWitness,
  type LabSlug,
  type OpenComponent,
  type TrackedWitnessModel,
} from "@/core/witness/compare-litellm";
import { fetchOfficialPage, type FetchLike } from "@/server/sources/provider-source";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import * as schema from "@/server/db/schema";
import {
  candidateModels,
  labs,
  modelAliases,
  modelSignals,
  models,
  offerings,
  priceComponents,
  priceVersions,
  sources,
  verificationFlags,
  witnessReads,
} from "@/server/db/schema";

/**
 * Read the LiteLLM cost map and store what it means for tracked models.
 *
 * A failed download or a bad parse stores only the attempt. The previous
 * disagreements, new names, and missing models stay. Two open prices throw
 * and store nothing. This file does not call publishPriceVersion().
 */

type Schema = typeof schema;

export type SignalDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type LiteLLMSignalResult =
  | {
      kind: "ok";
      isBaseline: boolean;
      agreedCount: number;
      notComparedCount: number;
      disagreementCount: number;
      newModelCount: number;
    }
  | { kind: "fetch_error" | "parse_error"; note: string };

const WITNESS_LABS = ["anthropic", "openai", "google"] as const;

export async function readLiteLLMSignal(
  db: SignalDb,
  input: { fetchedAt: Date; fetchImpl: FetchLike },
): Promise<LiteLLMSignalResult> {
  if (!(input.fetchedAt instanceof Date) || Number.isNaN(input.fetchedAt.getTime())) {
    throw new Error("fetchedAt is not a real date");
  }

  let rawContent: string;
  try {
    const page = await fetchOfficialPage(LITELLM_COST_MAP_URL, "LiteLLM", input.fetchImpl);
    rawContent = page.rawContent;
  } catch (error) {
    const note = error instanceof Error ? error.message : "LiteLLM fetch failed";
    return recordFailure(db, input.fetchedAt, "fetch_error", note);
  }

  let rows: NormalizedPrice[];
  try {
    rows = parseLiteLLM(JSON.parse(rawContent)).rows;
  } catch (error) {
    const note = error instanceof Error ? error.message : "LiteLLM parse failed";
    return recordFailure(db, input.fetchedAt, "parse_error", note);
  }

  return db.transaction(async (tx) => {
    const source = await lockLiteLLMSource(tx);
    await assertReadOrder(tx, source.id, input.fetchedAt);
    const tracked = await loadTrackedModels(tx);
    const previous = await latestSuccessfulRead(tx, source.id);
    const existing = await loadCandidateSlugs(tx, source.id);
    const compared = compareLiteLLMWitness({
      rows,
      tracked,
      previousSlugs: previous?.seenSlugs ?? null,
      existingCandidateSlugs: existing,
    });
    const labIds = await loadLabIds(tx);

    await tx.insert(witnessReads).values({
      sourceId: source.id,
      fetchedAt: input.fetchedAt,
      outcome: "ok",
      note: "",
      seenSlugs: compared.seenSlugs,
      isBaseline: compared.isBaseline,
      agreedCount: compared.agreedCount,
      notComparedCount: compared.notComparedCount,
    });

    await tx
      .delete(verificationFlags)
      .where(and(eq(verificationFlags.sourceId, source.id), isNull(verificationFlags.resolvedAt)));
    if (compared.disagreements.length > 0) {
      await tx.insert(verificationFlags).values(
        compared.disagreements.map((row) => ({
          offeringId: row.offeringId,
          sourceId: source.id,
          dimension: row.dimension,
          detectedAt: input.fetchedAt,
          aggregatorValue: row.aggregatorValue,
          ourValue: row.ourValue,
        })),
      );
    }

    await tx.delete(modelSignals).where(eq(modelSignals.sourceId, source.id));
    if (compared.signals.length > 0) {
      await tx.insert(modelSignals).values(
        compared.signals.map((row) => ({
          modelId: row.modelId,
          sourceId: source.id,
          kind: row.kind,
          detectedAt: input.fetchedAt,
        })),
      );
    }

    if (compared.newModels.length > 0) {
      await tx.insert(candidateModels).values(
        compared.newModels.map((row) => {
          const labId = labIds.get(row.labSlug);
          if (labId === undefined) {
            throw new Error(`lab ${row.labSlug} is not in the catalog`);
          }
          return {
            labId,
            rawName: row.rawSlug,
            rawSlug: row.rawSlug,
            sourceId: source.id,
            firstSeenAt: input.fetchedAt,
          };
        }),
      );
    }

    return {
      kind: "ok" as const,
      isBaseline: compared.isBaseline,
      agreedCount: compared.agreedCount,
      notComparedCount: compared.notComparedCount,
      disagreementCount: compared.disagreements.length,
      newModelCount: compared.newModels.length,
    };
  });
}

async function recordFailure(
  db: SignalDb,
  fetchedAt: Date,
  outcome: "fetch_error" | "parse_error",
  note: string,
): Promise<LiteLLMSignalResult> {
  const sentence = note.trim() === "" ? "LiteLLM read failed" : note.trim();
  await db.transaction(async (tx) => {
    const source = await lockLiteLLMSource(tx);
    await assertReadOrder(tx, source.id, fetchedAt);
    await tx.insert(witnessReads).values({
      sourceId: source.id,
      fetchedAt,
      outcome,
      note: sentence,
      seenSlugs: [],
      isBaseline: false,
    });
  });
  return { kind: outcome, note: sentence };
}

async function lockLiteLLMSource(tx: SignalDb): Promise<{ id: number }> {
  await tx
    .insert(sources)
    .values({ url: LITELLM_COST_MAP_URL, type: "aggregator" })
    .onConflictDoNothing();

  const rows = await tx
    .select({ id: sources.id, type: sources.type })
    .from(sources)
    .where(eq(sources.url, LITELLM_COST_MAP_URL))
    .for("update");
  const source = rows[0];
  if (source === undefined) {
    throw new Error("LiteLLM source row was not stored");
  }
  if (source.type !== "aggregator") {
    throw new Error(`LiteLLM source type is ${source.type}`);
  }
  return { id: source.id };
}

async function assertReadOrder(tx: SignalDb, sourceId: number, fetchedAt: Date): Promise<void> {
  const rows = await tx
    .select({ fetchedAt: witnessReads.fetchedAt })
    .from(witnessReads)
    .where(eq(witnessReads.sourceId, sourceId))
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(1);
  const latest = rows[0]?.fetchedAt;
  if (latest !== undefined && fetchedAt.getTime() < latest.getTime()) {
    throw new Error("fetchedAt is earlier than the latest witness read");
  }
}

async function latestSuccessfulRead(
  tx: SignalDb,
  sourceId: number,
): Promise<{ seenSlugs: string[] } | null> {
  const rows = await tx
    .select({ seenSlugs: witnessReads.seenSlugs })
    .from(witnessReads)
    .where(and(eq(witnessReads.sourceId, sourceId), eq(witnessReads.outcome, "ok")))
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(1);
  const seen = rows[0]?.seenSlugs;
  if (seen === undefined) {
    return null;
  }
  if (!Array.isArray(seen) || seen.some((slug) => typeof slug !== "string")) {
    throw new Error("witness seen_slugs is not a list of strings");
  }
  return { seenSlugs: seen };
}

async function loadCandidateSlugs(tx: SignalDb, sourceId: number): Promise<string[]> {
  const rows = await tx
    .select({ rawSlug: candidateModels.rawSlug })
    .from(candidateModels)
    .where(eq(candidateModels.sourceId, sourceId));
  return rows.map((row) => row.rawSlug);
}

async function loadLabIds(tx: SignalDb): Promise<Map<LabSlug, number>> {
  const rows = await tx
    .select({ id: labs.id, slug: labs.slug })
    .from(labs)
    .where(inArray(labs.slug, [...WITNESS_LABS]));
  const ids = new Map<LabSlug, number>();
  for (const row of rows) {
    if (!isLabSlug(row.slug)) {
      continue;
    }
    ids.set(row.slug, row.id);
  }
  return ids;
}

async function loadTrackedModels(tx: SignalDb): Promise<TrackedWitnessModel[]> {
  const modelRows = await tx
    .select({
      modelId: models.id,
      modelSlug: models.slug,
      labSlug: labs.slug,
    })
    .from(models)
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(inArray(labs.slug, [...WITNESS_LABS]))
    .orderBy(asc(models.id));

  if (modelRows.length === 0) {
    return [];
  }

  const modelIds = modelRows.map((row) => row.modelId);
  const aliasRows = await tx
    .select({ modelId: modelAliases.modelId, alias: modelAliases.alias })
    .from(modelAliases)
    .where(and(inArray(modelAliases.modelId, modelIds), eq(modelAliases.kind, "aggregator_slug")));
  const offeringRows = await tx
    .select({ id: offerings.id, modelId: offerings.modelId })
    .from(offerings)
    .where(
      and(
        inArray(offerings.modelId, modelIds),
        eq(offerings.platform, "official-api"),
        eq(offerings.region, "global"),
      ),
    );

  const offeringsByModel = new Map<number, number>();
  for (const offering of offeringRows) {
    if (offeringsByModel.has(offering.modelId)) {
      const model = modelRows.find((row) => row.modelId === offering.modelId);
      throw new Error(`two global official offerings for ${model?.modelSlug ?? offering.modelId}`);
    }
    offeringsByModel.set(offering.modelId, offering.id);
  }

  const offeringIds = [...offeringsByModel.values()];
  const openByOffering = new Map<number, { versionId: number; components: OpenComponent[] }>();
  if (offeringIds.length > 0) {
    const versionRows = await tx
      .select({ id: priceVersions.id, offeringId: priceVersions.offeringId })
      .from(priceVersions)
      .where(
        and(
          inArray(priceVersions.offeringId, offeringIds),
          isNull(priceVersions.lastSeenAt),
          isNull(priceVersions.retractedAt),
        ),
      );
    const versionToOffering = new Map<number, number>();
    for (const version of versionRows) {
      if (openByOffering.has(version.offeringId)) {
        const modelId = [...offeringsByModel.entries()].find(([, id]) => id === version.offeringId)?.[0];
        const model = modelRows.find((row) => row.modelId === modelId);
        throw new Error(`two open prices for ${model?.modelSlug ?? version.offeringId}`);
      }
      openByOffering.set(version.offeringId, { versionId: version.id, components: [] });
      versionToOffering.set(version.id, version.offeringId);
    }

    const versionIds = [...versionToOffering.keys()];
    if (versionIds.length > 0) {
      const componentRows = await tx
        .select({
          priceVersionId: priceComponents.priceVersionId,
          dimension: priceComponents.dimension,
          amount: priceComponents.amount,
          condition: priceComponents.condition,
        })
        .from(priceComponents)
        .where(inArray(priceComponents.priceVersionId, versionIds));
      for (const component of componentRows) {
        const offeringId = versionToOffering.get(component.priceVersionId);
        const open = offeringId === undefined ? undefined : openByOffering.get(offeringId);
        if (open === undefined) {
          throw new Error("price component has no open version");
        }
        open.components.push({
          dimension: component.dimension,
          amount: component.amount,
          condition: readCondition(component.condition),
        });
      }
    }
  }

  return modelRows.map((row) => {
    if (!isLabSlug(row.labSlug)) {
      throw new Error(`lab ${row.labSlug} is not a witness lab`);
    }
    const offeringId = offeringsByModel.get(row.modelId) ?? null;
    const open = offeringId === null ? undefined : openByOffering.get(offeringId);
    return {
      modelId: row.modelId,
      labSlug: row.labSlug,
      modelSlug: row.modelSlug,
      aliases: aliasRows.filter((alias) => alias.modelId === row.modelId).map((alias) => alias.alias),
      offeringId: open === undefined ? null : offeringId,
      openComponents: open?.components ?? [],
    };
  });
}

function readCondition(value: unknown): Condition {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("price condition is not an object");
  }
  const record = value as Record<string, unknown>;
  const condition: Condition = {};
  for (const [key, raw] of Object.entries(record)) {
    if (key === "longContext") {
      if (raw !== true) {
        throw new Error("price condition longContext is not true");
      }
      condition.longContext = true;
      continue;
    }
    if (
      key !== "promptTokensOver" &&
      key !== "promptTokensAtMost" &&
      key !== "promptTokensUnder" &&
      key !== "promptTokensAtLeast"
    ) {
      throw new Error(`price condition key ${key} is unknown`);
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      throw new Error(`price condition ${key} is not a positive whole number`);
    }
    condition[key] = raw;
  }
  return condition;
}

function isLabSlug(value: string): value is LabSlug {
  return value === "anthropic" || value === "openai" || value === "google";
}
