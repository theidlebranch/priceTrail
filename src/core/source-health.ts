/**
 * Health of one stored source, from checks the caller already loaded.
 *
 * This file does not read a database, render JSX, or call new Date().
 * The page passes `now`, so a test can freeze the clock and the server
 * and the browser cannot disagree about "5h ago".
 *
 * Status uses the first matching rule. A paused source stays paused even
 * when the latest download failed. A warning here is not a published price.
 */

export const HEALTH_CONFIG = {
  CRON_INTERVAL_HOURS: 6,
  STRIP_LENGTH: 24,
  STALE_AFTER_HOURS: 13,
  PENDING_ARCHIVE_WARN_HOURS: 24,
} as const;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

export type FetchOutcome = "unchanged" | "changed" | "parser_suspect" | "fetch_error";

export type ArchiveState = "pending" | "archived" | "failed";

export type HealthTone = "unchanged" | "changed" | "warn" | "error" | "muted";

export type HealthStatus = "paused" | "unchecked" | "attention" | "healthy";

/**
 * One stored visit. Ids stay numbers, matching the bigint columns.
 * `checks` passed to assessSourceHealth are newest first.
 */
export type HealthCheck = {
  id: number;
  fetchedAt: Date;
  httpStatus: number | null;
  outcome: FetchOutcome;
  note: string | null;
  observationId: number | null;
  archiveStatus: ArchiveState | null;
  archiveUrl: string | null;
};

/** The newest observation for this source, even when it is older than the strip. */
export type HealthSnapshot = {
  id: number;
  archiveStatus: ArchiveState;
  archiveUrl: string | null;
  fetchedAt: Date;
};

export type StripSlot = {
  /** Null is an empty slot. The strip is always 24 wide, oldest on the left. */
  outcome: FetchOutcome | null;
  title: string;
};

export type SourceAttention = {
  title: string;
  body: string;
  note: string | null;
};

export type SourceHealthAssessment = {
  status: HealthStatus;
  reason: string;
  tone: HealthTone;
  attention: SourceAttention | null;
  /** How many newest checks share this failure and this note. A good check resets it. */
  streak: number;
  /** The oldest check in that failure run. Null when the source is not in a failure run. */
  since: Date | null;
  successRate: { ok: number; total: number };
  strip: StripSlot[];
  stripLabel: string;
};

export type GroupedCheck =
  | { kind: "single"; check: HealthCheck; isFirstCheck: boolean }
  | { kind: "group"; checks: HealthCheck[]; isFirstCheck: boolean };

export type ArchiveAnomalyInput = {
  observationId: number | null;
  archiveUrl: string | null;
  fetchedAt: Date;
};

const CAPTURE_STAMP = /\/web\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\//;

/**
 * How long ago `then` was, as of `now`.
 * Under a minute is "just now". Then minutes, hours, and days, rounded down.
 */
export function relativeTime(then: Date, now: Date): string {
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

/** Absolute UTC, the same shape the review list already prints. */
export function formatUtcTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("time is not a real date");
  }
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * A short UTC stamp for the page, plus the clock and the date on their own.
 * The full timestamp stays available for screen readers.
 */
