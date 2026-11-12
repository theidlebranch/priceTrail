import {
  assessSourceHealth,
  findArchiveAnomalies,
  formatUtcCompact,
  formatUtcTimestamp,
  groupChecks,
  HEALTH_CONFIG,
  relativeTime,
  type ArchiveState,
  type FetchOutcome,
  type GroupedCheck,
  type HealthCheck,
  type HealthSnapshot,
  type HealthStatus,
  type HealthTone,
  type StripSlot,
} from "@/core/source-health";
import {
  SOURCE_CHECK_PAGE_SIZE,
  type SourceCheckCursor,
  type SourceCheckRow,
  type SourceHealthRow,
  type SourceHealthStats,
  type SourceObservationRef,
  type SourceSummary,
} from "@/server/db/repositories/source-health";

/**
 * Turn source rows into the board /review/sources renders, and one
 * source into the page /review/sources/<id> renders.
 *
 * This file does not open a database and does not call new Date().
 * The loader passes `now`. Relative labels and absolute UTC strings
 * are both computed here, then passed down, including into the client
 * Show more button, so the clock cannot change after hydration.
 *
 * A blank URL, an unknown outcome, a failed check with no note, or a
 * last-checked stamp that disagrees with the latest check still throws.
 * A schedule warning does not. A missing checker line and a "no checker"
 * note stay on the page, and they do not change the health status.
 */

export type { StripSlot };

const SOURCE_ID = /^[1-9][0-9]*$/;
const GROUP_PREVIEW = 20;

const SOURCE_TYPES = new Set([
  "official",
  "wayback",
  "aggregator",
  "announcement",
  "changelog_feed",
  "platform_api",
]);

const NO_CHECKER = "No checker is wired to this URL.";
const WILL_NOT_DOWNLOAD = "The next visit will stop before download.";

const STATUS_RANK: Record<HealthStatus, number> = {
  attention: 0,
  unchecked: 1,
  healthy: 2,
  paused: 3,
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  attention: "Needs attention",
  healthy: "Healthy",
  unchecked: "Not checked",
  paused: "Paused",
};

const OUTCOME_LABEL: Record<FetchOutcome, string> = {
  unchanged: "Unchanged",
  changed: "Changed",
  parser_suspect: "Parser failed",
  fetch_error: "Download failed",
};

export type BoardFilter = "all" | "attention" | "healthy";

export type TimedLabel = {
  relative: string;
  /** Full UTC, kept for screen readers. */
  absolute: string;
  /** Short UTC, such as "Nov 12 · 06:30". */
  short: string;
  /** Clock only, such as "06:30". */
  clock: string;
  /** Date only, such as "Nov 12". */
  date: string;
  dateTime: string;
};

export type WaybackView = {
  kind: "none" | ArchiveState;
  id: number | null;
  archiveUrl: string | null;
  chips: readonly string[];
  time: TimedLabel | null;
};

export type BoardEntry = {
  id: number;
  href: string;
  url: string;
  host: string;
  path: string;
  status: HealthStatus;
  statusLabel: string;
  reason: string;
  tone: HealthTone;
  scheduleNote: string | null;
  strip: StripSlot[];
  stripLabel: string;
  lastCheck: TimedLabel | null;
  lastChange: TimedLabel | null;
  snapshot: WaybackView;
};

export type SourceBoardView = {
  filter: BoardFilter;
  missingCheckerWarnings: string[];
  counts: {
    all: number;
    attention: number;
    healthy: number;
  };
  summary: {
    sourceCount: number;
    activeCount: number;
    pausedCount: number;
    attentionCount: number;
    attentionNames: string[];
    successText: string;
    okCount: number;
    checkCount: number;
    newestCheck: TimedLabel | null;
    /** "Nov 12 · next ≈ 18:00", or "No check yet" when nothing has run. */
    nextText: string;
  };
  entries: BoardEntry[];
};

export type HistoryCheckView = {
  id: number;
  time: TimedLabel;
  httpText: string;
};

export type HistoryRowView =
  | {
      kind: "single";
      id: number;
      tone: HealthTone;
      outcomeLabel: string;
      changed: boolean;
      firstCheck: boolean;
      time: TimedLabel;
      httpText: string;
      note: string | null;
      wayback: WaybackView;
    }
  | {
      kind: "group";
      id: number;
      tone: HealthTone;
      outcomeLabel: string;
      count: number;
      from: TimedLabel;
      to: TimedLabel;
      httpText: string;
      note: string | null;
      wayback: WaybackView;
      shown: HistoryCheckView[];
      hidden: HistoryCheckView[];
      showMoreLabel: string;
    };

