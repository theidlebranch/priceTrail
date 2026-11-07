import { formatReviewTimestamp } from "@/app/review/review-list";
import type { SourceHealthCheck, SourceHealthRow } from "@/server/db/repositories/source-health";

export type { SourceHealthRow };

/**
 * Turn source rows into the sentences /review/sources renders.
 *
 * This file does not open a database and does not call new Date().
 * The query already picked the latest check and the latest snapshot.
 * This function still refuses a row it cannot explain: a blank URL,
 * an unknown outcome, or a failed check with no note. An empty list
 * is a real empty catalog, not an error.
 *
 * A URL the schedule fetches that is missing from the rows is a
 * warning, not a throw. That gap is what the page is for.
 * A snapshot with no check is the seed. The page says the source
 * has not been checked yet.
 */

export type SourceHealthEntry = {
  url: string;
  typeText: string;
  activeText: string;
  lastCheckedText: string;
  outcomeText: string | null;
  checkedAtText: string | null;
  httpStatusText: string | null;
  note: string | null;
  archiveText: string;
  warning: string | null;
};

export type SourceHealthView = {
  missingCheckerWarnings: string[];
  entries: SourceHealthEntry[];
};

const SOURCE_TYPES = new Set([
  "official",
  "wayback",
  "aggregator",
  "announcement",
  "changelog_feed",
  "platform_api",
]);

const OUTCOME_TEXT: Record<string, string> = {
  unchanged: "Prices unchanged",
  changed: "Parsed prices changed",
  parser_suspect: "The parser could not read the page",
  fetch_error: "The download failed",
};

const ARCHIVE_TEXT: Record<string, string> = {
  pending: "Archive is still pending.",
  archived: "Archived.",
  failed: "Archive failed. The stored copy remains.",
};

const NO_CHECKER = "No checker is wired to this URL.";
const WILL_NOT_DOWNLOAD = "The next visit will stop before download.";

export function toSourceHealthView(
  rows: readonly SourceHealthRow[],
  wiredUrls: readonly string[],
): SourceHealthView {
  const wired = readWiredUrls(wiredUrls);
  const seen = new Set<string>();
  const entries = rows.map((row) => {
    const url = readUrl(row.url, "source url");
    if (seen.has(url)) {
      throw new Error(`two sources share the url ${url}`);
    }
    seen.add(url);
    return toEntry(row, url, wired);
  });

  const missingCheckerWarnings = [...wired]
    .filter((url) => !seen.has(url))
    .map((url) => `The schedule looks up a URL that is not in the database: ${url}`);

  return { missingCheckerWarnings, entries };
}

function readWiredUrls(wiredUrls: readonly string[]): Set<string> {
  const wired = new Set<string>();
  for (const wiredUrl of wiredUrls) {
    const url = readUrl(wiredUrl, "checker url");
    if (wired.has(url)) {
      throw new Error(`two checkers share the url ${url}`);
    }
    wired.add(url);
  }
  return wired;
}

function toEntry(row: SourceHealthRow, url: string, wired: ReadonlySet<string>): SourceHealthEntry {
  if (typeof row.active !== "boolean") {
    throw new Error("source active flag is not true or false");
  }
  if (!SOURCE_TYPES.has(row.type)) {
    throw new Error(`source type ${row.type} is unknown`);
  }

  const hasStamp = row.lastCheckedAt !== null;
  const hasCheck = row.latestCheck !== null;
  if (hasStamp !== hasCheck) {
    throw new Error("last checked time and the latest check disagree");
  }

  const check = row.latestCheck === null ? null : readCheck(row.latestCheck);
  return {
    url,
    typeText: row.type,
    activeText: row.active ? "Active" : "Inactive",
    lastCheckedText:
      row.lastCheckedAt === null
        ? "Not checked yet."
        : formatReviewTimestamp(row.lastCheckedAt, "last checked time"),
    outcomeText: check?.outcomeText ?? null,
    checkedAtText: check?.checkedAtText ?? null,
    httpStatusText: check?.httpStatusText ?? null,
    note: check?.note ?? null,
    archiveText: archiveText(row.archiveStatus),
    warning: warningFor(url, row, wired),
  };
}

function readCheck(check: SourceHealthCheck): {
  outcomeText: string;
  checkedAtText: string;
  httpStatusText: string;
  note: string | null;
} {
  const outcomeText = OUTCOME_TEXT[check.outcome];
  if (outcomeText === undefined) {
    throw new Error(`fetch outcome ${check.outcome} is unknown`);
  }

  return {
    outcomeText,
    checkedAtText: formatReviewTimestamp(check.fetchedAt, "checked at"),
    httpStatusText: httpStatusText(check.outcome, check.httpStatus),
    note: readNote(check.outcome, check.note),
  };
}

function httpStatusText(outcome: string, status: number | null): string {
  if (outcome === "fetch_error") {
    if (status === null) {
      return "no HTTP status";
    }
    if (!Number.isInteger(status)) {
      throw new Error(`HTTP status must be a whole number, got ${String(status)}`);
    }
    return String(status);
  }

  if (status === null) {
    throw new Error("a successful check needs an HTTP status");
  }
  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new Error(`a successful check needs HTTP 200-299, got ${String(status)}`);
  }
  return String(status);
}

function readNote(outcome: string, note: string | null): string | null {
  if (note !== null && typeof note !== "string") {
    throw new Error("note is not text");
  }
  const trimmed = note?.trim() ?? "";
  if (outcome === "parser_suspect" || outcome === "fetch_error") {
    if (trimmed === "") {
      throw new Error("a filed check was stored without a note");
    }
    return trimmed;
  }
  if (note === null) {
    return null;
  }
  if (trimmed === "") {
    throw new Error("a filed check was stored without a note");
  }
  return trimmed;
}

function archiveText(status: string | null): string {
  if (status === null) {
    return "No snapshot yet.";
  }
  const text = ARCHIVE_TEXT[status];
  if (text === undefined) {
    throw new Error(`archive status ${status} is unknown`);
  }
  return text;
}

function warningFor(
  url: string,
  row: SourceHealthRow,
  wired: ReadonlySet<string>,
): string | null {
  if (!wired.has(url)) {
    return NO_CHECKER;
  }
  if (!row.active || row.type !== "official") {
    return WILL_NOT_DOWNLOAD;
  }
  return null;
}

function readUrl(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is empty`);
  }
  return value.trim();
}
