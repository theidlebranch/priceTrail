import { parseOpenRouter } from "@/core/pricing/openrouter";
import { readWitnessList, type SignalDb, type WitnessSignalResult } from "@/server/pipeline/store-witness-read";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Read OpenRouter's model list and store what it means for tracked models.
 *
 * A failed download or a bad parse stores only this source's attempt.
 * The previous disagreements, new names, and missing models stay.
 * Two open prices throw and store nothing. This file does not call
 * publishPriceVersion(), and it does not start an official visit.
 */

export async function readOpenRouterSignal(
  db: SignalDb,
  input: { fetchedAt: Date; fetchImpl: FetchLike },
): Promise<WitnessSignalResult> {
  return readWitnessList(db, {
    fetchedAt: input.fetchedAt,
    fetchImpl: input.fetchImpl,
    sourceUrl: OPENROUTER_MODELS_URL,
    label: "OpenRouter",
    witnessSource: "openrouter",
    parse: (payload) => parseOpenRouter(payload).rows,
  });
}
