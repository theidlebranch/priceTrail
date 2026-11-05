import { desc, eq } from "drizzle-orm";
import { archiveObservation, type ArchiveObservationResult } from "@/server/archive/archive-observation";
import {
  recordSourceCheck,
  type EvidenceDb,
  type RecordedSourceCheck,
} from "@/server/db/repositories/evidence";
import { fetchLog, sources } from "@/server/db/schema";
import type { FetchLike, ProviderSource } from "@/server/sources/provider-source";

/**
 * Check one official pricing page and, when the parsed prices are new,
 * ask Wayback to save that page.
 *
 * This chains the pieces that already exist. The caller picks the page
 * (Anthropic or OpenAI today). It does not call publishPriceVersion().
 * A new snapshot stays flagged. The open price stays open.
 *
 * The caller passes the clock, fetch, and sleep. This file does not call
 * new Date() and does not wait on a real timer, so a test can run without
 * the network.
 *
 * recordSourceCheck() and archiveObservation() each commit their own
 * database transaction. They are not wrapped together here. A missing
 * Internet Archive key throws after the snapshot is stored, and that
 * snapshot stays pending.
 */

export type VerifyOfficialResult =
  | { kind: "fetch_error"; note: string }
  | { kind: "parser_suspect"; note: string }
  | { kind: "unchanged" }
  | {
      kind: "changed";
      observationId: number;
      archive: ArchiveObservationResult;
    };

export async function verifyOfficialSource(
  db: EvidenceDb,
  input: {
    source: ProviderSource;
    fetchedAt: Date;
    fetchImpl: FetchLike;
    env: NodeJS.Dict<string>;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<VerifyOfficialResult> {
  const sourceRow = await findOfficialSource(db, input.source.url);

  let page: Awaited<ReturnType<ProviderSource["fetchPage"]>>;
  try {
    page = await input.source.fetchPage(input.fetchImpl);
  } catch (error) {
    const note = failureNote(error, "download failed");
    await recordSourceCheck(db, {
      sourceId: sourceRow.id,
      fetchedAt: input.fetchedAt,
      httpStatus: null,
      labSlug: input.source.lab,
      result: { kind: "fetch_error", note },
    });
    return { kind: "fetch_error", note };
  }

  let parsed: ReturnType<ProviderSource["parse"]>;
  try {
    parsed = input.source.parse(page.rawContent);
  } catch (error) {
    const note = failureNote(error, "parse failed");
    await recordSourceCheck(db, {
      sourceId: sourceRow.id,
      fetchedAt: input.fetchedAt,
      httpStatus: page.httpStatus,
      labSlug: input.source.lab,
      result: { kind: "parser_suspect", note },
    });
    return { kind: "parser_suspect", note };
  }

  const filed = await recordSourceCheck(db, {
    sourceId: sourceRow.id,
    fetchedAt: input.fetchedAt,
    httpStatus: page.httpStatus,
    labSlug: input.source.lab,
    result: {
      kind: "parsed",
      rawContent: page.rawContent,
      rows: parsed.rows,
      warnings: parsed.warnings,
    },
  });

  if (filed.outcome === "unchanged") {
    return { kind: "unchanged" };
  }
  if (filed.outcome === "parser_suspect" || filed.outcome === "fetch_error") {
    return { kind: filed.outcome, note: await latestNote(db, sourceRow.id) };
  }

  const observationId = requireChangedObservationId(filed);
  const archive = await archiveObservation(db, {
    observationId,
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
    sleep: input.sleep,
  });
  return { kind: "changed", observationId, archive };
}

/**
 * A changed check has to point at the snapshot it just stored.
 * Archiving a missing id would look like success and save nothing.
 */
export function requireChangedObservationId(filed: RecordedSourceCheck): number {
  if (filed.outcome !== "changed" || filed.observationId === null) {
    throw new Error("a changed check did not return an observation");
  }
  return filed.observationId;
}

/**
 * The fetch log needs a note for a failed visit. A thrown number, or an
 * Error with a blank message, would otherwise be stored as an empty note
 * and then rejected. The fallback says what kind of failure it was.
 */
export function failureNote(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message !== "") {
      return message;
    }
  }
  return fallback;
}

/**
 * The detailed reason for a suspect parse is written on the fetch log,
 * not returned by recordSourceCheck(). A blank note means that row cannot
 * explain itself. Guessing a reason would hide the gap.
 */
export function filedNote(note: string | null): string {
  const trimmed = note?.trim() ?? "";
  if (trimmed === "") {
    throw new Error("a filed check was stored without a note");
  }
  return trimmed;
}

async function findOfficialSource(db: EvidenceDb, url: string): Promise<{ id: number }> {
  const rows = await db
    .select({
      id: sources.id,
      type: sources.type,
      active: sources.active,
    })
    .from(sources)
    .where(eq(sources.url, url))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`source ${url} does not exist`);
  }
  if (!row.active) {
    throw new Error(`source ${url} is inactive`);
  }
  if (row.type !== "official") {
    throw new Error(`source ${url} is not an official page`);
  }
  return { id: row.id };
}

async function latestNote(db: EvidenceDb, sourceId: number): Promise<string> {
  const rows = await db
    .select({ note: fetchLog.note })
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(desc(fetchLog.id))
    .limit(1);
  return filedNote(rows[0]?.note ?? null);
}