export type SourceDetailView = {
  id: number;
  url: string;
  host: string;
  path: string;
  typeText: string;
  status: HealthStatus;
  statusLabel: string;
  reason: string;
  tone: HealthTone;
  scheduleLabel: string;
  attention: { title: string; body: string; note: string | null } | null;
  stats: {
    checkCount: number;
    firstCheck: TimedLabel | null;
    successText: string;
    okCount: number;
    lastChange: (TimedLabel & { snapshotId: number; archiveUrl: string | null }) | null;
    archived: number;
    pending: number;
    failed: number;
  };
  strip: StripSlot[];
  stripLabel: string;
  stripStart: TimedLabel | null;
  stripEnd: TimedLabel | null;
  history: HistoryRowView[];
  olderHref: string | null;
  emptyHistoryText: string | null;
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

/** An unknown status, including a typo, is the full list. */
export function parseBoardFilter(status: string | undefined): BoardFilter {
  if (status === "attention" || status === "healthy") {
    return status;
  }
  return "all";
}

/**
 * `?before=` and `?beforeId=` together. One without the other is a broken
 * link, not the first page. Both missing is the first page.
 */
export function parseHistoryCursor(
  before: string | undefined,
  beforeId: string | undefined,
): SourceCheckCursor | null {
  if (before === undefined && beforeId === undefined) {
    return null;
  }
  if (before === undefined || beforeId === undefined) {
    throw new Error("history cursor needs a time and an id");
  }
  const fetchedAt = new Date(before);
  if (Number.isNaN(fetchedAt.getTime())) {
    throw new Error("history cursor time is not a real date");
  }
  return { fetchedAt, id: parseSourceId(beforeId) };
}

export function toSourceBoardView(
  rows: readonly SourceHealthRow[],
  wiredUrls: readonly string[],
  filter: BoardFilter,
  now: Date,
): SourceBoardView {
  const clock = readNow(now);
  const wired = readWiredUrls(wiredUrls);
  const seen = new Set<string>();
  const built = rows.map((row) => {
    const url = readUrl(row.url, "source url");
    if (seen.has(url)) {
      throw new Error(`two sources share the url ${url}`);
    }
    seen.add(url);
    return toBoardEntry(row, url, wired, clock);
  });

  built.sort(
    (left, right) =>
      STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
      left.host.localeCompare(right.host) ||
      left.path.localeCompare(right.path),
  );

  const attention = built.filter((entry) => entry.status === "attention");
  const entries = filter === "all" ? built : built.filter((entry) => entry.status === filter);
  let ok = 0;
  let total = 0;
  let newest: Date | null = null;
  for (const row of rows) {
    const checks = orderChecks(row.checks).map(readHealthCheck);
    const latest = checks[0];
    if (latest !== undefined && (newest === null || latest.fetchedAt.getTime() > newest.getTime())) {
      newest = latest.fetchedAt;
    }
    // Paused sources stay on the board, but they are not part of the percent.
    if (row.active !== true) {
      continue;
    }
    ok += checks.filter((check) => check.outcome === "unchanged" || check.outcome === "changed").length;
    total += checks.length;
  }

  return {
    filter,
    missingCheckerWarnings: [...wired]
      .filter((url) => !seen.has(url))
      .map((url) => `The schedule looks up a URL that is not in the database: ${url}`),
    counts: {
      all: built.length,
      attention: attention.length,
      healthy: built.filter((entry) => entry.status === "healthy").length,
    },
    summary: {
      sourceCount: built.length,
      activeCount: built.filter((entry) => entry.status !== "paused").length,
      pausedCount: built.filter((entry) => entry.status === "paused").length,
      attentionCount: attention.length,
      attentionNames: attention.map((entry) => entry.host),
      successText: total === 0 ? "—" : `${Math.round((ok / total) * 100)}%`,
      okCount: ok,
      checkCount: total,
      newestCheck: newest === null ? null : timed(newest, clock, "checked at"),
      nextText: newest === null ? "No check yet" : nextRunText(newest),
    },
    entries,
  };
}

export function toSourceDetailView(
  source: SourceSummary,
  stats: SourceHealthStats,
  recent: readonly SourceCheckRow[],
  page: readonly SourceCheckRow[],
  observations: readonly SourceObservationRef[],
  now: Date,
): SourceDetailView {
  const clock = readNow(now);
  if (typeof source.active !== "boolean") {
    throw new Error("source active flag is not true or false");
  }
  if (!SOURCE_TYPES.has(source.type)) {
    throw new Error(`source type ${source.type} is unknown`);
  }
  if ((stats.checkCount === 0) !== (recent.length === 0)) {
    throw new Error("recent checks and the check count disagree");
  }

  const url = readUrl(source.url, "source url");
  const { host, path } = splitUrl(url);
  const recentChecks = orderChecks(recent).map(readHealthCheck);
  const pageChecks = orderChecks(page).map(readHealthCheck);
  const snapshot = latestSnapshot(observations);
  const health = assessSourceHealth({
    active: source.active,
    checks: recentChecks,
    now: clock,
    latestChangeAt:
      stats.latestChangeAt === null ? null : readDate(stats.latestChangeAt, "latest change time"),
    latestSnapshot: snapshot,
  });
  const anomalies = findArchiveAnomalies(
    observations.map((observation) => ({
      observationId: observation.id,
      archiveUrl: readArchiveUrl(observation.archiveUrl),
      fetchedAt: readDate(observation.fetchedAt, "snapshot time"),
    })),
  );
  const id = parseSourceId(String(source.id));
  const oldestOnPage = pageChecks[pageChecks.length - 1];
  const newestRecent = recentChecks[0];
  const oldestRecent = recentChecks[recentChecks.length - 1];

  return {
    id,
    url,
    host,
    path,
    typeText: source.type,
    status: health.status,
    statusLabel: STATUS_LABEL[health.status],
    reason: health.reason,
    tone: health.tone,
    scheduleLabel: source.active
      ? `Active · every ${HEALTH_CONFIG.CRON_INTERVAL_HOURS}h`
      : "Paused",
    attention: health.attention,
    stats: {
      checkCount: stats.checkCount,
      firstCheck:
        stats.firstCheckAt === null ? null : timed(readDate(stats.firstCheckAt, "first check time"), clock, "first check time"),
      successText: stats.checkCount === 0 ? "—" : `${Math.round((stats.okCount / stats.checkCount) * 100)}%`,
      okCount: stats.okCount,
      lastChange: lastChangeView(stats, observations, clock),
      archived: stats.archivedCount,
      pending: stats.pendingCount,
      failed: stats.failedCount,
    },
    strip: health.strip,
    stripLabel: health.stripLabel,
    stripStart: oldestRecent === undefined ? null : timed(oldestRecent.fetchedAt, clock, "checked at"),
    stripEnd: newestRecent === undefined ? null : timed(newestRecent.fetchedAt, clock, "checked at"),
    history: groupChecks(pageChecks, stats.firstCheckId).map((row) => toHistoryRow(row, anomalies, clock)),
    olderHref:
      pageChecks.length === SOURCE_CHECK_PAGE_SIZE && oldestOnPage !== undefined
        ? `/review/sources/${id}?before=${encodeURIComponent(oldestOnPage.fetchedAt.toISOString())}&beforeId=${oldestOnPage.id}`
        : null,
    emptyHistoryText:
      stats.checkCount === 0
        ? "This source has not been checked yet."
        : pageChecks.length === 0
          ? "No older checks."
          : null,
  };
}

function toBoardEntry(
  row: SourceHealthRow,
  url: string,
  wired: ReadonlySet<string>,
  now: Date,
): BoardEntry {
  if (typeof row.active !== "boolean") {
    throw new Error("source active flag is not true or false");
  }
  if (!SOURCE_TYPES.has(row.type)) {
    throw new Error(`source type ${row.type} is unknown`);
  }
  const hasStamp = row.lastCheckedAt !== null;
  const checks = orderChecks(row.checks).map(readHealthCheck);
  if (hasStamp !== (checks.length > 0)) {
    throw new Error("last checked time and the latest check disagree");
  }
  if (row.lastCheckedAt !== null) {
    readDate(row.lastCheckedAt, "last checked time");
  }

  const health = assessSourceHealth({
    active: row.active,
    checks,
    now,
    latestChangeAt:
      row.latestChangeAt === null ? null : readDate(row.latestChangeAt, "latest change time"),
    latestSnapshot: readSnapshot(row),
  });
  const id = parseSourceId(String(row.id));
  const place = splitUrl(url);
  const newest = checks[0];

  return {
    id,
    href: `/review/sources/${id}`,
    url,
    host: place.host,
    path: place.path,
    status: health.status,
    statusLabel: STATUS_LABEL[health.status],
    reason: health.reason,
    tone: health.tone,
    scheduleNote: scheduleNote(url, row, wired),
    strip: health.strip,
    stripLabel: health.stripLabel,
    lastCheck: newest === undefined ? null : timed(newest.fetchedAt, now, "checked at"),
    lastChange:
      row.latestChangeAt === null
        ? null
        : timed(readDate(row.latestChangeAt, "latest change time"), now, "latest change time"),
    snapshot: snapshotView(row, now),
  };
}

function readSnapshot(row: SourceHealthRow): HealthSnapshot | null {
  if (row.latestSnapshot === null) {
    return null;
  }
  return {
    id: row.latestSnapshot.id,
    archiveStatus: readArchive(row.latestSnapshot.archiveStatus),
    archiveUrl: readArchiveUrl(row.latestSnapshot.archiveUrl),
    fetchedAt: readDate(row.latestSnapshot.fetchedAt, "snapshot time"),
  };
}

function snapshotView(row: SourceHealthRow, now: Date): WaybackView {
  if (row.latestSnapshot === null) {
    return { kind: "none", id: null, archiveUrl: null, chips: [], time: null };
  }
  return {
    kind: readArchive(row.latestSnapshot.archiveStatus),
    id: row.latestSnapshot.id,
    archiveUrl: readArchiveUrl(row.latestSnapshot.archiveUrl),
    chips: [],
    time: timed(readDate(row.latestSnapshot.fetchedAt, "snapshot time"), now, "snapshot time"),
  };
}

function latestSnapshot(observations: readonly SourceObservationRef[]): HealthSnapshot | null {
  const sorted = [...observations].sort(
    (left, right) =>
      readDate(right.fetchedAt, "snapshot time").getTime() -
        readDate(left.fetchedAt, "snapshot time").getTime() || right.id - left.id,
  );
  const latest = sorted[0];
  if (latest === undefined) {
    return null;
  }
  return {
    id: latest.id,
    archiveStatus: readArchive(latest.archiveStatus),
    archiveUrl: readArchiveUrl(latest.archiveUrl),
    fetchedAt: readDate(latest.fetchedAt, "snapshot time"),
  };
}

function lastChangeView(
  stats: SourceHealthStats,
  observations: readonly SourceObservationRef[],
  now: Date,
): (TimedLabel & { snapshotId: number; archiveUrl: string | null }) | null {
  if (stats.latestChangeAt === null || stats.latestChangeObservationId === null) {
    return null;
  }
  const snapshotId = stats.latestChangeObservationId;
  const match = observations.find((observation) => observation.id === snapshotId);
  if (match === undefined) {
    throw new Error("latest change is missing its snapshot");
  }
  return {
    ...timed(readDate(stats.latestChangeAt, "latest change time"), now, "latest change time"),
    snapshotId,
    archiveUrl: readArchiveUrl(match.archiveUrl),
  };
}

function toHistoryRow(
  row: GroupedCheck,
  anomalies: Map<number, readonly string[]>,
  now: Date,
): HistoryRowView {
  if (row.kind === "single") {
    return singleHistoryRow(row.check, row.isFirstCheck, anomalies, now);
  }
  const newest = row.checks[0];
  const oldest = row.checks[row.checks.length - 1];
  if (newest === undefined || oldest === undefined) {
    throw new Error("a history group needs a check");
  }
  const preview = row.checks.slice(0, GROUP_PREVIEW).map((check) => historyCheck(check, now));
  const rest = row.checks.slice(GROUP_PREVIEW).map((check) => historyCheck(check, now));
  const failure = newest.outcome === "fetch_error" || newest.outcome === "parser_suspect";
  return {
    kind: "group",
    id: newest.id,
    tone: outcomeTone(newest.outcome),
    outcomeLabel: OUTCOME_LABEL[newest.outcome],
    count: row.checks.length,
    from: timed(oldest.fetchedAt, now, "checked at"),
    to: timed(newest.fetchedAt, now, "checked at"),
    httpText: httpText(newest.httpStatus),
    note: failure ? newest.note : null,
    wayback: emptyWayback(),
    shown: preview,
    hidden: rest,
    showMoreLabel: "Show more",
  };
}

function singleHistoryRow(
  check: HealthCheck,
  isFirstCheck: boolean,
  anomalies: Map<number, readonly string[]>,
  now: Date,
): HistoryRowView {
  const changed = check.outcome === "changed";
  return {
    kind: "single",
    id: check.id,
    tone: outcomeTone(check.outcome),
    outcomeLabel: OUTCOME_LABEL[check.outcome],
    changed,
    firstCheck: changed && isFirstCheck,
    time: timed(check.fetchedAt, now, "checked at"),
    httpText: httpText(check.httpStatus),
    note: check.note,
    wayback: changed ? changedWayback(check, anomalies, now) : emptyWayback(),
  };
}

function changedWayback(
  check: HealthCheck,
  anomalies: Map<number, readonly string[]>,
  now: Date,
): WaybackView {
  if (check.observationId === null || check.archiveStatus === null) {
    throw new Error("changed visit is missing its snapshot");
  }
  return {
    kind: check.archiveStatus,
    id: check.observationId,
    archiveUrl: check.archiveUrl,
    chips: anomalies.get(check.observationId) ?? [],
    time: timed(check.fetchedAt, now, "checked at"),
  };
}

function emptyWayback(): WaybackView {
  return { kind: "none", id: null, archiveUrl: null, chips: [], time: null };
}

function historyCheck(check: HealthCheck, now: Date): HistoryCheckView {
  return {
    id: check.id,
    time: timed(check.fetchedAt, now, "checked at"),
    httpText: httpText(check.httpStatus),
  };
}

function outcomeTone(outcome: FetchOutcome): HealthTone {
  switch (outcome) {
    case "unchanged":
      return "unchanged";
    case "changed":
      return "changed";
    case "parser_suspect":
      return "warn";
    case "fetch_error":
      return "error";
  }
}

function httpText(status: number | null): string {
  return status === null ? "—" : String(status);
}

function orderChecks(checks: readonly SourceCheckRow[]): SourceCheckRow[] {
  return [...checks].sort(
    (left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime() || right.id - left.id,
  );
}

function readHealthCheck(check: SourceCheckRow): HealthCheck {
  const outcome = readOutcome(check.outcome);
  const note = readNote(outcome, check.note);
  const httpStatus = readHttpStatus(outcome, check.httpStatus);
  const fetchedAt = readDate(check.fetchedAt, "checked at");
  if (outcome === "changed") {
    if (check.observationId === null || check.archiveStatus === null) {
      throw new Error("changed visit is missing its snapshot");
    }
    return {
      id: check.id,
      fetchedAt,
      httpStatus,
      outcome,
      note,
      observationId: parseSourceId(String(check.observationId)),
      archiveStatus: readArchive(check.archiveStatus),
      archiveUrl: readArchiveUrl(check.archiveUrl),
    };
  }
  if (check.observationId !== null || check.archiveStatus !== null || check.archiveUrl !== null) {
    throw new Error("changed visit is missing its snapshot, or another visit points at one");
  }
  return {
    id: check.id,
    fetchedAt,
    httpStatus,
    outcome,
    note,
    observationId: null,
    archiveStatus: null,
    archiveUrl: null,
  };
}

function readOutcome(value: string): FetchOutcome {
  if (
    value === "unchanged" ||
    value === "changed" ||
    value === "parser_suspect" ||
    value === "fetch_error"
  ) {
    return value;
  }
  throw new Error(`fetch outcome ${value} is unknown`);
}

function readArchive(value: string): ArchiveState {
  if (value === "pending" || value === "archived" || value === "failed") {
    return value;
  }
  throw new Error(`archive status ${value} is unknown`);
}

function readHttpStatus(outcome: FetchOutcome, status: number | null): number | null {
  if (outcome === "fetch_error") {
    if (status === null) {
      return null;
    }
    if (!Number.isInteger(status)) {
      throw new Error(`HTTP status must be a whole number, got ${String(status)}`);
    }
    return status;
  }
  if (status === null) {
    throw new Error("a successful check needs an HTTP status");
  }
  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new Error(`a successful check needs HTTP 200-299, got ${String(status)}`);
  }
  return status;
}

function readNote(outcome: FetchOutcome, note: string | null): string | null {
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

function scheduleNote(
  url: string,
  row: { active: boolean; type: string },
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

function readUrl(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is empty`);
  }
  return value.trim();
}

function splitUrl(url: string): { host: string; path: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("source url is not a url");
  }
  const path = `${parsed.pathname}${parsed.search}`;
  return { host: parsed.host, path: path.length === 0 ? "/" : path };
}

function readNow(now: Date): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("now is not a real date");
  }
  return now;
}

function readDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} is not a real date`);
  }
  return value;
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

function nextRunText(newest: Date): string {
  const next = new Date(newest.getTime() + HEALTH_CONFIG.CRON_INTERVAL_HOURS * 3_600_000);
  return `${formatUtcCompact(newest).date} · next ≈ ${formatUtcCompact(next).clock}`;
}

function timed(value: Date, now: Date, label: string): TimedLabel {
  const date = readDate(value, label);
  const compact = formatUtcCompact(date);
  return {
    relative: relativeTime(date, now),
    absolute: formatUtcTimestamp(date),
    short: compact.short,
    clock: compact.clock,
    date: compact.date,
    dateTime: date.toISOString(),
  };
}
