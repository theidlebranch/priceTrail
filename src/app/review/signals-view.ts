import { formatUtcCompact } from "@/core/source-health";
import {
  SIGNAL_JOB_URLS,
  WITNESS_READ_PAGE_SIZE,
  type SignalJobRow,
  type WitnessReadCursor,
  type WitnessReadRow,
  type LiteLLMSignalPage,
} from "@/server/db/repositories/litellm-signals";

/**
 * Sentences for /review/signals.
 *
 * This file does not open a database and does not call new Date().
 * Amounts stay the stored decimal strings. Times are the stored UTC
 * stamps, so the clock cannot change after the page is sent.
 */

const DIMENSION_LABEL: Record<string, string> = {
  input: "Input",
  output: "Output",
  cache_read: "Cache read",
  cache_write_5m: "Cache write, 5 minutes",
  cache_write_1h: "Cache write, 1 hour",
  cache_write: "Cache write",
  cache_write_30m: "Cache write, 30 minutes",
  cache_write_12h: "Cache write, 12 hours",
};

const COMPARED_MEANING =
  "Agree is a linked model whose compared prices matched. Not compared is linked, with no open price or no shared price part. Disagree is a price part that differs. The long tier stays out.";

const FROM_LAST_GOOD = "These counts are from the last good read.";

export type SignalsView = {
  title: string;
  description: string;
  unread: string | null;
  latest: {
    time: string;
    status: string;
    note: string | null;
    fromLastGood: string | null;
  } | null;
  file: { count: number; sentence: string } | null;
  compared: {
    agreed: string;
    notCompared: string;
    disagree: string;
    meaning: string;
  } | null;
  disagreements: {
    key: string;
    model: string;
    dimension: string;
    ours: string;
    witness: string;
    time: string;
  }[];
  emptyDisagreements: string | null;
  candidates: { id: number; label: string; time: string }[];
  emptyCandidates: string | null;
  missing: { key: string; model: string; time: string }[];
  emptyMissing: string | null;
  notLinked: { key: string; model: string; sentence: string; time: string }[];
  emptyNotLinked: string | null;
};

export type WitnessCopy = {
  title: string;
  description: string;
  unread: string;
};

const LITELLM_COPY: WitnessCopy = {
  title: "LiteLLM",
  description:
    "LiteLLM's cost map is a second price list for Anthropic, OpenAI, and Google. It can disagree with this site, and it can name a model we do not track. It cannot publish a price.",
  unread: "LiteLLM has not been read yet.",
};

export const OPENROUTER_COPY: WitnessCopy = {
  title: "OpenRouter",
  description:
    "OpenRouter's model list is a second price list for Anthropic, OpenAI, and Google. It can disagree with this site, and it can name a model we do not track. It cannot publish a price.",
  unread: "OpenRouter has not been read yet.",
};

export function toSignalsView(page: LiteLLMSignalPage, copy: WitnessCopy = LITELLM_COPY): SignalsView {
  const successful = page.successful;
  const latest = page.latest;
  return {
    title: copy.title,
    description: copy.description,
    unread: latest === null ? copy.unread : null,
    latest: latest === null ? null : latestCard(latest, successful !== null),
    file:
      successful === null
        ? null
        : {
            count: successful.seenCount,
            sentence: successful.isBaseline
              ? "First read. A new name shows up on the next read."
              : "New names are slugs that were not in the previous file.",
          },
    compared:
      successful === null
        ? null
        : {
            agreed: tally(successful.agreedCount, "agrees", "agree"),
            notCompared: tally(successful.notComparedCount, "not compared", "not compared"),
            disagree: tally(page.disagreements.length, "disagrees", "disagree"),
            meaning: COMPARED_MEANING,
          },
    disagreements: page.disagreements.map((row) => ({
      key: `${row.labName}/${row.modelName}/${row.dimension}`,
      model: `${row.labName} ${row.modelName}`,
      dimension: dimensionLabel(row.dimension),
      ours: `$${row.ourValue}`,
      witness: `$${row.aggregatorValue}`,
      time: stamp(row.detectedAt),
    })),
    emptyDisagreements: emptyFindings(successful, "No prices disagree."),
    candidates: page.candidates.map((row) => ({
      id: row.id,
      label: row.rawName === row.rawSlug ? `${row.labName} ${row.rawSlug}` : `${row.rawName} (${row.rawSlug})`,
      time: stamp(row.firstSeenAt),
    })),
    emptyCandidates: emptyFindings(successful, "No new names are waiting."),
    missing: page.signals
      .filter((row) => row.kind === "missing")
      .map((row) => ({
        key: `missing/${row.labName}/${row.modelName}`,
        model: `${row.labName} ${row.modelName}`,
        time: stamp(row.detectedAt),
      })),
    emptyMissing: emptyFindings(successful, "No tracked model is missing."),
    notLinked: page.signals
      .filter((row) => row.kind === "not_linked")
      .map((row) => ({
        key: `not-linked/${row.labName}/${row.modelName}`,
        model: `${row.labName} ${row.modelName}`,
        sentence: row.hasAlias
          ? "The stored witness name is not in this file."
          : "No witness name is stored.",
        time: stamp(row.detectedAt),
      })),
    emptyNotLinked: emptyFindings(successful, "Every tracked model is linked."),
  };
}

