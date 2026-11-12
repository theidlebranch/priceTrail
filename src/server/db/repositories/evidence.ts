import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { normalizedPriceSchema, type NormalizedPrice } from "@/core/pricing/shape";
import {
  SAME_PRICE_NOTE,
  SAME_PRICE_REVIEWER,
  trackedPriceUnchanged,
  type OpenPriceComponent,
} from "@/core/review/confirm-price";
import { checkParsedPrices } from "@/core/verification/check-parse";
import { fingerprintParsedPrices } from "@/core/verification/fingerprint";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import * as schema from "@/server/db/schema";
import {
  fetchLog,
  labs,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";

/**
 * Evidence door: one check of one official page, and the archive stamp
 * on a snapshot that check already stored.
 *
 * A repository is the storage door for one job. Callers pass the download
 * and the parsed rows. This file does not fetch the page, parse it, ask
 * Wayback, or open a price period. publishPriceVersion() is the only price
 * writer, and this file does not call it. A new hash stores one item per
 * tracked offering. The item is confirmed when the prices that apply on
 * the visit day match the open price. A later dated price does not ask
 * a person. The reviewer id is system:same-price, and no new price period
 * is opened. Any other item stays flagged for a person. The open price
 * stays open.
 *
 * recordArchiveResult() writes only archive_url and archive_status. The
 * page text stays where recordSourceCheck() put it. A failed capture does
 * not delete that text. replaceArchivePermalink() is the one-time repair
 * for a permalink that already exists. It writes those same two columns
 * and leaves the page text where it is.
 *
 * The caller passes fetchedAt. This file does not call new Date(), so a
 * test can use a fixed clock. The seed does not use this door. A seed row
 * is hand-confirmed and then published. A live check is neither of those.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a test.
 * A transaction is a different class with the same insert and select methods.
 */
export type EvidenceDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type SourceCheckResult =
  | { kind: "fetch_error"; note: string }
  | { kind: "parser_suspect"; note: string }
  | {
      kind: "parsed";
      rawContent: string;
      rows: readonly NormalizedPrice[];
      warnings: readonly string[];
    };

export type RecordSourceCheckInput = {
  sourceId: number;
  fetchedAt: Date;
  httpStatus: number | null;
  labSlug: string;
  result: SourceCheckResult;
};

export type RecordedSourceCheck = {
  outcome: "fetch_error" | "parser_suspect" | "unchanged" | "changed";
  observationId: number | null;
};

type PreparedCheck =
  | { kind: "fetch_error"; note: string; httpStatus: number | null }
  | { kind: "parser_suspect"; note: string; httpStatus: number }
  | {
      kind: "parsed";
      httpStatus: number;
      rawContent: string;
      rows: NormalizedPrice[];
      warnings: string[];
    };

type TrackedOffering = {
  offeringId: number;
  modelSlug: string;
};

type LatestObservation = {
  fetchedAt: Date;
  contentHash: string;
  parsedData: unknown;
};

const OFFICIAL_PLATFORM = "official-api";
const GLOBAL_REGION = "global";

/**
 * File one visit.
 *
 * The source row is locked first, so two overlapping checks of the same
 * page cannot both decide the hash is new. A throw before the inserts
 * leaves no fetch_log row. Every ending that is stored updates
 * last_checked_at, including a failed download.
 */
export async function recordSourceCheck(
  db: EvidenceDb,
  input: RecordSourceCheckInput,
): Promise<RecordedSourceCheck> {
  const checked = prepareCheck(input);

  return db.transaction(async (tx) => {
    const source = await lockSource(tx, input.sourceId);
    const tracked = await loadTrackedOfferings(tx, input.labSlug);
    const latest = await loadLatestObservation(tx, source.id);
    assertNotBackdated(input.fetchedAt, latest, source.id);

    const filed = await fileVisit(tx, {
      sourceId: source.id,
      fetchedAt: input.fetchedAt,
      checked,
      tracked,
      latest,
    });

    await tx
      .update(sources)
      .set({ lastCheckedAt: input.fetchedAt })
      .where(eq(sources.id, source.id));

    return filed;
  });
}

type ObservationArchive = {
  id: number;
  pageUrl: string;
  archiveStatus: "pending" | "archived" | "failed";
  archiveUrl: string | null;
};

type ArchiveStamp =
  | { kind: "archived"; permalink: string }
  | { kind: "failed" };

type RecordedArchive =
  | { kind: "archived"; permalink: string }
  | { kind: "failed" }
  | { kind: "unchanged"; permalink: string };

/**
 * Read the archive columns for one snapshot, plus the page URL to send
 * to Save Page Now. A missing row is null. This does not call Wayback.
 */
export async function findObservationArchive(
  db: EvidenceDb,
  observationId: number,
): Promise<ObservationArchive | null> {
  assertObservationId(observationId);
  const rows = await db
    .select({
      id: observations.id,
      pageUrl: sources.url,
      archiveStatus: observations.archiveStatus,
      archiveUrl: observations.archiveUrl,
    })
    .from(observations)
    .innerJoin(sources, eq(sources.id, observations.sourceId))
    .where(eq(observations.id, observationId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Stamp one snapshot as archived or failed.
 *
 * The permalink must be an https web.archive.org URL. A blank or foreign
 * URL throws before the update, and the row stays as it was. A row that
 * is already archived is left alone, so a later failure cannot wipe a
 * permalink. raw_content is not in the update.
 */
export async function recordArchiveResult(
  db: EvidenceDb,
  input: { observationId: number; result: ArchiveStamp },
): Promise<RecordedArchive> {
  assertObservationId(input.observationId);
  const permalink =
    input.result.kind === "archived" ? readPermalink(input.result.permalink) : null;

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: observations.id,
        archiveStatus: observations.archiveStatus,
        archiveUrl: observations.archiveUrl,
      })
      .from(observations)
      .where(eq(observations.id, input.observationId))
      .for("update");
    const row = rows[0];
    if (row === undefined) {
      throw new Error(`observation ${input.observationId} does not exist`);
    }
    if (row.archiveStatus === "archived") {
      if (row.archiveUrl === null || row.archiveUrl.trim() === "") {
        throw new Error(`observation ${row.id} is archived without a permalink`);
      }
      return { kind: "unchanged", permalink: row.archiveUrl };
    }

    if (permalink === null) {
      await tx
        .update(observations)
        .set({ archiveUrl: null, archiveStatus: "failed" })
        .where(eq(observations.id, row.id));
      return { kind: "failed" };
    }

    await tx
      .update(observations)
      .set({ archiveUrl: permalink, archiveStatus: "archived" })
      .where(eq(observations.id, row.id));
    return { kind: "archived", permalink };
  });
}

