import { asc, desc, eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "@/server/db/schema";
import { fetchLog, observations, sources } from "@/server/db/schema";

/**
 * Read door for the source health page.
 *
 * This file only runs SELECT. It does not insert, update, or delete.
 * It does not call publishPriceVersion(). The page lists every source,
 * the latest check, and the archive status of the latest snapshot.
 * It does not select raw_content, parsed_data, or grounding_result.
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
  url: string;
  type: string;
  active: boolean;
  lastCheckedAt: Date | null;
  latestCheck: SourceHealthCheck | null;
  archiveStatus: string | null;
};

type JoinedSourceHealth = {
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
