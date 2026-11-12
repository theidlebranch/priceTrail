import { and, asc, desc, eq, lt, or, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { HEALTH_CONFIG } from "@/core/source-health";
import * as schema from "@/server/db/schema";
import { fetchLog, observations, sources } from "@/server/db/schema";

/**
 * Read door for the source health pages.
 *
 * This file only runs SELECT. It does not insert, update, or delete.
 * It does not call publishPriceVersion(). It does not select
 * raw_content, parsed_data, or grounding_result.
 *
 * The list is one statement: each source, its newest 24 checks, its
 * newest snapshot ever, and the time of its newest price change even
 * when that change is older than the 24. A week of unchanged checks
 * must not hide an older price change or an older Wayback copy.
 * The check subquery names "sources"."id". A bare id in that subquery
 * is ambiguous, and Postgres rejects the query.
 *
 * Latest means the greatest fetched_at. When two rows share that time,
 * the greater id wins. A changed row without a snapshot throws. Any
 * other outcome that points at a snapshot throws. Guessing either half
 * would hide a broken read.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a test.
 * A transaction is a different class with the same select methods.
 */
export type SourceHealthDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** One page of history. Two checks can share a timestamp, so the cursor carries the id too. */
export const SOURCE_CHECK_PAGE_SIZE = 50;

export type SourceCheckCursor = {
  fetchedAt: Date;
  id: number;
};

/**
 * One stored visit. archive_status and archive_url come from the
 * snapshot only when this visit's outcome is changed.
 */
export type SourceCheckRow = {
  id: number;
  fetchedAt: Date;
  httpStatus: number | null;
  outcome: string;
  note: string | null;
  observationId: number | null;
  archiveStatus: string | null;
  archiveUrl: string | null;
};

export type SourceSnapshotRow = {
  id: number;
  archiveStatus: string;
  archiveUrl: string | null;
  fetchedAt: Date;
};

export type SourceHealthRow = {
  id: number;
  url: string;
  type: string;
  active: boolean;
  lastCheckedAt: Date | null;
  /** Newest first, at most 24. */
  checks: SourceCheckRow[];
  latestSnapshot: SourceSnapshotRow | null;
  latestChangeAt: Date | null;
};

type JoinedSourceHealth = {
  id: number;
  url: string;
  type: string;
  active: boolean;
  lastCheckedAt: Date | null;
  checks: unknown;
  snapshotId: number | null;
  snapshotArchiveStatus: string | null;
  snapshotArchiveUrl: string | null;
  snapshotFetchedAt: Date | string | null;
  latestChangeAt: Date | string | null;
};

type JoinedSourceCheck = {
  id: number;
  fetchedAt: Date;
  httpStatus: number | null;
  outcome: string;
  note: string | null;
  observationId: number | null;
  archiveStatus: string | null;
  archiveUrl: string | null;
};

export type SourceHealthStats = {
  checkCount: number;
  okCount: number;
  firstCheckId: number | null;
  firstCheckAt: Date | null;
  pendingCount: number;
  archivedCount: number;
  failedCount: number;
  latestChangeAt: Date | null;
  latestChangeObservationId: number | null;
};

export type SourceObservationRef = {
  id: number;
  archiveUrl: string | null;
  fetchedAt: Date;
  archiveStatus: string;
};

export async function listSourceHealth(db: SourceHealthDb): Promise<SourceHealthRow[]> {
  // One row per source. The inner limit keeps the newest 24, then json_agg
  // folds them so the list does not run a query per source.
  const recentChecks = db
    .select({
      checks: sql<unknown>`coalesce((
        select json_agg(json_build_object(
          'id', item.id,
          'outcome', item.outcome,
          'fetchedAt', item.fetched_at,
          'httpStatus', item.http_status,
          'note', item.note,
          'observationId', item.observation_id,
          'archiveStatus', item.archive_status,
          'archiveUrl', item.archive_url
        ) order by item.fetched_at desc, item.id desc)
        from (
          select
            fl.id,
            fl.outcome,
            fl.fetched_at,
            fl.http_status,
            fl.note,
            fl.observation_id,
            obs.archive_status,
            obs.archive_url
          from ${fetchLog} fl
          left join ${observations} obs on obs.id = fl.observation_id
          where fl.source_id = "sources"."id"
          order by fl.fetched_at desc, fl.id desc
          limit ${HEALTH_CONFIG.STRIP_LENGTH}
        ) item
      ), '[]'::json)`.as("checks"),
    })
    .from(sql`(select 1) as recent_anchor`)
    .as("recent_checks");

  const latestSnapshot = db
    .select({
      id: observations.id,
      archiveStatus: observations.archiveStatus,
      archiveUrl: observations.archiveUrl,
      fetchedAt: observations.fetchedAt,
    })
    .from(observations)
    .where(eq(observations.sourceId, sources.id))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1)
    .as("latest_snapshot");

  const latestChange = db
    .select({
      fetchedAt: fetchLog.fetchedAt,
    })
    .from(fetchLog)
    .where(and(eq(fetchLog.sourceId, sources.id), eq(fetchLog.outcome, "changed")))
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id))
    .limit(1)
    .as("latest_change");

  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      type: sources.type,
      active: sources.active,
      lastCheckedAt: sources.lastCheckedAt,
      checks: recentChecks.checks,
      snapshotId: latestSnapshot.id,
      snapshotArchiveStatus: latestSnapshot.archiveStatus,
      snapshotArchiveUrl: latestSnapshot.archiveUrl,
      snapshotFetchedAt: latestSnapshot.fetchedAt,
      latestChangeAt: latestChange.fetchedAt,
    })
    .from(sources)
    .leftJoinLateral(recentChecks, sql`true`)
    .leftJoinLateral(latestSnapshot, sql`true`)
    .leftJoinLateral(latestChange, sql`true`)
    .orderBy(asc(sources.url));

  return rows.map(assembleSourceHealthRow);
}