/**
 * Point one snapshot at a new Wayback permalink.
 *
 * recordArchiveResult() leaves a row alone once it is archived, so a later
 * failure cannot wipe a good link. This repair runs only after a new
 * capture has already succeeded. A bad permalink throws before the update.
 * The page text is not in the update. This does not publish a price.
 */
export async function replaceArchivePermalink(
  db: EvidenceDb,
  input: { observationId: number; permalink: string },
): Promise<string> {
  assertObservationId(input.observationId);
  const permalink = readPermalink(input.permalink);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.id, input.observationId))
      .for("update");
    const row = rows[0];
    if (row === undefined) {
      throw new Error(`observation ${input.observationId} does not exist`);
    }

    await tx
      .update(observations)
      .set({ archiveUrl: permalink, archiveStatus: "archived" })
      .where(eq(observations.id, row.id));
    return permalink;
  });
}

function assertObservationId(observationId: number): void {
  if (!Number.isInteger(observationId) || observationId <= 0) {
    throw new Error("observation id must be a positive whole number");
  }
}

function readPermalink(permalink: string): string {
  const trimmed = permalink.trim();
  if (trimmed === "") {
    throw new Error("an archived observation needs a permalink");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("archive permalink is not a URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "web.archive.org") {
    throw new Error("archive permalink must be an https web.archive.org URL");
  }
  const match = /^\/web\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (match === null) {
    throw new Error("archive permalink is missing a timestamp or original URL");
  }
  return trimmed;
}

function prepareCheck(input: RecordSourceCheckInput): PreparedCheck {
  if (!(input.fetchedAt instanceof Date) || Number.isNaN(input.fetchedAt.getTime())) {
    throw new Error("fetchedAt is not a real time");
  }
  if (!Number.isInteger(input.sourceId) || input.sourceId <= 0) {
    throw new Error("source id must be a positive whole number");
  }
  if (input.labSlug.trim() === "") {
    throw new Error("lab slug is blank");
  }

  if (input.result.kind === "fetch_error") {
    return {
      kind: "fetch_error",
      note: readNote(input.result.note),
      httpStatus: readHttpStatus(input.httpStatus, "error"),
    };
  }

  const httpStatus = readHttpStatus(input.httpStatus, "success");
  if (input.result.kind === "parser_suspect") {
    return {
      kind: "parser_suspect",
      note: readNote(input.result.note),
      httpStatus,
    };
  }

  if (input.result.rawContent.trim() === "") {
    throw new Error("raw content is empty");
  }
  if (
    !Array.isArray(input.result.warnings) ||
    input.result.warnings.some((warning) => typeof warning !== "string")
  ) {
    throw new Error("warnings must be a list of strings");
  }

  return {
    kind: "parsed",
    httpStatus,
    rawContent: input.result.rawContent,
    rows: input.result.rows.map((row, index) => readPriceRow(row, index)),
    warnings: [...input.result.warnings],
  };
}

function readNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed === "") {
    throw new Error("a failed check needs a note");
  }
  return trimmed;
}

