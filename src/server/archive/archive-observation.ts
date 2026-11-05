import { capturePage } from "@/server/archive/wayback-client";
import { requireIaKeys } from "@/server/archive/wayback-status";
import {
  findObservationArchive,
  recordArchiveResult,
  type EvidenceDb,
} from "@/server/db/repositories/evidence";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Ask Wayback to save the page behind one stored snapshot.
 *
 * This is the only place that both calls Save Page Now and writes the
 * archive columns. The client does not know about the database. The
 * repository does not know about HTTP.
 *
 * A missing Internet Archive key throws before any request and before
 * any update, so the row stays pending. A Wayback error, a bad response,
 * or a timeout is stored as failed. The page text from the check stays
 * in raw_content. This function does not publish a price.
 */

export type ArchiveObservationResult =
  | { kind: "archived"; permalink: string }
  | { kind: "failed"; reason: string }
  | { kind: "already_archived"; permalink: string };

export async function archiveObservation(
  db: EvidenceDb,
  input: {
    observationId: number;
    env: NodeJS.Dict<string>;
    fetchImpl: FetchLike;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<ArchiveObservationResult> {
  const keys = requireIaKeys(input.env);
  const current = await findObservationArchive(db, input.observationId);
  if (current === null) {
    throw new Error(`observation ${input.observationId} does not exist`);
  }
  if (current.archiveStatus === "archived") {
    if (current.archiveUrl === null || current.archiveUrl.trim() === "") {
      throw new Error(`observation ${current.id} is archived without a permalink`);
    }
    return { kind: "already_archived", permalink: current.archiveUrl };
  }

  const captured = await capturePage(current.pageUrl, {
    fetchImpl: input.fetchImpl,
    now: input.now,
    sleep: input.sleep,
    accessKey: keys.accessKey,
    secretKey: keys.secretKey,
  });
  const recorded = await recordArchiveResult(db, {
    observationId: current.id,
    result:
      captured.kind === "archived"
        ? { kind: "archived", permalink: captured.permalink }
        : { kind: "failed" },
  });
  if (recorded.kind === "unchanged") {
    return { kind: "already_archived", permalink: recorded.permalink };
  }
  return captured;
}