export function formatUtcCompact(value: Date): { short: string; clock: string; date: string } {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("time is not a real date");
  }
  const date = `${UTC_MONTHS[value.getUTCMonth()]} ${value.getUTCDate()}`;
  const clock = `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  return { short: `${date} · ${clock}`, clock, date };
}

export function assessSourceHealth(input: {
  active: boolean;
  checks: readonly HealthCheck[];
  now: Date;
  latestChangeAt: Date | null;
  latestSnapshot: HealthSnapshot | null;
}): SourceHealthAssessment {
  if (input.checks.length > HEALTH_CONFIG.STRIP_LENGTH) {
    throw new Error("a source health strip keeps at most 24 checks");
  }

  const strip = buildStrip(input.checks);
  const rate = successRate(input.checks);
  const base = {
    successRate: rate,
    strip,
    stripLabel: describeStrip(strip),
  };

  if (input.active === false) {
    return {
      ...base,
      status: "paused",
      reason: "Paused",
      tone: "muted",
      attention: null,
      streak: 0,
      since: null,
    };
  }

  if (input.checks.length === 0) {
    return {
      ...base,
      status: "unchecked",
      reason: "Not checked yet",
      tone: "muted",
      attention: null,
      streak: 0,
      since: null,
    };
  }

  const newest = input.checks[0];
  if (newest === undefined) {
    throw new Error("a source health strip keeps at most 24 checks");
  }

  if (newest.outcome === "fetch_error" || newest.outcome === "parser_suspect") {
    const run = failureRun(input.checks, newest);
    const title = failureTitle(newest.outcome, run.count, run.capped);
    return {
      ...base,
      status: "attention",
      reason: title,
      tone: newest.outcome === "fetch_error" ? "error" : "warn",
      attention: {
        title,
        body: failureBody(newest, input.checks, input.now),
        note: newest.note,
      },
      streak: run.count,
      since: run.since,
    };
  }

  const checkAge = input.now.getTime() - newest.fetchedAt.getTime();
  if (checkAge > HEALTH_CONFIG.STALE_AFTER_HOURS * HOUR_MS) {
    const hours = Math.floor(checkAge / HOUR_MS);
    const title = `No check for ${hours}h`;
    return {
      ...base,
      status: "attention",
      reason: title,
      tone: "warn",
      attention: {
        title,
        body: `The last check was ${relativeTime(newest.fetchedAt, input.now)}. The schedule runs about every 6 hours.`,
        note: newest.note,
      },
      streak: 0,
      since: null,
    };
  }

  const snapshot = input.latestSnapshot;
  if (snapshot?.archiveStatus === "failed") {
    const title = "Wayback failed · stored copy kept";
    return {
      ...base,
      status: "attention",
      reason: title,
      tone: "warn",
      attention: {
        title,
        body: "Wayback did not keep a copy. The stored page text is still the evidence. Nothing new was published from this warning.",
        note: newest.note,
      },
      streak: 0,
      since: null,
    };
  }

  if (snapshot?.archiveStatus === "pending") {
    const pendingAge = input.now.getTime() - snapshot.fetchedAt.getTime();
    if (pendingAge > HEALTH_CONFIG.PENDING_ARCHIVE_WARN_HOURS * HOUR_MS) {
      const hours = Math.floor(pendingAge / HOUR_MS);
      const title = `Archive pending for ${hours}h`;
      return {
        ...base,
        status: "attention",
        reason: title,
        tone: "warn",
        attention: {
          title,
          body: `The snapshot is stored here, and the Internet Archive has not returned a permalink for ${hours} hours.`,
          note: newest.note,
        },
        streak: 0,
        since: null,
      };
    }
  }

  const reason =
    input.latestChangeAt === null
      ? "Prices unchanged"
      : `Prices changed ${relativeTime(input.latestChangeAt, input.now)}`;

  return {
    ...base,
    status: "healthy",
    reason,
    tone: newest.outcome === "changed" ? "changed" : "unchanged",
    attention: null,
    streak: 0,
    since: null,
  };
}

/**
 * Newest first. A price change stays its own row, because that row has a snapshot.
 * Other checks merge only while outcome, HTTP status, and note stay the same.
 * One check stays one row. `isFirstCheck` marks the row that holds `firstCheckId`.
 */
export function groupChecks(
  checks: readonly HealthCheck[],
  firstCheckId: number | null,
): GroupedCheck[] {
  const grouped: GroupedCheck[] = [];
  let index = 0;
  while (index < checks.length) {
    const start = checks[index];
    if (start === undefined) {
      break;
    }
    if (start.outcome === "changed") {
      grouped.push({
        kind: "single",
        check: start,
        isFirstCheck: start.id === firstCheckId,
      });
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < checks.length && sameRun(start, checks[end])) {
      end += 1;
    }
    const run = checks.slice(index, end);
    const isFirstCheck = run.some((check) => check.id === firstCheckId);
    const only = run[0];
    if (run.length === 1 && only !== undefined) {
      grouped.push({ kind: "single", check: only, isFirstCheck });
    } else {
      grouped.push({ kind: "group", checks: run, isFirstCheck });
    }
    index = end;
  }
  return grouped;
}

/**
 * Chips for a shared Wayback URL, and for a capture timestamp more than
 * one hour older than the check. A missing URL is not a shared capture.
 * A URL without /web/YYYYMMDDhhmmss/ gets no time warning. Exactly one
 * hour is not a warning. Later copies point at the earliest observation id.
 */
export function findArchiveAnomalies(
  checks: readonly ArchiveAnomalyInput[],
): Map<number, readonly string[]> {
  const chips = new Map<number, string[]>();
  const byUrl = new Map<string, { observationId: number; fetchedAt: Date }[]>();

  for (const check of checks) {
    if (check.observationId === null || check.archiveUrl === null || check.archiveUrl.length === 0) {
      continue;
    }
    const group = byUrl.get(check.archiveUrl) ?? [];
    group.push({ observationId: check.observationId, fetchedAt: check.fetchedAt });
    byUrl.set(check.archiveUrl, group);
  }

  for (const group of byUrl.values()) {
    if (group.length < 2) {
      continue;
    }
    const sorted = [...group].sort(
      (left, right) =>
        left.fetchedAt.getTime() - right.fetchedAt.getTime() ||
        left.observationId - right.observationId,
    );
    const earliest = sorted[0];
    if (earliest === undefined) {
      continue;
    }
    for (const later of sorted.slice(1)) {
      pushChip(chips, later.observationId, `same capture as #${earliest.observationId}`);
    }
  }

  for (const check of checks) {
    if (check.observationId === null) {
      continue;
    }
    const older = captureOlderChip(check.archiveUrl, check.fetchedAt);
    if (older !== null) {
      pushChip(chips, check.observationId, older);
    }
  }

  return chips;
}

