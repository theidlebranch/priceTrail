import { formatReviewTimestamp } from "@/app/review/review-list";
import type {
  SourceCheckRow,
  SourceHealthCheck,
  SourceHealthRow,
  SourceSummary,
} from "@/server/db/repositories/source-health";

export type { SourceHealthRow };

/**
 * Turn source rows into the sentences /review/sources renders, and one
 * source's visits into the sentences /review/sources/<id> renders.
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
 *
 * The visit color and the Wayback color are separate. A changed visit
 * can be blue while its archive line is red.
 */

export type StatusTone = "ok" | "info" | "warning" | "error" | "neutral";

export type SourceHealthEntry = {
  id: number;
  href: string;
  url: string;
  typeText: string;
  activeText: string;
  lastCheckedText: string;
  visitColor: StatusTone;
  outcomeText: string | null;
  checkedAtText: string | null;
  httpStatusText: string | null;
  note: string | null;
  archiveColor: StatusTone;
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
const WAYBACK_NOT_ASKED = "Wayback was not asked.";
const SOURCE_ID = /^[1-9][0-9]*$/;

const VISIT_COLOR: Record<string, StatusTone> = {
  "Prices unchanged": "ok",
  "Parsed prices changed": "info",
  "The parser could not read the page": "warning",
  "The download failed": "error",
};

const ARCHIVE_COLOR: Record<string, StatusTone> = {
  "Archived.": "ok",
  "Archive is still pending.": "warning",
  "Archive failed. The stored copy remains.": "error",
  "No snapshot yet.": "neutral",
  [WAYBACK_NOT_ASKED]: "neutral",
};

/**
 * The path segment for /review/sources/<id>. A leading zero, a sign, or
 * a decimal is not the id the database stored.
 */
export function parseSourceId(segment: string): number {
  if (!SOURCE_ID.test(segment)) {
    throw new Error("Source id is not a whole number.");
  }
  const id = Number(segment);
  if (!Number.isSafeInteger(id)) {
    throw new Error("Source id is not a whole number.");
  }
  return id;
}

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
  const id = parseSourceId(String(row.id));
  const archive = archiveText(row.archiveStatus);
  return {
    id,
    href: `/review/sources/${id}`,
    url,
    typeText: row.type,
    activeText: row.active ? "Active" : "Inactive",
    lastCheckedText:
      row.lastCheckedAt === null
        ? "Not checked yet."
        : formatReviewTimestamp(row.lastCheckedAt, "last checked time"),
    visitColor: visitColor(check?.outcomeText ?? null),
    outcomeText: check?.outcomeText ?? null,
    checkedAtText: check?.checkedAtText ?? null,
    httpStatusText: check?.httpStatusText ?? null,
    note: check?.note ?? null,
    archiveColor: archiveColor(archive),
    archiveText: archive,
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

function visitColor(outcomeText: string | null): StatusTone {
  if (outcomeText === null) {
    return "neutral";
  }
  const color = VISIT_COLOR[outcomeText];
  if (color === undefined) {
    throw new Error(`visit sentence ${outcomeText} has no color`);
  }
  return color;
}

function archiveColor(text: string): StatusTone {
  const color = ARCHIVE_COLOR[text];
  if (color === undefined) {
    throw new Error(`archive sentence ${text} has no color`);
  }
  return color;
}

export type SourceHistoryView = {
  url: string;
  typeText: string;
  activeText: string;
  checks: SourceCheckEntry[];
};

export type SourceCheckEntry = {
  id: number;
  visitColor: StatusTone;
  outcomeText: string;
  checkedAtText: string;
  httpStatusText: string;
  note: string | null;
  archiveColor: StatusTone;
  archiveText: string;
  snapshotText: string | null;
  archiveUrl: string | null;
};

/**
 * One source and every visit the query already ordered. An empty check
 * list is a real source that has not been visited. A changed visit
 * without a snapshot throws. Any other visit that points at a snapshot
 * throws.
 */
export function toSourceHistoryView(
  source: SourceSummary,
  checks: readonly SourceCheckRow[],
): SourceHistoryView {
  if (typeof source.active !== "boolean") {
    throw new Error("source active flag is not true or false");
  }
  if (!SOURCE_TYPES.has(source.type)) {
    throw new Error(`source type ${source.type} is unknown`);
  }

  return {
    url: readUrl(source.url, "source url"),
    typeText: source.type,
    activeText: source.active ? "Active" : "Inactive",
    checks: checks.map(toCheckEntry),
  };
}

function toCheckEntry(check: SourceCheckRow): SourceCheckEntry {
  const read = readCheck(check);
  const id = parseSourceId(String(check.id));
  if (check.outcome === "changed") {
    return changedCheck(id, read, check);
  }
  if (check.observationId !== null || check.archiveStatus !== null || check.archiveUrl !== null) {
    throw new Error("changed visit is missing its snapshot, or another visit points at one");
  }
  return {
    id,
    visitColor: visitColor(read.outcomeText),
    outcomeText: read.outcomeText,
    checkedAtText: read.checkedAtText,
    httpStatusText: read.httpStatusText,
    note: read.note,
    archiveColor: "neutral",
    archiveText: WAYBACK_NOT_ASKED,
    snapshotText: null,
    archiveUrl: null,
  };
}

function changedCheck(
  id: number,
  read: ReturnType<typeof readCheck>,
  check: SourceCheckRow,
): SourceCheckEntry {
  if (check.observationId === null || check.archiveStatus === null) {
    throw new Error("changed visit is missing its snapshot");
  }
  const text = archiveText(check.archiveStatus);
  return {
    id,
    visitColor: visitColor(read.outcomeText),
    outcomeText: read.outcomeText,
    checkedAtText: read.checkedAtText,
    httpStatusText: read.httpStatusText,
    note: read.note,
    archiveColor: archiveColor(text),
    archiveText: text,
    snapshotText: `Snapshot ${parseSourceId(String(check.observationId))}.`,
    archiveUrl: readArchiveUrl(check.archiveUrl),
  };
}

function readArchiveUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("archive url is empty");
  }
  return value.trim();
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

/**
 * A row needs a visible mark when a check, archive, or schedule
 * problem is already in the sentences. A quiet success stays quiet.
 * This does not read the database. It only looks at the view text.
 */
export function sourceEntryNeedsAttention(entry: SourceHealthEntry): boolean {
  return (
    entry.archiveText === "Archive failed. The stored copy remains." ||
    entry.httpStatusText === "no HTTP status" ||
    entry.outcomeText === "The download failed" ||
    entry.outcomeText === "The parser could not read the page" ||
    entry.activeText === "Inactive" ||
    entry.warning !== null
  );
}

export type SourceHealthSummary = {
  sources: number;
  needsAttention: number;
  healthy: number;
};

/**
 * Counts already on the view. A missing-checker line is not a source,
 * so it raises the attention count and leaves the healthy count alone.
 */
export function summarizeSourceHealth(view: SourceHealthView): SourceHealthSummary {
  const attentionRows = view.entries.filter(sourceEntryNeedsAttention).length;
  return {
    sources: view.entries.length,
    needsAttention: attentionRows + view.missingCheckerWarnings.length,
    healthy: view.entries.length - attentionRows,
  };
}
