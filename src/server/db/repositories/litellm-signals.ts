import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import {
  ANTHROPIC_MODELS_URL,
  GOOGLE_MODELS_URL,
  isOfficialModelListUrl,
  OPENAI_MODELS_URL,
} from "@/server/sources/official-model-list";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";
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
 * The latest witness read and the rows one Signals section lists.
 *
 * LiteLLM and OpenRouter are separate source URLs. This file only
 * selects. It does not call publishPriceVersion().
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
    isBaseline: boolean;
    seenCount: number;
  } | null;
  disagreements: {
    modelName: string;
    labName: string;
    dimension: string;
    ourValue: string;
    aggregatorValue: string;
    detectedAt: Date;
  }[];
  candidates: {
    id: number;
    labName: string;
    rawSlug: string;
    rawName: string;
    firstSeenAt: Date;
    kind: "new_name" | "retirement";
    hint: string | null;
  }[];
  signals: {
    modelName: string;
    labName: string;
    kind: "not_linked" | "missing";
    hasAlias: boolean;
    detectedAt: Date;
  }[];
};

/** The latest read for one signal job, including an official model list. */
export function findSignalPage(db: SignalDb, sourceUrl: string): Promise<LiteLLMSignalPage> {
  if (!isSignalJobUrl(sourceUrl)) {
    throw new Error("signal url is not a witness this page reads");
  }
  return findWitnessSignalPage(db, sourceUrl);
}

/**
 * The latest read for one witness URL. LiteLLM and OpenRouter each pass
 * their own URL, so one source's flags never appear on the other list.
 */
async function findWitnessSignalPage(db: SignalDb, sourceUrl: string): Promise<LiteLLMSignalPage> {
  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, sourceUrl))
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
      isBaseline: witnessReads.isBaseline,
      seenSlugs: witnessReads.seenSlugs,
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
            isBaseline: witnessReads.isBaseline,
            seenSlugs: witnessReads.seenSlugs,
          })
          .from(witnessReads)
          .where(and(eq(witnessReads.sourceId, sourceId), eq(witnessReads.outcome, "ok")))
          .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
          .limit(1);
  const success = successRows[0];
  if (
    success !== undefined &&
    (success.agreedCount === null || success.notComparedCount === null)
  ) {
    throw new Error("successful witness read is missing its counts");
  }

  const disagreementRows = await db
    .select({
      modelName: models.name,
      labName: labs.name,
      dimension: verificationFlags.dimension,
      ourValue: verificationFlags.ourValue,
      aggregatorValue: verificationFlags.aggregatorValue,
      detectedAt: verificationFlags.detectedAt,
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
      rawName: candidateModels.rawName,
      firstSeenAt: candidateModels.firstSeenAt,
      kind: candidateModels.kind,
      hint: candidateModels.hint,
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
      detectedAt: modelSignals.detectedAt,
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
    successful: readSuccessfulRead(success),
    disagreements: disagreementRows,
    candidates: candidateRows,
    signals: signalRows.map((row) => ({
      modelName: row.modelName,
      labName: row.labName,
      kind: row.kind,
      hasAlias: withAlias.has(row.modelId),
      detectedAt: row.detectedAt,
    })),
  };
}

function readSuccessfulRead(
  success:
    | {
        fetchedAt: Date;
        agreedCount: number | null;
        notComparedCount: number | null;
        isBaseline: boolean;
        seenSlugs: unknown;
      }
    | undefined,
): LiteLLMSignalPage["successful"] {
  if (success === undefined || success.agreedCount === null || success.notComparedCount === null) {
    return null;
  }
  return {
    fetchedAt: success.fetchedAt,
    agreedCount: success.agreedCount,
    notComparedCount: success.notComparedCount,
    isBaseline: success.isBaseline,
    seenCount: readSeenCount(success.seenSlugs),
  };
}

function readSeenCount(value: unknown): number {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string")) {
    throw new Error("witness seen_slugs is not a list of strings");
  }
  return value.length;
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

/**
 * LiteLLM, then OpenRouter, then the three official model lists.
 * The board asks for these URLs in this order.
 * A test can pass other URLs so it does not touch the live witness rows.
 */
export const SIGNAL_JOB_URLS = [
  LITELLM_COST_MAP_URL,
  OPENROUTER_MODELS_URL,
  OPENAI_MODELS_URL,
  ANTHROPIC_MODELS_URL,
  GOOGLE_MODELS_URL,
] as const;

