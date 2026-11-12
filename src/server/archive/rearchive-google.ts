import { desc, eq, inArray } from "drizzle-orm";
import { GOOGLE_PRICING_URL } from "@/server/db/google-catalog";
import { replaceArchivePermalink, type EvidenceDb } from "@/server/db/repositories/evidence";
import { observations, sources } from "@/server/db/schema";
import { capturePage } from "@/server/archive/wayback-client";
import { requireIaKeys } from "@/server/archive/wayback-status";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Point the Google source at the markdown page, then replace the latest
 * snapshot's Wayback link with a capture of that page.
 *
 * The HTML page's script sends a browser to Google login, so the old
 * playback link does not show the prices. The markdown file is the same
 * pricing text with no script.
 *
 * The capture runs first in the sense that a failed capture leaves the old
 * permalink in place. The source URL is updated before the capture, so the
 * next visit fetches markdown even when this capture fails. The page text
 * already stored on the snapshot stays there. This does not insert a
 * snapshot or a review item, and it does not call publishPriceVersion().
 *
 * A second run, once the latest permalink already names the markdown page,
 * does not call Wayback.
 */

const PREVIOUS_GOOGLE_HTML_URLS = [
  "https://ai.google.dev/gemini-api/docs/pricing?hl=en",
  "https://aistudio.google.com/docs/pricing?hl=en",
] as const;

export type RearchiveGoogleInput = {
  env: NodeJS.Dict<string>;
  fetchImpl: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  markdownUrl?: string;
  previousUrls?: readonly string[];
};

export type RearchiveGoogleResult =
  | { kind: "archived"; observationId: number; permalink: string }
  | { kind: "already_markdown"; observationId: number; permalink: string }
  | { kind: "failed"; observationId: number; reason: string };

export async function rearchiveGoogleMarkdown(
  db: EvidenceDb,
  input: RearchiveGoogleInput,
): Promise<RearchiveGoogleResult> {
  const markdownUrl = input.markdownUrl ?? GOOGLE_PRICING_URL;
  const previousUrls = input.previousUrls ?? PREVIOUS_GOOGLE_HTML_URLS;
  const source = await findGoogleSource(db, markdownUrl, previousUrls);

  if (source.url !== markdownUrl) {
    await db.update(sources).set({ url: markdownUrl }).where(eq(sources.id, source.id));
  }

  const latest = await latestObservation(db, source.id);
  if (latest.archiveUrl !== null && archivedPageUrl(latest.archiveUrl) === markdownUrl) {
    return {
      kind: "already_markdown",
      observationId: latest.id,
      permalink: latest.archiveUrl,
    };
  }

  const keys = requireIaKeys(input.env);
  const captured = await capturePage(markdownUrl, {
    fetchImpl: input.fetchImpl,
    now: input.now,
    sleep: input.sleep,
    accessKey: keys.accessKey,
    secretKey: keys.secretKey,
  });
  if (captured.kind === "failed") {
    return { kind: "failed", observationId: latest.id, reason: captured.reason };
  }

  const permalink = await replaceArchivePermalink(db, {
    observationId: latest.id,
    permalink: captured.permalink,
  });
  return { kind: "archived", observationId: latest.id, permalink };
}

async function findGoogleSource(
  db: EvidenceDb,
  markdownUrl: string,
  previousUrls: readonly string[],
): Promise<{ id: number; url: string }> {
  const rows = await db
    .select({ id: sources.id, url: sources.url })
    .from(sources)
    .where(inArray(sources.url, [markdownUrl, ...previousUrls]));
  if (rows.length === 0) {
    throw new Error("google official source is missing");
  }
  if (rows.length > 1) {
    throw new Error("more than one Google pricing source row");
  }
  const row = rows[0];
  if (row === undefined) {
    throw new Error("google official source is missing");
  }
  return row;
}

async function latestObservation(
  db: EvidenceDb,
  sourceId: number,
): Promise<{ id: number; archiveUrl: string | null }> {
  const rows = await db
    .select({ id: observations.id, archiveUrl: observations.archiveUrl })
    .from(observations)
    .where(eq(observations.sourceId, sourceId))
    .orderBy(desc(observations.fetchedAt), desc(observations.id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error("google source has no stored snapshot");
  }
  return row;
}

/**
 * The page a Wayback permalink saved. The original URL's query string sits
 * on the permalink itself, after the timestamp, so it is not only the path.
 */
function archivedPageUrl(permalink: string): string | null {
  let url: URL;
  try {
    url = new URL(permalink);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "web.archive.org") {
    return null;
  }
  const match = /^\/web\/[^/]+\/(.*)$/.exec(url.pathname);
  if (match === null || match[1] === undefined || match[1] === "") {
    return null;
  }
  try {
    return decodeURIComponent(match[1]) + url.search + url.hash;
  } catch {
    return null;
  }
}
