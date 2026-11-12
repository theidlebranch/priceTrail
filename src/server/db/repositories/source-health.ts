import { asc, desc, eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "@/server/db/schema";
import { fetchLog, observations, sources } from "@/server/db/schema";

/**
 * Read door for the source health pages.
 *
 * This file only runs SELECT. It does not insert, update, or delete.
 * It does not call publishPriceVersion(). The list page reads every
 * source, the latest check, and the archive status of the latest
 * snapshot. The history page reads every visit for one source, and the
 * archive status and URL of that visit's snapshot when the outcome is
 * changed. Neither read selects raw_content, parsed_data, or
 * grounding_result.
 *
 * Latest means the greatest fetched_at. When two rows share that time,
 * the greater id wins. A left join with only half of a check throws.
 * Guessing the missing half would hide a broken read.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a test.
 * A transaction is a different class with the same select methods.
 */
export type SourceHealthDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type SourceHealthCheck = {
  outcome: string;
  fetchedAt: Date;
  httpStatus: number | null;
  note: string | null;
};

export type SourceHealthRow = {
  id: number;
  url: string;
  type: string;
  active: boolean;
  lastCheckedAt: Date | null;
  latestCheck: SourceHealthCheck | null;
  archiveStatus: string | null;
};

type JoinedSourceHealth = {
  id: number;
  url: string;
  type: string;
  active: boolean;
  lastCheckedAt: Date | null;
  outcome: string | null;
  fetchedAt: Date | null;
  httpStatus: number | null;
  note: string | null;
  archiveStatus: string | null;
};

/**
 * One stored visit. archive_status and archive_url come from the
 * snapshot only when this visit's outcome is changed. A changed visit
 * with no snapshot, or any other outcome that points at one, is a
 * broken read.
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

export async function listSourceHealth(db: SourceHealthDb): Promise<SourceHealthRow[]> {
  const latestCheck = db
    .select({
      outcome: fetchLog.outcome,
      fetchedAt: fetchLog.fetchedAt,
      httpStatus: fetchLog.httpStatus,
      note: fetchLog.note,
    })
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sources.id))
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id))
    .limit(1)
    .as("latest_check");

  const latestSnapshot = db
    .select({
      archiveStatus: observations.archiveStatus,
    })
    .from(observations)
    .where(eq(observations.sourceId, sources.id))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1)
    .as("latest_snapshot");

  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      type: sources.type,
      active: sources.active,
      lastCheckedAt: sources.lastCheckedAt,
      outcome: latestCheck.outcome,
      fetchedAt: latestCheck.fetchedAt,
      httpStatus: latestCheck.httpStatus,
      note: latestCheck.note,
      archiveStatus: latestSnapshot.archiveStatus,
    })
    .from(sources)
    .leftJoinLateral(latestCheck, sql`true`)
    .leftJoinLateral(latestSnapshot, sql`true`)
    .orderBy(asc(sources.url));

  return rows.map(assembleSourceHealthRow);
}

/**
 * A lateral join returns nulls when that source has no check.
 * Outcome and time are both required on a real check, and both empty
 * when there is no check. One without the other is a broken read.
 */
export function assembleSourceHealthRow(row: JoinedSourceHealth): SourceHealthRow {
  const outcomeMissing = row.outcome === null;
  const timeMissing = row.fetchedAt === null;
  if (outcomeMissing !== timeMissing) {
    throw new Error("latest check is missing an outcome or a time");
  }
  if (outcomeMissing && (row.httpStatus !== null || row.note !== null)) {
    throw new Error("latest check is missing an outcome or a time");
  }

  return {
    id: row.id,
    url: row.url,
    type: row.type,
    active: row.active,
    lastCheckedAt: row.lastCheckedAt,
    latestCheck:
      row.outcome === null || row.fetchedAt === null
        ? null
        : {
            outcome: row.outcome,
            fetchedAt: row.fetchedAt,
            httpStatus: row.httpStatus,
            note: row.note,
          },
    archiveStatus: row.archiveStatus,
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
 * Every visit for one source, newest first.
 *
 * This only runs SELECT. It does not select raw_content, parsed_data,
 * or grounding_result. A changed visit must join a snapshot. Any other
 * outcome must not. Guessing either half would hide a broken read.
 * A source with no visits is an empty list, including a missing id.
 * The page checks hasSource() before it treats that empty list as
 * "not checked yet."
 */
export async function listSourceChecks(
  db: SourceHealthDb,
  sourceId: number,
): Promise<SourceCheckRow[]> {
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
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(desc(fetchLog.fetchedAt), desc(fetchLog.id));

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
