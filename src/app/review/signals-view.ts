import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";
import { formatUtcCompact } from "@/core/source-health";

/**
 * Sentences for /review/signals.
 *
 * This file does not open a database and does not call new Date().
 * The loader passes `now` so a relative label cannot change after
 * the page is sent. Amounts stay the stored decimal strings.
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

export type SignalsView = {
  title: string;
  description: string;
  unread: string | null;
  failure: string | null;
  failureNote: string | null;
  successful: string | null;
  agreed: string | null;
  notCompared: string | null;
  disagreements: { key: string; model: string; dimension: string; ours: string; witness: string }[];
  emptyDisagreements: string | null;
  candidates: { id: number; label: string }[];
  emptyCandidates: string | null;
  missing: { key: string; model: string }[];
  emptyMissing: string | null;
  notLinked: { key: string; model: string; sentence: string }[];
  emptyNotLinked: string | null;
};

export function toSignalsView(page: LiteLLMSignalPage): SignalsView {
  const successful = page.successful;
  return {
    title: "Signals",
    description:
      "LiteLLM is a witness for Anthropic, OpenAI, and Google. A witness does not publish a price.",
    unread: page.latest === null ? "LiteLLM has not been read yet." : null,
    failure:
      page.latest !== null && page.latest.outcome !== "ok" ? "The latest read failed." : null,
    failureNote: page.latest !== null && page.latest.outcome !== "ok" ? page.latest.note : null,
    successful:
      successful === null
        ? null
        : `Last successful read ${formatUtcCompact(successful.fetchedAt).short} UTC.`,
    agreed: successful === null ? null : countSentence(successful.agreedCount, "agrees", "agree"),
    notCompared:
      successful === null
        ? null
        : countSentence(successful.notComparedCount, "was not compared", "were not compared"),
    disagreements: page.disagreements.map((row) => ({
      key: `${row.labName}/${row.modelName}/${row.dimension}`,
      model: `${row.labName} ${row.modelName}`,
      dimension: dimensionLabel(row.dimension),
      ours: `$${row.ourValue}`,
      witness: `$${row.aggregatorValue}`,
    })),
    emptyDisagreements: page.latest === null ? null : "No prices disagree.",
    candidates: page.candidates.map((row) => ({
      id: row.id,
      label: `${row.labName} ${row.rawSlug}`,
    })),
    emptyCandidates: page.latest === null ? null : "No new names are waiting.",
    missing: page.signals
      .filter((row) => row.kind === "missing")
      .map((row) => ({
        key: `missing/${row.labName}/${row.modelName}`,
        model: `${row.labName} ${row.modelName}`,
      })),
    emptyMissing: page.latest === null ? null : "No tracked model is missing.",
    notLinked: page.signals
      .filter((row) => row.kind === "not_linked")
      .map((row) => ({
        key: `not-linked/${row.labName}/${row.modelName}`,
        model: `${row.labName} ${row.modelName}`,
        sentence: row.hasAlias
          ? "The stored witness name is not in this file."
          : "No witness name is stored.",
      })),
    emptyNotLinked: page.latest === null ? null : "Every tracked model is linked.",
  };
}

function countSentence(count: number, one: string, many: string): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("witness count is not a whole number");
  }
  return count === 1 ? `1 model ${one}.` : `${count} models ${many}.`;
}

function dimensionLabel(dimension: string): string {
  const label = DIMENSION_LABEL[dimension];
  if (label === undefined) {
    throw new Error(`price dimension ${dimension} is unknown`);
  }
  return label;
}
