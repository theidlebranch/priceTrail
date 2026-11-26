import { and, asc, eq, isNull } from "drizzle-orm";
import { eventsFromVisit } from "@/core/alerts/site-alert";
import { postDiscordAlert } from "@/server/alerts/post-discord-alert";
import { redactDatabaseUrl } from "@/server/db/seed";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { fetchTriggers, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { cronRequestAuthorized, officialSourceForUrl } from "@/server/pipeline/scheduled-visit";
import {
  verifyOfficialSource,
  type VerifyOfficialResult,
} from "@/server/pipeline/verify-official-source";
import type { FetchLike, ProviderSource } from "@/server/sources/provider-source";

/**
 * Run the oldest pending disagreement trigger.
 *
 * The claim locks that row and skips a row another drain already holds,
 * then the lock ends before the visit. The visit commits on its own, so a
 * missing archive key can keep the snapshot. A returned result, including
 * a failed download, sets processed_at. A throw leaves the row pending.
 * After a filed visit, a Discord message names a new model, a retirement
 * or gone card, or a page that could not be read. That post runs before
 * processed_at is set. A failed post does not skip the stamp, and a
 * failed stamp does not undo the post. One call visits one page. This
 * file does not call publishPriceVersion(). The open price stays open.
 */

export type PendingTriggerRun =
  | { processed: 0 }
  | { processed: 1; triggerId: number; result: VerifyOfficialResult };

type ClaimedTrigger = {
  id: number;
  source: ProviderSource;
};

export async function runPendingTriggers(
  db: EvidenceDb,
  input: {
    fetchedAt: Date;
    processedAt: Date;
    fetchImpl: FetchLike;
    env: NodeJS.Dict<string>;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<PendingTriggerRun> {
  assertRealDate(input.fetchedAt, "fetchedAt");
  assertRealDate(input.processedAt, "processedAt");

  const claimed = await claimOldestPending(db);
  if (claimed === null) {
    return { processed: 0 };
  }

  const result = await verifyOfficialSource(db, {
    source: claimed.source,
    fetchedAt: input.fetchedAt,
    fetchImpl: input.fetchImpl,
    env: input.env,
    now: input.now,
    sleep: input.sleep,
  });

  try {
    await postDiscordAlert({
      events: eventsFromVisit(claimed.source.lab, result.kind, result.cards),
      env: input.env,
      fetchImpl: input.fetchImpl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Discord post failed";
    console.error(redactDatabaseUrl(message));
  }

  await db
    .update(fetchTriggers)
    .set({ processedAt: input.processedAt })
    .where(and(eq(fetchTriggers.id, claimed.id), isNull(fetchTriggers.processedAt)));

  return { processed: 1, triggerId: claimed.id, result };
}

/**
 * The oldest blank processed_at. skipLocked means a second drain, holding
 * its own connection, takes the next page instead of waiting on this one.
 * The transaction ends here, so the visit is not rolled back with the lock.
 */
async function claimOldestPending(db: EvidenceDb): Promise<ClaimedTrigger | null> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: fetchTriggers.id,
        url: sources.url,
      })
      .from(fetchTriggers)
      .innerJoin(sources, eq(fetchTriggers.sourceId, sources.id))
      .where(isNull(fetchTriggers.processedAt))
      .orderBy(asc(fetchTriggers.createdAt), asc(fetchTriggers.id))
      .limit(1)
      .for("update", { of: fetchTriggers, skipLocked: true });

    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const source = officialSourceForUrl(row.url);
    if (source === null) {
      throw new Error(`pending trigger ${row.id} does not point at an official page`);
    }
    return { id: row.id, source };
  });
}

function assertRealDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} is not a real date`);
  }
}

type OpenedDrain = {
  db: EvidenceDb;
  close: () => Promise<unknown>;
};

type ScheduleHeaders = {
  get(name: string): string | null;
};

const SCHEDULE_NAME_HEADER = "ce-vssschedulename";
const EXECUTION_ID_HEADER = "ce-id";

/**
 * Answer one drain request.
 *
 * The secret is checked before the database opens. No pending row is
 * HTTP 200. A filed visit is HTTP 200. A throw is HTTP 500. The body
 * leaves out the database URL and the archive keys.
 */
export async function respondToTriggerDrain(input: {
  authorization: string | null;
  headers?: ScheduleHeaders | null;
  env: NodeJS.Dict<string>;
  openDb: (databaseUrl: string) => OpenedDrain;
  runDrain: (db: EvidenceDb) => Promise<PendingTriggerRun>;
}): Promise<Response> {
  if (!cronRequestAuthorized(input.authorization, input.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let opened: OpenedDrain | null = null;
  try {
    const { databaseUrl } = parseDatabaseEnv(input.env);
    opened = input.openDb(databaseUrl);
    const result = await input.runDrain(opened.db);
    const body = drainBody(result);
    console.log(JSON.stringify(drainLog(body, input.headers)));
    return Response.json(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "trigger drain failed";
    console.error(redactDatabaseUrl(message));
    return Response.json({ error: "trigger drain failed" }, { status: 500 });
  } finally {
    if (opened !== null) {
      await opened.close();
    }
  }
}

type DrainBody = {
  processed: 0 | 1;
  triggerId?: number;
  kind?: VerifyOfficialResult["kind"];
  note?: string;
};

function drainBody(result: PendingTriggerRun): DrainBody {
  if (result.processed === 0) {
    return { processed: 0 };
  }
  if (result.result.kind === "fetch_error" || result.result.kind === "parser_suspect") {
    return {
      processed: 1,
      triggerId: result.triggerId,
      kind: result.result.kind,
      note: result.result.note,
    };
  }
  return { processed: 1, triggerId: result.triggerId, kind: result.result.kind };
}

function drainLog(
  body: DrainBody,
  headers: ScheduleHeaders | null | undefined,
): DrainBody & { schedule?: string; executionId?: string } {
  const schedule = headerValue(headers, SCHEDULE_NAME_HEADER);
  const executionId = headerValue(headers, EXECUTION_ID_HEADER);
  return {
    ...body,
    ...(schedule === null ? {} : { schedule }),
    ...(executionId === null ? {} : { executionId }),
  };
}

function headerValue(headers: ScheduleHeaders | null | undefined, name: string): string | null {
  const value = headers?.get(name)?.trim() ?? "";
  return value === "" ? null : value;
}