/**
 * A lateral join returns nulls when that source has no check or no snapshot.
 * A check needs both an outcome and a time. A snapshot needs an id, a
 * status, and a time. One without the other is a broken read.
 */
export function assembleSourceHealthRow(row: JoinedSourceHealth): SourceHealthRow {
  return {
    id: row.id,
    url: row.url,
    type: row.type,
    active: row.active,
    lastCheckedAt: row.lastCheckedAt,
    checks: readRecentChecks(row.checks),
    latestSnapshot: readLatestSnapshot(row),
    latestChangeAt:
      row.latestChangeAt === null ? null : readDate(row.latestChangeAt, "latest change time"),
  };
}

export type SourceSummary = {
  id: number;
  url: string;
  type: string;
  active: boolean;
};

/**
 * The source row the history page names.
 *
 * A missing id is null. The page throws when the proxy already found
 * the row and this read does not, because the row disappeared between
 * the two checks. This does not read visits or page text.
 */
export async function findSource(db: SourceHealthDb, id: number): Promise<SourceSummary | null> {
  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      type: sources.type,
      active: sources.active,
    })
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * True when this source exists.
 *
 * The request proxy calls this before the page shell starts, so a
 * missing id can answer 404. It does not read the page text or the
 * parsed prices.
 */
export async function hasSource(db: SourceHealthDb, id: number): Promise<boolean> {
  const rows = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).limit(1);

  return rows.length > 0;
}

/**
 * Counts and the first check, not a page of rows.
 * The history page uses these for the stat cards and the first-check pill,
 * so a later page still knows which visit was the first one.
 * The subqueries name "sources"."id" for the same reason as the list.
 */
export async function readSourceHealthStats(
  db: SourceHealthDb,
  sourceId: number,
): Promise<SourceHealthStats> {
  const rows = await db
    .select({
      checkCount: sql<number>`(select count(*)::int from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id")`,
      okCount: sql<number>`(select count(*)::int from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id" and ${fetchLog.outcome} in ('unchanged', 'changed'))`,
      firstCheckId: sql<number | null>`(select ${fetchLog.id} from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id" order by ${fetchLog.fetchedAt} asc, ${fetchLog.id} asc limit 1)`,
      firstCheckAt: sql<Date | null>`(select ${fetchLog.fetchedAt} from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id" order by ${fetchLog.fetchedAt} asc, ${fetchLog.id} asc limit 1)`,
      pendingCount: sql<number>`(select count(*)::int from ${observations} where ${observations.sourceId} = "sources"."id" and ${observations.archiveStatus} = 'pending')`,
      archivedCount: sql<number>`(select count(*)::int from ${observations} where ${observations.sourceId} = "sources"."id" and ${observations.archiveStatus} = 'archived')`,
      failedCount: sql<number>`(select count(*)::int from ${observations} where ${observations.sourceId} = "sources"."id" and ${observations.archiveStatus} = 'failed')`,
      latestChangeAt: sql<Date | null>`(select ${fetchLog.fetchedAt} from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id" and ${fetchLog.outcome} = 'changed' order by ${fetchLog.fetchedAt} desc, ${fetchLog.id} desc limit 1)`,
      latestChangeObservationId: sql<number | null>`(select ${fetchLog.observationId} from ${fetchLog} where ${fetchLog.sourceId} = "sources"."id" and ${fetchLog.outcome} = 'changed' order by ${fetchLog.fetchedAt} desc, ${fetchLog.id} desc limit 1)`,
    })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new Error("source disappeared before the page could read it");
  }
  return assembleSourceHealthStats(row);
}