function latestCard(
  latest: NonNullable<LiteLLMSignalPage["latest"]>,
  hasGoodRead: boolean,
): NonNullable<SignalsView["latest"]> {
  const failed = latest.outcome !== "ok";
  return {
    time: stamp(latest.fetchedAt),
    status: readStatus(latest.outcome),
    note: failed && latest.note.trim() !== "" ? latest.note : null,
    fromLastGood: failed && hasGoodRead ? FROM_LAST_GOOD : null,
  };
}

function readStatus(outcome: NonNullable<LiteLLMSignalPage["latest"]>["outcome"]): string {
  if (outcome === "ok") {
    return "Read held";
  }
  if (outcome === "fetch_error") {
    return "Could not download";
  }
  if (outcome === "parse_error") {
    return "Could not parse";
  }
  throw new Error(`witness outcome ${outcome} is unknown`);
}

function emptyFindings(
  successful: LiteLLMSignalPage["successful"],
  whenHealthy: string,
): string {
  return successful === null ? "Findings are unavailable until a read succeeds." : whenHealthy;
}

function tally(count: number, one: string, many: string): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("witness count is not a whole number");
  }
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function stamp(value: Date): string {
  return `${formatUtcCompact(value).short} UTC`;
}

function dimensionLabel(dimension: string): string {
  const label = DIMENSION_LABEL[dimension];
  if (label === undefined) {
    throw new Error(`price dimension ${dimension} is unknown`);
  }
  return label;
}

/**
 * The job board is always LiteLLM, then OpenRouter.
 * Counts stay empty until a read has succeeded. A later failure
 * keeps the last good counts and says so.
 */
const BOARD_COPY: Record<(typeof SIGNAL_JOB_URLS)[number], WitnessCopy> = {
  [SIGNAL_JOB_URLS[0]]: LITELLM_COPY,
  [SIGNAL_JOB_URLS[1]]: OPENROUTER_COPY,
};

export type SignalBoardEntry = {
  title: string;
  href: string | null;
  lastRun: string | null;
  status: string;
  note: string | null;
  failed: boolean;
  fromLastGood: string | null;
  disagreements: string | null;
  newNames: string | null;
  missing: string | null;
};

export type SignalBoardView = {
  entries: SignalBoardEntry[];
};

export type SignalHistoryRow = {
  id: number;
  time: string;
  status: string;
  note: string | null;
  counts: string | null;
  failed: boolean;
};

export type SignalHistoryView = {
  rows: SignalHistoryRow[];
  olderHref: string | null;
  empty: string | null;
};

export function witnessCopyForUrl(url: string): WitnessCopy {
  if (!isJobUrl(url)) {
    throw new Error("signal url is not a witness this page reads");
  }
  return BOARD_COPY[url];
}

export function toSignalBoardView(jobs: readonly SignalJobRow[]): SignalBoardView {
  const byUrl = new Map(jobs.map((job) => [job.url, job]));
  if (byUrl.size !== jobs.length || jobs.length !== SIGNAL_JOB_URLS.length) {
    throw new Error("signal board expects LiteLLM and OpenRouter");
  }
  return {
    entries: SIGNAL_JOB_URLS.map((url) => {
      const job = byUrl.get(url);
      if (job === undefined) {
        throw new Error("signal board expects LiteLLM and OpenRouter");
      }
      return toBoardEntry(job, BOARD_COPY[url]);
    }),
  };
}

