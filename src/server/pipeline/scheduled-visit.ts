import { createHash, timingSafeEqual } from "node:crypto";
import { redactDatabaseUrl } from "@/server/db/seed";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { parseDatabaseEnv } from "@/server/env";
import {
  verifyOfficialSource,
  type VerifyOfficialResult,
} from "@/server/pipeline/verify-official-source";
import { anthropicSource } from "@/server/sources/anthropic-source";
import { googleSource } from "@/server/sources/google-source";
import { openaiSource } from "@/server/sources/openai-source";
import type { ProviderSource } from "@/server/sources/provider-source";

/**
 * One scheduled visit of one official pricing page.
 *
 * Vercel calls POST /api/verify/<lab> on a schedule. The route is a public
 * URL, so this check runs before the database opens. Vercel sends
 * CRON_SECRET as "Authorization: Bearer <secret>" when that variable is
 * set on the project. A missing or short secret refuses every call,
 * including a real schedule, so a deploy cannot check pages in the open.
 *
 * The comparison hashes both sides first. timingSafeEqual throws when the
 * buffers differ in length, and a short wrong header must stay a plain 401.
 */

const MIN_CRON_SECRET_LENGTH = 16;

const OFFICIAL_SOURCES: Record<string, ProviderSource> = {
  anthropic: anthropicSource,
  openai: openaiSource,
  google: googleSource,
};

export function officialSourceForLab(lab: string): ProviderSource | null {
  return OFFICIAL_SOURCES[lab] ?? null;
}

export function cronRequestAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret !== secret.trim() || secret.length < MIN_CRON_SECRET_LENGTH) {
    return false;
  }

  const expected = digest(`Bearer ${secret}`);
  const provided = digest(authorization ?? "");
  return timingSafeEqual(expected, provided);
}

type OpenedVisit = {
  db: EvidenceDb;
  close: () => Promise<unknown>;
};

type ScheduleHeaders = {
  get(name: string): string | null;
};

/**
 * Answer one schedule request.
 *
 * The route passes the real database, clock, and fetch through runVisit.
 * Tests pass fakes, so they never download a page. A refused request does
 * not open the database. A filed visit, including a failed download or a
 * failed archive, is HTTP 200. A throw is HTTP 500. The body never includes
 * the database URL or the archive keys. A filed visit also prints one JSON
 * line for the host log. That line repeats the response body, plus the
 * schedule name and execution id when Vercel sent them. It does not include
 * the secret or the database URL. This does not call publishPriceVersion().
 */
export async function respondToSchedule(input: {
  lab: string;
  authorization: string | null;
  headers?: ScheduleHeaders | null;
  env: NodeJS.Dict<string>;
  openDb: (databaseUrl: string) => OpenedVisit;
  runVisit: (db: EvidenceDb, source: ProviderSource) => Promise<VerifyOfficialResult>;
}): Promise<Response> {
  if (!cronRequestAuthorized(input.authorization, input.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const source = officialSourceForLab(input.lab);
  if (source === null) {
    return Response.json({ error: "unknown lab" }, { status: 404 });
  }

  let opened: OpenedVisit | null = null;
  try {
    const { databaseUrl } = parseDatabaseEnv(input.env);
    opened = input.openDb(databaseUrl);
    const result = await input.runVisit(opened.db, source);
    const body = visitBody(result);
    console.log(JSON.stringify(filedVisitLog(input.lab, body, input.headers)));
    return Response.json(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "verify failed";
    console.error(redactDatabaseUrl(message));
    return Response.json({ error: "verify failed" }, { status: 500 });
  } finally {
    if (opened !== null) {
      await opened.close();
    }
  }
}

/**
 * The production visit. The route is the edge: it passes the real clock,
 * fetch, and sleep. respondToSchedule() decides whether that visit runs.
 */
export function runProductionVisit(
  env: NodeJS.Dict<string>,
): (db: EvidenceDb, source: ProviderSource) => Promise<VerifyOfficialResult> {
  return (db, source) =>
    verifyOfficialSource(db, {
      source,
      fetchedAt: new Date(),
      fetchImpl: fetch,
      env,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
}

const SCHEDULE_NAME_HEADER = "ce-vssschedulename";
const EXECUTION_ID_HEADER = "ce-id";

/**
 * One line for the host log. Vercel shows stdout, not the JSON response.
 * A blank header is left out. Only these two header names are read.
 */
function filedVisitLog(
  lab: string,
  body: VisitBody,
  headers: ScheduleHeaders | null | undefined,
): VisitBody & { lab: string; schedule?: string; executionId?: string } {
  const schedule = headerValue(headers, SCHEDULE_NAME_HEADER);
  const executionId = headerValue(headers, EXECUTION_ID_HEADER);
  return {
    lab,
    ...body,
    ...(schedule === null ? {} : { schedule }),
    ...(executionId === null ? {} : { executionId }),
  };
}

function headerValue(headers: ScheduleHeaders | null | undefined, name: string): string | null {
  const value = headers?.get(name)?.trim() ?? "";
  return value === "" ? null : value;
}

type VisitBody = {
  kind: VerifyOfficialResult["kind"];
  note?: string;
  observationId?: number;
  archive?: "archived" | "already_archived" | "failed";
  permalink?: string;
  reason?: string;
};

function visitBody(result: VerifyOfficialResult): VisitBody {
  switch (result.kind) {
    case "fetch_error":
    case "parser_suspect":
      return { kind: result.kind, note: result.note };
    case "unchanged":
      return { kind: "unchanged" };
    case "changed":
      if (result.archive.kind === "failed") {
        return {
          kind: "changed",
          observationId: result.observationId,
          archive: "failed",
          reason: result.archive.reason,
        };
      }
      return {
        kind: "changed",
        observationId: result.observationId,
        archive: result.archive.kind,
        permalink: result.archive.permalink,
      };
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