/** One page of witness reads. The next page starts strictly before the oldest row shown. */
export const WITNESS_READ_PAGE_SIZE = 50;

export type SignalJobRow = {
  url: string;
  sourceId: number | null;
  latest: {
    outcome: "ok" | "fetch_error" | "parse_error";
    fetchedAt: Date;
    note: string;
  } | null;
  /**
   * True when any read of this source succeeded, including an older one.
   * Counts stay null until then, so a failed first read is not "0 disagreements".
   */
  hasSuccessfulRead: boolean;
  disagreementCount: number | null;
  newNameCount: number | null;
  retirementCount: number | null;
  missingCount: number | null;
};

export type WitnessReadRow = {
  id: number;
  fetchedAt: Date;
  outcome: "ok" | "fetch_error" | "parse_error";
  note: string;
  agreedCount: number | null;
  notComparedCount: number | null;
};

export type WitnessReadCursor = {
  fetchedAt: Date;
  id: number;
};

/**
 * One row per URL, in the order the caller asked for.
 * A URL with no source row is still a job. This function only selects.
 */
export async function listSignalJobs(
  db: SignalDb,
  urls: readonly string[] = SIGNAL_JOB_URLS,
): Promise<SignalJobRow[]> {
  if (new Set(urls).size !== urls.length) {
    throw new Error("signal jobs repeat a url");
  }
  const jobs: SignalJobRow[] = [];
  for (const url of urls) {
    jobs.push(await readSignalJob(db, url));
  }
  return jobs;
}

/**
 * Newest reads first. `seen_slugs` stays in the database: the history
 * page shows the stored counts, not the name list. A failed read stays
 * on this list. The cursor is the oldest row already shown.
 */
export async function listWitnessReadPage(
  db: SignalDb,
  sourceId: number,
  cursor: WitnessReadCursor | null,
): Promise<WitnessReadRow[]> {
  const olderThanCursor =
    cursor === null
      ? undefined
      : or(
          lt(witnessReads.fetchedAt, cursor.fetchedAt),
          and(eq(witnessReads.fetchedAt, cursor.fetchedAt), lt(witnessReads.id, cursor.id)),
        );
  const rows = await db
    .select({
      id: witnessReads.id,
      fetchedAt: witnessReads.fetchedAt,
      outcome: witnessReads.outcome,
      note: witnessReads.note,
      agreedCount: witnessReads.agreedCount,
      notComparedCount: witnessReads.notComparedCount,
    })
    .from(witnessReads)
    .where(
      olderThanCursor === undefined
        ? eq(witnessReads.sourceId, sourceId)
        : and(eq(witnessReads.sourceId, sourceId), olderThanCursor),
    )
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(WITNESS_READ_PAGE_SIZE);
  return rows.map(assembleWitnessRead);
}

/**
 * True for LiteLLM, OpenRouter, or one of the three official model
 * lists. An official pricing page, or any other URL, is not this board.
 */
export async function hasSignalSource(db: SignalDb, id: number): Promise<boolean> {
  return (await findSignalSource(db, id)) !== null;
}

/**
 * The row for /review/signals/<id>, or null when this id is not one of
 * the signal jobs. The page throws if a row vanishes after the proxy
 * already allowed it.
 */
export async function findSignalSource(
  db: SignalDb,
  id: number,
): Promise<{ id: number; url: string } | null> {
  const rows = await db
    .select({ id: sources.id, url: sources.url, type: sources.type })
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  const row = rows[0];
  if (row === undefined || !isListedSignal(row)) {
    return null;
  }
  return { id: row.id, url: row.url };
}

function isListedSignal(row: { type: string; url: string }): boolean {
  if (row.type === "aggregator") {
    return row.url === LITELLM_COST_MAP_URL || row.url === OPENROUTER_MODELS_URL;
  }
  if (row.type === "platform_api") {
    return isOfficialModelListUrl(row.url);
  }
  return false;
}

/**
 * A successful read stores both counts. A failed read stores neither,
 * and it stores a note. A blank failure would look like a quiet success.
 */
