import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import {
  candidateModels,
  labs,
  modelAliases,
  modelSignals,
  models,
  offerings,
  sources,
  verificationFlags,
  witnessReads,
} from "@/server/db/schema";

/**
 * The latest LiteLLM read and the rows the Signals page lists.
 *
 * This file only selects. It does not call publishPriceVersion().
 */

export type LiteLLMSignalPage = {
  latest: {
    outcome: "ok" | "fetch_error" | "parse_error";
    fetchedAt: Date;
    note: string;
  } | null;
  successful: {
    fetchedAt: Date;
    agreedCount: number;
    notComparedCount: number;
  } | null;
  disagreements: {
    modelName: string;
    labName: string;
    dimension: string;
    ourValue: string;
    aggregatorValue: string;
  }[];
  candidates: { id: number; labName: string; rawSlug: string }[];
  signals: {
    modelName: string;
    labName: string;
    kind: "not_linked" | "missing";
    hasAlias: boolean;
  }[];
};

export async function findLiteLLMSignalPage(db: SignalDb): Promise<LiteLLMSignalPage> {
  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, LITELLM_COST_MAP_URL))
    .limit(1);
  const sourceId = sourceRows[0]?.id;
  if (sourceId === undefined) {
    return emptyPage();
  }

  const latestRows = await db
    .select({
      outcome: witnessReads.outcome,
      fetchedAt: witnessReads.fetchedAt,
      note: witnessReads.note,
      agreedCount: witnessReads.agreedCount,
      notComparedCount: witnessReads.notComparedCount,
    })
    .from(witnessReads)
    .where(eq(witnessReads.sourceId, sourceId))
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(1);
  const latest = latestRows[0];
  if (latest === undefined) {
    return emptyPage();
  }

  const successRows =
    latest.outcome === "ok"
      ? [latest]
      : await db
          .select({
            fetchedAt: witnessReads.fetchedAt,
            agreedCount: witnessReads.agreedCount,
            notComparedCount: witnessReads.notComparedCount,
          })
          .from(witnessReads)
          .where(and(eq(witnessReads.sourceId, sourceId), eq(witnessReads.outcome, "ok")))
          .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
          .limit(1);
  const success = successRows[0];
  if (success !== undefined && (success.agreedCount === null || success.notComparedCount === null)) {
    throw new Error("successful witness read is missing its counts");
  }

  const disagreementRows = await db
    .select({
      modelName: models.name,
      labName: labs.name,
      dimension: verificationFlags.dimension,
      ourValue: verificationFlags.ourValue,
      aggregatorValue: verificationFlags.aggregatorValue,
    })
    .from(verificationFlags)
    .innerJoin(offerings, eq(verificationFlags.offeringId, offerings.id))
    .innerJoin(models, eq(offerings.modelId, models.id))
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(and(eq(verificationFlags.sourceId, sourceId), isNull(verificationFlags.resolvedAt)))
    .orderBy(asc(labs.name), asc(models.name), asc(verificationFlags.dimension));

  const candidateRows = await db
    .select({
      id: candidateModels.id,
      labName: labs.name,
      rawSlug: candidateModels.rawSlug,
    })
    .from(candidateModels)
    .innerJoin(labs, eq(candidateModels.labId, labs.id))
    .where(and(eq(candidateModels.sourceId, sourceId), eq(candidateModels.status, "pending_review")))
    .orderBy(asc(labs.name), asc(candidateModels.rawSlug));

  const signalRows = await db
    .select({
      modelId: models.id,
      modelName: models.name,
      labName: labs.name,
      kind: modelSignals.kind,
    })
    .from(modelSignals)
    .innerJoin(models, eq(modelSignals.modelId, models.id))
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(eq(modelSignals.sourceId, sourceId))
    .orderBy(asc(labs.name), asc(models.name));

  const modelIds = signalRows.map((row) => row.modelId);
  const aliasRows =
    modelIds.length === 0
      ? []
      : await db
          .select({ modelId: modelAliases.modelId })
          .from(modelAliases)
          .where(
            and(inArray(modelAliases.modelId, modelIds), eq(modelAliases.kind, "aggregator_slug")),
          );
  const withAlias = new Set(aliasRows.map((row) => row.modelId));

  return {
    latest: { outcome: latest.outcome, fetchedAt: latest.fetchedAt, note: latest.note },
    successful:
      success === undefined || success.agreedCount === null || success.notComparedCount === null
        ? null
        : {
            fetchedAt: success.fetchedAt,
            agreedCount: success.agreedCount,
            notComparedCount: success.notComparedCount,
          },
    disagreements: disagreementRows,
    candidates: candidateRows,
    signals: signalRows.map((row) => ({
      modelName: row.modelName,
      labName: row.labName,
      kind: row.kind,
      hasAlias: withAlias.has(row.modelId),
    })),
  };
}

function emptyPage(): LiteLLMSignalPage {
  return {
    latest: null,
    successful: null,
    disagreements: [],
    candidates: [],
    signals: [],
  };
}