/**
 * `rows` are newest first, and this page is at most 50 of them.
 * The older link uses the last row, which is the oldest on this page.
 * A failed row stays in the list. There is no archive column.
 */
export function toSignalHistory(
  rows: readonly WitnessReadRow[],
  sourceId: number,
  cursor: WitnessReadCursor | null,
): SignalHistoryView {
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    throw new Error("signal id is not a whole number");
  }
  if (rows.length > WITNESS_READ_PAGE_SIZE) {
    throw new Error("a signal history page keeps at most 50 reads");
  }
  const oldest = rows[rows.length - 1];
  return {
    rows: rows.map(toHistoryRow),
    olderHref:
      rows.length === WITNESS_READ_PAGE_SIZE && oldest !== undefined
        ? `/review/signals/${sourceId}?before=${encodeURIComponent(oldest.fetchedAt.toISOString())}&beforeId=${oldest.id}`
        : null,
    empty:
      rows.length === 0
        ? cursor === null
          ? "This signal has not been read yet."
          : "No older reads."
        : null,
  };
}

function toBoardEntry(job: SignalJobRow, copy: WitnessCopy): SignalBoardEntry {
  const latest = job.latest;
  if (latest === null && job.hasSuccessfulRead) {
    throw new Error("a signal job has counts and no read");
  }
  if (job.sourceId === null && (latest !== null || job.hasSuccessfulRead)) {
    throw new Error("a missing signal source has a read");
  }
  if (job.sourceId !== null && (!Number.isSafeInteger(job.sourceId) || job.sourceId < 1)) {
    throw new Error("signal id is not a whole number");
  }
  const failed = latest !== null && latest.outcome !== "ok";
  if (failed && latest.note.trim() === "") {
    throw new Error("a filed check was stored without a note");
  }
  const counts = boardCounts(job);
  return {
    title: copy.title,
    href: job.sourceId === null ? null : `/review/signals/${job.sourceId}`,
    lastRun: latest === null ? null : stamp(latest.fetchedAt),
    status: latest === null ? copy.unread : readStatus(latest.outcome),
    note: failed ? latest.note.trim() : null,
    failed,
    fromLastGood: failed && job.hasSuccessfulRead ? FROM_LAST_GOOD : null,
    disagreements: counts?.disagreements ?? null,
    newNames: counts?.newNames ?? null,
    missing: counts?.missing ?? null,
  };
}

function boardCounts(
  job: SignalJobRow,
): { disagreements: string; newNames: string; missing: string } | null {
  const counts = [job.disagreementCount, job.newNameCount, job.missingCount];
  const anyCount = counts.some((count) => count !== null);
  const allCounts = counts.every((count) => count !== null);
  if (job.hasSuccessfulRead !== allCounts || anyCount !== allCounts) {
    throw new Error("signal counts do not match the last good read");
  }
  if (!allCounts) {
    return null;
  }
  return {
    disagreements: tally(job.disagreementCount ?? 0, "disagreement", "disagreements"),
    newNames: tally(job.newNameCount ?? 0, "new name", "new names"),
    missing: tally(job.missingCount ?? 0, "missing model", "missing models"),
  };
}

function toHistoryRow(row: WitnessReadRow): SignalHistoryRow {
  const failed = row.outcome !== "ok";
  if (failed && row.note.trim() === "") {
    throw new Error("a filed check was stored without a note");
  }
  return {
    id: row.id,
    time: stamp(row.fetchedAt),
    status: readStatus(row.outcome),
    note: row.note.trim() === "" ? null : row.note.trim(),
    counts:
      row.outcome === "ok"
        ? `${tally(readHistoryCount(row.agreedCount), "agrees", "agree")}, ${tally(readHistoryCount(row.notComparedCount), "not compared", "not compared")}`
        : null,
    failed,
  };
}

function readHistoryCount(value: number | null): number {
  if (value === null) {
    throw new Error("successful witness read is missing its counts");
  }
  return value;
}

function isJobUrl(url: string): url is (typeof SIGNAL_JOB_URLS)[number] {
  return SIGNAL_JOB_URLS.some((jobUrl) => jobUrl === url);
}
