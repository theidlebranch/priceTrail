import { parseLiteLLM } from "@/core/pricing/litellm";
import {
  readWitnessList,
  type SignalDb,
  type WitnessSignalResult,
} from "@/server/pipeline/store-witness-read";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Read the LiteLLM cost map and store what it means for tracked models.
 *
 * A failed download or a bad parse stores only the attempt. The previous
 * disagreements, new names, and missing models stay. Two open prices throw
 * and store nothing. A disagreement enqueues one pending visit of that
 * lab's official page. This file does not download that page, and it does
 * not call publishPriceVersion().
 */

export type { SignalDb };
export type LiteLLMSignalResult = WitnessSignalResult;

export async function readLiteLLMSignal(
  db: SignalDb,
  input: { fetchedAt: Date; fetchImpl: FetchLike },
): Promise<LiteLLMSignalResult> {
  return readWitnessList(db, {
    fetchedAt: input.fetchedAt,
    fetchImpl: input.fetchImpl,
    sourceUrl: LITELLM_COST_MAP_URL,
    label: "LiteLLM",
    witnessSource: "litellm",
    parse: (payload) => parseLiteLLM(payload).rows,
  });
}