/** The newest 24 checks, for the strip and the status. Not the history page. */
export async function listRecentSourceChecks(
  db: SourceHealthDb,
  sourceId: number,
): Promise<SourceCheckRow[]> {
  return selectSourceChecks(db, sourceId, null, HEALTH_CONFIG.STRIP_LENGTH);
}

/**
 * One page of visits, newest first.
 * The cursor is the oldest row already shown. The next page is strictly
 * older than that time, or the same time with a smaller id.
 */
export async function listSourceCheckPage(
  db: SourceHealthDb,
  sourceId: number,
  cursor: SourceCheckCursor | null,
): Promise<SourceCheckRow[]> {
  return selectSourceChecks(db, sourceId, cursor, SOURCE_CHECK_PAGE_SIZE);
}

/**
 * Snapshot ids and Wayback URLs for the anomaly chips.
 * This does not select the page text.
 */
export async function listSourceObservationRefs(
  db: SourceHealthDb,
  sourceId: number,
): Promise<SourceObservationRef[]> {
  return db
    .select({
      id: observations.id,
      archiveUrl: observations.archiveUrl,
      fetchedAt: observations.fetchedAt,
      archiveStatus: observations.archiveStatus,
    })
    .from(observations)
    .where(eq(observations.sourceId, sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id));
}

async function selectSourceChecks(
  db: SourceHealthDb,
  sourceId: number,
  cursor: SourceCheckCursor | null,
  limit: number,
): Promise<SourceCheckRow[]> {
  const olderThanCursor =
    cursor === null
      ? undefined
      : or(
          lt(fetchLog.fetchedAt, cursor.fetchedAt),
          and(eq(fetchLog.fetchedAt, cursor.fetchedAt), lt(fetchLog.id, cursor.id)),
        );

  const rows = await db
    .select({
      id: fetchLog.id,
      fetchedAt: fetchLog.fetchedAt,
      httpStatus: fetchLog.httpStatus,
      outcome: fetchLog.outcome,
      note: fetchLog.note,
      observationId: fetchLog.observationId,
      archiveStatus: observations.archiveStatus,
      archiveUrl: observations.archiveUrl,
    })
    .from(fetchLog)
    .leftJoin(observations, eq(fetchLog.observationId, observations.id))
    .where(
      olderThanCursor === undefined
        ? eq(fetchLog.sourceId, sourceId)
        : and(eq(fetchLog.sourceId, sourceId), olderThanCursor),
    )
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id))
    .limit(limit);

  return rows.map(assembleSourceCheck);
}

export function assembleSourceCheck(row: JoinedSourceCheck): SourceCheckRow {
  const changed = row.outcome === "changed";
  const hasSnapshot =
    row.observationId !== null || row.archiveStatus !== null || row.archiveUrl !== null;
  if (changed !== hasSnapshot || (changed && row.archiveStatus === null)) {
    throw new Error("changed visit is missing its snapshot, or another visit points at one");
  }

  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    httpStatus: row.httpStatus,
    outcome: row.outcome,
    note: row.note,
    observationId: row.observationId,
    archiveStatus: row.archiveStatus,
    archiveUrl: row.archiveUrl,
  };
}

