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
 * This is the plain markdown file. The HTML page redirects into the AI
 * Studio app, and that app's script sends a browser to Google login, so a
 * Wayback playback link never shows the prices. `?hl=en` asks for English.
 * The download also sends Accept-Language: en. An HTML page whose
 * `<html lang>` does not start with "en" still throws in the parser. This
 * file does not import the catalog. A download should not depend on which
 * models a person chose to track.
 *
 * parse is the existing parser, not a new one. A page that is not English,
 * or that has no Standard table, still throws that parser's error.
 * Nothing here writes a price, a fetch_log row, or an observation.
 */
const GOOGLE_PRICING_URL = "https://aistudio.google.com/docs/pricing.md?hl=en";

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
