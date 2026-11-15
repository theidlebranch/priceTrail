import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";
import { formatUtcCompact } from "@/core/source-health";

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

export function toSignalsView(page: LiteLLMSignalPage): SignalsView {
  const successful = page.successful;
  const latest = page.latest;
  return {
    title: "Signals",
    description:
      "LiteLLM's cost map is a second price list for Anthropic, OpenAI, and Google. It can disagree with this site, and it can name a model we do not track. It cannot publish a price.",
    unread: latest === null ? "LiteLLM has not been read yet." : null,
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
      label: `${row.labName} ${row.rawSlug}`,
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
