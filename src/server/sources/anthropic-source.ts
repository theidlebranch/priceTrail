import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import {
  fetchOfficialPage,
  type FetchLike,
  type FetchedPage,
  type ProviderSource,
} from "@/server/sources/provider-source";

/**
 * The Anthropic pricing page, as markdown.
 *
 * This is the same URL the seed records. The test checks the two copies
 * still match. The seed list is not imported here: a download should not
 * depend on which models a person chose to publish.
 */
const ANTHROPIC_PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";

/**
 * Downloads the Anthropic pricing page.
 *
 * The status and empty-body checks live in fetchOfficialPage, shared with
 * OpenAI. This function does not call the parser. Nothing here writes a
 * price, a fetch_log row, or an observation.
 */
async function fetchPage(fetchImpl: FetchLike): Promise<FetchedPage> {
  return fetchOfficialPage(ANTHROPIC_PRICING_URL, "Anthropic pricing page", fetchImpl);
}

/**
 * The Anthropic source. parse is the existing parser, not a new one.
 * A page that is not the pricing table still throws that parser's error.
 */
export const anthropicSource: ProviderSource = {
  lab: "anthropic",
  url: ANTHROPIC_PRICING_URL,
  fetchPage,
  parse: parseAnthropicPricing,
};
