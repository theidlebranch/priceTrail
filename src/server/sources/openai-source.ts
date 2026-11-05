import { parseOpenAiPricing } from "@/core/pricing/openai";
import {
  fetchOfficialPage,
  type FetchLike,
  type FetchedPage,
  type ProviderSource,
} from "@/server/sources/provider-source";

/**
 * The OpenAI pricing page, as markdown.
 *
 * This is the same URL the seed records. The test checks the two copies
 * still match. The seed list is not imported here: a download should not
 * depend on which models a person chose to publish.
 */
const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md";

/**
 * Downloads the OpenAI pricing page.
 *
 * The status and empty-body checks live in fetchOfficialPage, shared with
 * Anthropic. This function does not call the parser. Nothing here writes
 * a price, a fetch_log row, or an observation.
 */
async function fetchPage(fetchImpl: FetchLike): Promise<FetchedPage> {
  return fetchOfficialPage(OPENAI_PRICING_URL, "OpenAI pricing page", fetchImpl);
}

/**
 * The OpenAI source. parse is the existing parser, not a new one.
 * A page that is not the Standard table still throws that parser's error.
 */
export const openaiSource: ProviderSource = {
  lab: "openai",
  url: OPENAI_PRICING_URL,
  fetchPage,
  parse: parseOpenAiPricing,
};
