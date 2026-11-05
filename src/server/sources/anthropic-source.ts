import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import type { FetchLike, FetchedPage, ProviderSource } from "@/server/sources/provider-source";

/**
 * The Anthropic pricing page, as markdown.
 *
 * This is the same URL the seed records. The test checks the two copies
 * still match. The seed list is not imported here: a download should not
 * depend on which models a person chose to publish.
 */
const ANTHROPIC_PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";

const USER_AGENT = "PriceTrail/0.1 (pricing evidence checker)";

// A markdown page should answer in a few seconds. Thirty seconds is the
// point where we stop waiting. The thrown timeout is a failed download,
// the same as a network error. This step does not record that failure.
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Downloads the Anthropic pricing page.
 *
 * This function does not call the parser. A 403 page, an empty body, or a
 * dropped connection throws before anyone treats the text as prices.
 * Nothing here writes a price, a fetch_log row, or an observation.
 */
async function fetchPage(fetchImpl: FetchLike): Promise<FetchedPage> {
  const response = await fetchImpl(ANTHROPIC_PRICING_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // response.ok is every status from 200 through 299. An error page can
  // still contain dollar amounts. We stop here and leave the body unread,
  // so that text is never handed to the parser.
  if (!response.ok) {
    throw new Error(
      `Anthropic pricing page fetch failed: HTTP ${response.status} for ${ANTHROPIC_PRICING_URL}`,
    );
  }

  const rawContent = await response.text();
  if (rawContent.trim() === "") {
    throw new Error(`Anthropic pricing page was empty: ${ANTHROPIC_PRICING_URL}`);
  }

  return {
    url: ANTHROPIC_PRICING_URL,
    httpStatus: response.status,
    rawContent,
  };
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