function readHttpStatus(status: number | null, kind: "error"): number | null;
function readHttpStatus(status: number | null, kind: "success"): number;
function readHttpStatus(status: number | null, kind: "error" | "success"): number | null {
  if (status === null) {
    if (kind === "success") {
      throw new Error("a parsed or suspect check needs an HTTP status");
    }
    return null;
  }
  if (!Number.isInteger(status)) {
    throw new Error(`HTTP status must be a whole number, got ${String(status)}`);
  }
  if (kind === "success" && (status < 200 || status > 299)) {
    throw new Error(`a parsed or suspect check needs HTTP 200-299, got ${String(status)}`);
  }
  return status;
}

function readPriceRow(row: NormalizedPrice, index: number): NormalizedPrice {
  const parsed = normalizedPriceSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error(`parsed price row ${index + 1} does not match the price shape`);
  }
  return parsed.data;
}

async function lockSource(db: EvidenceDb, sourceId: number): Promise<{ id: number }> {
  const rows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .for("update");
  const source = rows[0];
  if (source === undefined) {
    throw new Error(`source ${sourceId} does not exist`);
  }
  return source;
}

/**
 * Tracked means one model of this lab with exactly one global offering,
 * and that offering is the official API. Zero global offerings, or two,
 * would make us guess which row the item belongs to.
 */
async function loadTrackedOfferings(db: EvidenceDb, labSlug: string): Promise<TrackedOffering[]> {
  const labRows = await db
    .select({ id: labs.id })
    .from(labs)
    .where(eq(labs.slug, labSlug))
    .limit(1);
  const lab = labRows[0];
  if (lab === undefined) {
    throw new Error(`lab ${labSlug} does not exist`);
  }

  const modelRows = await db
    .select({ id: models.id, slug: models.slug })
    .from(models)
    .where(eq(models.labId, lab.id))
    .orderBy(asc(models.slug));
  if (modelRows.length === 0) {
    return [];
  }

  const offeringRows = await db
    .select({
      id: offerings.id,
      modelId: offerings.modelId,
      platform: offerings.platform,
    })
    .from(offerings)
    .where(
      and(
        inArray(
          offerings.modelId,
          modelRows.map((model) => model.id),
        ),
        eq(offerings.region, GLOBAL_REGION),
      ),
    );

  const byModel = new Map<number, { id: number; platform: string }[]>();
  for (const offering of offeringRows) {
    const list = byModel.get(offering.modelId) ?? [];
    list.push({ id: offering.id, platform: offering.platform });
    byModel.set(offering.modelId, list);
  }

  const tracked: TrackedOffering[] = [];
  for (const model of modelRows) {
    const globals = byModel.get(model.id) ?? [];
    if (globals.length === 0) {
      throw new Error(`model ${model.slug} has no global offerings`);
    }
    if (globals.length !== 1) {
      throw new Error(`model ${model.slug} has ${globals.length} global offerings`);
    }
    const offering = globals[0];
    if (offering === undefined || offering.platform !== OFFICIAL_PLATFORM) {
      throw new Error(`model ${model.slug} has no global official-api offering`);
    }
    tracked.push({ offeringId: offering.id, modelSlug: model.slug });
  }
  return tracked;
}