export function assembleWitnessRead(row: {
  id: number;
  fetchedAt: Date;
  outcome: "ok" | "fetch_error" | "parse_error";
  note: string;
  agreedCount: number | null;
  notComparedCount: number | null;
}): WitnessReadRow {
  if (!(row.fetchedAt instanceof Date) || Number.isNaN(row.fetchedAt.getTime())) {
    throw new Error("witness read time is not a real date");
  }
  const note = row.note.trim();
  if (row.outcome === "ok") {
    return {
      id: row.id,
      fetchedAt: row.fetchedAt,
      outcome: row.outcome,
      note,
      agreedCount: readWholeCount(row.agreedCount, "agreed count"),
      notComparedCount: readWholeCount(row.notComparedCount, "not compared count"),
    };
  }
  if (row.outcome !== "fetch_error" && row.outcome !== "parse_error") {
    throw new Error(`witness outcome ${row.outcome} is unknown`);
  }
  if (row.agreedCount !== null || row.notComparedCount !== null) {
    throw new Error("a failed witness read stored counts");
  }
  if (note === "") {
    throw new Error("a filed check was stored without a note");
  }
  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    outcome: row.outcome,
    note,
    agreedCount: null,
    notComparedCount: null,
  };
}

async function readSignalJob(db: SignalDb, url: string): Promise<SignalJobRow> {
  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, url))
    .limit(1);
  const sourceId = sourceRows[0]?.id;
  if (sourceId === undefined) {
    return emptyJob(url);
  }

  const latestRows = await db
    .select({
      id: witnessReads.id,
      fetchedAt: witnessReads.fetchedAt,
      outcome: witnessReads.outcome,
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
    return emptyJob(url, sourceId);
  }
  const checked = assembleWitnessRead(latest);
  const hasSuccessfulRead =
    checked.outcome === "ok" ? true : await hasOkRead(db, sourceId);
  return {
    url,
    sourceId,
    latest: { outcome: checked.outcome, fetchedAt: checked.fetchedAt, note: checked.note },
    hasSuccessfulRead,
    disagreementCount: hasSuccessfulRead ? await countDisagreements(db, sourceId) : null,
    newNameCount: hasSuccessfulRead ? await countNewNames(db, sourceId) : null,
    retirementCount: hasSuccessfulRead ? await countRetirements(db, sourceId) : null,
    missingCount: hasSuccessfulRead ? await countMissing(db, sourceId) : null,
  };
}

function emptyJob(url: string, sourceId: number | null = null): SignalJobRow {
  return {
    url,
    sourceId,
    latest: null,
    hasSuccessfulRead: false,
    disagreementCount: null,
    newNameCount: null,
    retirementCount: null,
    missingCount: null,
  };
}

function isSignalJobUrl(url: string): boolean {
  return SIGNAL_JOB_URLS.some((jobUrl) => jobUrl === url);
}

async function hasOkRead(db: SignalDb, sourceId: number): Promise<boolean> {
  const rows = await db
    .select({ id: witnessReads.id })
    .from(witnessReads)
    .where(and(eq(witnessReads.sourceId, sourceId), eq(witnessReads.outcome, "ok")))
    .limit(1);
  return rows.length > 0;
}

async function countDisagreements(db: SignalDb, sourceId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(verificationFlags)
    .where(and(eq(verificationFlags.sourceId, sourceId), isNull(verificationFlags.resolvedAt)));
  return readCountCell(rows[0]?.count, "disagreement count");
}

async function countNewNames(db: SignalDb, sourceId: number): Promise<number> {
  return countCards(db, sourceId, "new_name", "new name count");
}

async function countRetirements(db: SignalDb, sourceId: number): Promise<number> {
  return countCards(db, sourceId, "retirement", "retirement count");
}

async function countCards(
  db: SignalDb,
  sourceId: number,
  kind: "new_name" | "retirement",
  label: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidateModels)
    .where(
      and(
        eq(candidateModels.sourceId, sourceId),
        eq(candidateModels.status, "pending_review"),
        eq(candidateModels.kind, kind),
      ),
    );
  return readCountCell(rows[0]?.count, label);
}

async function countMissing(db: SignalDb, sourceId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(modelSignals)
    .where(and(eq(modelSignals.sourceId, sourceId), eq(modelSignals.kind, "missing")));
  return readCountCell(rows[0]?.count, "missing count");
}

function readWholeCount(value: number | null, label: string): number {
  if (value === null) {
    throw new Error("successful witness read is missing its counts");
  }
  return readCountCell(value, label);
}

function readCountCell(value: unknown, label: string): number {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} is not a whole number`);
  }
  return count;
}