function failureRun(
  checks: readonly HealthCheck[],
  newest: HealthCheck,
): { count: number; since: Date; capped: boolean } {
  let count = 0;
  let since = newest.fetchedAt;
  for (const check of checks) {
    if (check.outcome !== newest.outcome || check.note !== newest.note) {
      break;
    }
    count += 1;
    since = check.fetchedAt;
  }
  return {
    count,
    since,
    capped: checks.length === HEALTH_CONFIG.STRIP_LENGTH && count === HEALTH_CONFIG.STRIP_LENGTH,
  };
}

function failureTitle(
  outcome: "fetch_error" | "parser_suspect",
  count: number,
  capped: boolean,
): string {
  const name = outcome === "fetch_error" ? "Download" : "Parser";
  if (count <= 1) {
    return `${name} failed`;
  }
  const amount = capped ? "24+" : String(count);
  return `${name} failing · ${amount} checks in a row`;
}

function failureBody(newest: HealthCheck, checks: readonly HealthCheck[], now: Date): string {
  const lead =
    newest.outcome === "fetch_error"
      ? "The site did not return a page, so nothing was stored or published."
      : parserLead(newest.httpStatus);
  return `${lead} ${lastGoodSentence(checks, now)}`;
}

function parserLead(status: number | null): string {
  if (status === null) {
    return "The site answered, but the page could not be read, so nothing was stored or published.";
  }
  return `The site answered with HTTP ${status} but the page could not be read, so nothing was stored or published.`;
}

function lastGoodSentence(checks: readonly HealthCheck[], now: Date): string {
  const good = checks.find((check) => check.outcome === "unchanged" || check.outcome === "changed");
  if (good === undefined) {
    return "There is no good read in the last 24 checks.";
  }
  return `The last good read was ${relativeTime(good.fetchedAt, now)}.`;
}

function successRate(checks: readonly HealthCheck[]): { ok: number; total: number } {
  const ok = checks.filter(
    (check) => check.outcome === "unchanged" || check.outcome === "changed",
  ).length;
  return { ok, total: checks.length };
}

function buildStrip(checks: readonly HealthCheck[]): StripSlot[] {
  const filled = [...checks].reverse().map((check) => ({
    outcome: check.outcome,
    title: stripTitle(check),
  }));
  const padding = Array.from({ length: HEALTH_CONFIG.STRIP_LENGTH - filled.length }, () => ({
    outcome: null,
    title: "No check",
  }));
  return [...padding, ...filled];
}

function stripTitle(check: HealthCheck): string {
  const http = check.httpStatus === null ? "—" : `HTTP ${check.httpStatus}`;
  return `${formatUtcTimestamp(check.fetchedAt)} · ${check.outcome} · ${http}`;
}

function describeStrip(slots: readonly StripSlot[]): string {
  const counts = {
    unchanged: 0,
    changed: 0,
    parser_suspect: 0,
    fetch_error: 0,
    empty: 0,
  };
  for (const slot of slots) {
    if (slot.outcome === null) {
      counts.empty += 1;
    } else {
      counts[slot.outcome] += 1;
    }
  }
  return `${counts.unchanged} unchanged, ${counts.changed} changed, ${counts.parser_suspect} parser failed, ${counts.fetch_error} download failed, ${counts.empty} empty`;
}

function sameRun(anchor: HealthCheck, next: HealthCheck | undefined): boolean {
  if (next === undefined || next.outcome === "changed") {
    return false;
  }
  return (
    next.outcome === anchor.outcome &&
    next.httpStatus === anchor.httpStatus &&
    next.note === anchor.note
  );
}

function captureOlderChip(archiveUrl: string | null, fetchedAt: Date): string | null {
  if (archiveUrl === null) {
    return null;
  }
  const match = CAPTURE_STAMP.exec(archiveUrl);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const captured = Date.UTC(year, month - 1, day, hour, minute, second);
  const olderBy = fetchedAt.getTime() - captured;
  if (olderBy <= HOUR_MS) {
    return null;
  }
  return `capture is ${Math.floor(olderBy / HOUR_MS)}h older than the check`;
}

function pushChip(chips: Map<number, string[]>, observationId: number, label: string): void {
  const existing = chips.get(observationId) ?? [];
  existing.push(label);
  chips.set(observationId, existing);
}