function assembleSourceHealthStats(row: {
  checkCount: number | string;
  okCount: number | string;
  firstCheckId: number | string | null;
  firstCheckAt: Date | string | null;
  pendingCount: number | string;
  archivedCount: number | string;
  failedCount: number | string;
  latestChangeAt: Date | string | null;
  latestChangeObservationId: number | string | null;
}): SourceHealthStats {
  const checkCount = readCount(row.checkCount, "check count");
  const okCount = readCount(row.okCount, "ok count");
  const firstCheckId = row.firstCheckId === null ? null : readWholeNumber(row.firstCheckId, "first check id");
  const firstCheckAt = row.firstCheckAt === null ? null : readDate(row.firstCheckAt, "first check time");
  if ((checkCount === 0) !== (firstCheckId === null) || (firstCheckId === null) !== (firstCheckAt === null)) {
    throw new Error("first check is missing an id or a time");
  }
  if (okCount > checkCount) {
    throw new Error("ok count is larger than the check count");
  }

  const latestChangeAt =
    row.latestChangeAt === null ? null : readDate(row.latestChangeAt, "latest change time");
  const latestChangeObservationId =
    row.latestChangeObservationId === null
      ? null
      : readWholeNumber(row.latestChangeObservationId, "latest change snapshot");
  if ((latestChangeAt === null) !== (latestChangeObservationId === null)) {
    throw new Error("latest change is missing its snapshot");
  }

  return {
    checkCount,
    okCount,
    firstCheckId,
    firstCheckAt,
    pendingCount: readCount(row.pendingCount, "pending snapshot count"),
    archivedCount: readCount(row.archivedCount, "archived snapshot count"),
    failedCount: readCount(row.failedCount, "failed snapshot count"),
    latestChangeAt,
    latestChangeObservationId,
  };
}

function readRecentChecks(value: unknown): SourceCheckRow[] {
  const parsed = typeof value === "string" ? parseCheckList(value) : value;
  if (parsed === null || parsed === undefined) {
    return [];
  }
  if (!Array.isArray(parsed)) {
    throw new Error("latest checks are not a list");
  }
  if (parsed.length > HEALTH_CONFIG.STRIP_LENGTH) {
    throw new Error("latest checks returned more than 24 rows");
  }
  const checks = parsed.map(readRecentCheck);
  checks.sort((left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime() || right.id - left.id);
  return checks;
}

function parseCheckList(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("latest checks are not a list");
  }
}

function readRecentCheck(value: unknown): SourceCheckRow {
  if (value === null || typeof value !== "object") {
    throw new Error("latest check is missing an outcome or a time");
  }
  const row = value as Record<string, unknown>;
  if (row.outcome === null || row.outcome === undefined || row.fetchedAt === null || row.fetchedAt === undefined) {
    throw new Error("latest check is missing an outcome or a time");
  }

  return assembleSourceCheck({
    id: readWholeNumber(row.id, "check id"),
    fetchedAt: readDate(row.fetchedAt, "checked at"),
    httpStatus: readNullableHttpStatus(row.httpStatus),
    outcome: readRequiredText(row.outcome, "fetch outcome"),
    note: readNullableText(row.note, "note"),
    observationId:
      row.observationId === null || row.observationId === undefined
        ? null
        : readWholeNumber(row.observationId, "snapshot id"),
    archiveStatus: readNullableText(row.archiveStatus, "archive status"),
    archiveUrl: readNullableText(row.archiveUrl, "archive url"),
  });
}

function readLatestSnapshot(row: JoinedSourceHealth): SourceSnapshotRow | null {
  const idMissing = row.snapshotId === null;
  const statusMissing = row.snapshotArchiveStatus === null;
  const timeMissing = row.snapshotFetchedAt === null;
  if (idMissing !== statusMissing || idMissing !== timeMissing || (idMissing && row.snapshotArchiveUrl !== null)) {
    throw new Error("latest snapshot is missing an id, a status, or a time");
  }
  if (row.snapshotId === null || row.snapshotArchiveStatus === null || row.snapshotFetchedAt === null) {
    return null;
  }
  return {
    id: row.snapshotId,
    archiveStatus: row.snapshotArchiveStatus,
    archiveUrl: row.snapshotArchiveUrl,
    fetchedAt: readDate(row.snapshotFetchedAt, "snapshot time"),
  };
}

function readCount(value: number | string, label: string): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} is not a whole number`);
  }
  return count;
}

function readWholeNumber(value: unknown, label: string): number {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(id)) {
    throw new Error(`${label} is not a whole number`);
  }
  return id;
}

function readDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (date === null || Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a real date`);
  }
  return date;
}

function readRequiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is empty`);
  }
  return value;
}

function readNullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} is not text`);
  }
  return value;
}

function readNullableHttpStatus(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const status = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(status)) {
    throw new Error(`HTTP status must be a whole number, got ${String(value)}`);
  }
  return status;
}