async function loadLatestObservation(
  db: EvidenceDb,
  sourceId: number,
): Promise<LatestObservation | null> {
  const rows = await db
    .select({
      fetchedAt: observations.fetchedAt,
      contentHash: observations.contentHash,
      parsedData: observations.parsedData,
    })
    .from(observations)
    .where(eq(observations.sourceId, sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  return rows[0] ?? null;
}

function assertNotBackdated(
  fetchedAt: Date,
  latest: LatestObservation | null,
  sourceId: number,
): void {
  if (latest !== null && fetchedAt.getTime() < latest.fetchedAt.getTime()) {
    throw new Error(`fetchedAt is earlier than the latest observation for source ${sourceId}`);
  }
}

async function fileVisit(
  db: EvidenceDb,
  input: {
    sourceId: number;
    fetchedAt: Date;
    checked: PreparedCheck;
    tracked: readonly TrackedOffering[];
    latest: LatestObservation | null;
  },
): Promise<RecordedSourceCheck> {
  if (input.checked.kind === "fetch_error") {
    await insertFetchLog(db, {
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      httpStatus: input.checked.httpStatus,
      outcome: "fetch_error",
      observationId: null,
      note: input.checked.note,
    });
    return { outcome: "fetch_error", observationId: null };
  }

  if (input.checked.kind === "parser_suspect") {
    await insertFetchLog(db, {
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      httpStatus: input.checked.httpStatus,
      outcome: "parser_suspect",
      observationId: null,
      note: input.checked.note,
    });
    return { outcome: "parser_suspect", observationId: null };
  }

  const check = checkParsedPrices({
    rows: input.checked.rows,
    expectedModelSlugs: input.tracked.map((item) => item.modelSlug),
  });
  if (check.status === "suspect") {
    await insertFetchLog(db, {
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      httpStatus: input.checked.httpStatus,
      outcome: "parser_suspect",
      observationId: null,
      note: check.reasons.join("\n"),
    });
    return { outcome: "parser_suspect", observationId: null };
  }

  const contentHash = fingerprintParsedPrices({
    rows: input.checked.rows,
    warnings: input.checked.warnings,
  });
  if (input.latest !== null && input.latest.contentHash === contentHash) {
    await insertFetchLog(db, {
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      httpStatus: input.checked.httpStatus,
      outcome: "unchanged",
      observationId: null,
      note: null,
    });
    return { outcome: "unchanged", observationId: null };
  }

  const observationId = await insertSnapshot(db, {
    sourceId: input.sourceId,
    fetchedAt: input.fetchedAt,
    contentHash,
    rawContent: input.checked.rawContent,
    rows: input.checked.rows,
    warnings: input.checked.warnings,
    tracked: input.tracked,
  });
  await insertFetchLog(db, {
    sourceId: input.sourceId,
    fetchedAt: input.fetchedAt,
    httpStatus: input.checked.httpStatus,
    outcome: "changed",
    observationId,
    note: null,
  });
  return { outcome: "changed", observationId };
}

/**
 * The one open price for each offering, when there is exactly one.
 *
 * Zero open prices, or two, are left out. The caller then flags that
 * model. This function only reads. It does not call publishPriceVersion().
 */
async function loadOpenPrices(
  db: EvidenceDb,
  offeringIds: readonly number[],
): Promise<Map<number, OpenPriceComponent[]>> {
  const open = new Map<number, OpenPriceComponent[]>();
  if (offeringIds.length === 0) {
    return open;
  }

  const versions = await db
    .select({
      id: priceVersions.id,
      offeringId: priceVersions.offeringId,
    })
    .from(priceVersions)
    .where(
      and(
        inArray(priceVersions.offeringId, [...offeringIds]),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    );

  const versionByOffering = new Map<number, number>();
  const skipped = new Set<number>();
  for (const version of versions) {
    if (skipped.has(version.offeringId) || versionByOffering.has(version.offeringId)) {
      versionByOffering.delete(version.offeringId);
      skipped.add(version.offeringId);
      continue;
    }
    versionByOffering.set(version.offeringId, version.id);
  }

  const versionIds = [...versionByOffering.values()];
  if (versionIds.length === 0) {
    return open;
  }

  const components = await db
    .select({
      priceVersionId: priceComponents.priceVersionId,
      dimension: priceComponents.dimension,
      unit: priceComponents.unit,
      amount: priceComponents.amount,
      condition: priceComponents.condition,
    })
    .from(priceComponents)
    .where(inArray(priceComponents.priceVersionId, versionIds));

  const byVersion = new Map<number, OpenPriceComponent[]>();
  for (const component of components) {
    const list = byVersion.get(component.priceVersionId) ?? [];
    list.push({
      dimension: component.dimension,
      unit: component.unit,
      amount: component.amount,
      condition: component.condition,
    });
    byVersion.set(component.priceVersionId, list);
  }

  for (const [offeringId, versionId] of versionByOffering) {
    const rows = byVersion.get(versionId);
    if (rows !== undefined && rows.length > 0) {
      open.set(offeringId, rows);
    }
  }
  return open;
}

async function insertSnapshot(
  db: EvidenceDb,
  input: {
    sourceId: number;
    fetchedAt: Date;
    contentHash: string;
    rawContent: string;
    rows: readonly NormalizedPrice[];
    warnings: readonly string[];
    tracked: readonly TrackedOffering[];
  },
): Promise<number> {
  const openPrices = await loadOpenPrices(
    db,
    input.tracked.map((item) => item.offeringId),
  );
  const observation = requireInsertedRow(
    await db
      .insert(observations)
      .values({
        sourceId: input.sourceId,
        fetchedAt: input.fetchedAt,
        contentHash: input.contentHash,
        rawContent: input.rawContent,
        rawContentHash: sha256(input.rawContent),
        parsedData: {
          rows: input.rows,
          warnings: input.warnings,
        },
      })
      .returning({ id: observations.id }),
    "insert observation",
  );

  for (const item of input.tracked) {
    const unchanged = trackedPriceUnchanged({
      nextRows: input.rows,
      modelSlug: item.modelSlug,
      fetchedAt: input.fetchedAt,
      open: openPrices.get(item.offeringId) ?? null,
    });
    requireInsertedRow(
      await db
        .insert(observationItems)
        .values({
          observationId: observation.id,
          offeringId: item.offeringId,
          reviewStatus: unchanged ? "confirmed" : "flagged",
          reviewedBy: unchanged ? SAME_PRICE_REVIEWER : null,
          reviewedAt: unchanged ? input.fetchedAt : null,
          reviewNote: unchanged ? SAME_PRICE_NOTE : null,
        })
        .returning({ id: observationItems.id }),
      "insert observation item",
    );
  }

  return observation.id;
}

async function insertFetchLog(
  db: EvidenceDb,
  input: {
    sourceId: number;
    fetchedAt: Date;
    httpStatus: number | null;
    outcome: RecordedSourceCheck["outcome"];
    observationId: number | null;
    note: string | null;
  },
): Promise<void> {
  requireInsertedRow(
    await db.insert(fetchLog).values(input).returning({ id: fetchLog.id }),
    "insert fetch log",
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
