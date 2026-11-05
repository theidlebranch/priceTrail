import { parseGooglePricing } from "@/core/pricing/google";
import {
  fetchOfficialPage,
  type FetchLike,
  type FetchedPage,
  type ProviderSource,
} from "@/server/sources/provider-source";

/**
 * The Google Gemini pricing page, in English.
 *
 * `?hl=en` asks for English. The download also sends Accept-Language: en.
 * The parser throws if `<html lang>` does not start with "en". This file
 * does not import the catalog. A download should not depend on which
 * models a person chose to track.
 *
 * parse is the existing parser, not a new one. A page that is not English,
 * or that has no Standard table, still throws that parser's error.
 * Nothing here writes a price, a fetch_log row, or an observation.
 */
const GOOGLE_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing?hl=en";

async function fetchPage(fetchImpl: FetchLike): Promise<FetchedPage> {
  return fetchOfficialPage(GOOGLE_PRICING_URL, "Google pricing page", fetchImpl, {
    "Accept-Language": "en",
  });
}

export const googleSource: ProviderSource = {
  lab: "google",
  url: GOOGLE_PRICING_URL,
  fetchPage,
  parse: parseGooglePricing,
};
