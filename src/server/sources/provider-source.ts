import type { NormalizedPrice } from "@/core/pricing/shape";

/**
 * The function a source uses to download a page.
 *
 * Tests pass a fake. Production passes the global fetch. The argument
 * is only a string URL, which is all this step needs.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The downloaded page, before any parser runs. */
export type FetchedPage = {
  url: string;
  httpStatus: number;
  rawContent: string;
};

/** Rows and warnings from an official parser. The parser decides what is a warning. */
export type ParsedOfficialPrices = {
  rows: NormalizedPrice[];
  warnings: string[];
};

/**
 * One official pricing page: where it lives, how to download it, and
 * which parser reads the text.
 *
 * lab is the labs.slug this page is checked against. Anthropic uses
 * "anthropic". OpenAI uses "openai". A test passes its own slug so it
 * does not touch a seeded lab. This type is still not a registry. The
 * cron is what will list the pages to check. Google stays later. Its
 * download must pin English, so it will not be a plain call to
 * fetchOfficialPage.
 */
export type ProviderSource = {
  lab: string;
  url: string;
  fetchPage: (fetchImpl: FetchLike) => Promise<FetchedPage>;
  parse: (rawContent: string) => ParsedOfficialPrices;
};

const USER_AGENT = "PriceTrail/0.1 (pricing evidence checker)";

// A pricing page should answer in a few seconds. Thirty seconds is the
// point where we stop waiting. The thrown timeout is a failed download,
// the same as a network error. This helper does not record that failure.
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Downloads one official page that is already plain text.
 *
 * Anthropic and OpenAI both use this. The rules live here once so a 403
 * or a blank body cannot be treated as prices on one page and forgotten
 * on the other. A network error is not caught. Google needs its own
 * download later, because that page must be English.
 *
 * Nothing here writes a price, a fetch_log row, or an observation.
 */
export async function fetchOfficialPage(
  url: string,
  pageLabel: string,
  fetchImpl: FetchLike,
): Promise<FetchedPage> {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // response.ok is every status from 200 through 299. An error page can
  // still contain dollar amounts. We stop here and leave the body unread,
  // so that text is never handed to the parser.
  if (!response.ok) {
    throw new Error(`${pageLabel} fetch failed: HTTP ${response.status} for ${url}`);
  }

  const rawContent = await response.text();
  if (rawContent.trim() === "") {
    throw new Error(`${pageLabel} was empty: ${url}`);
  }

  return {
    url,
    httpStatus: response.status,
    rawContent,
  };
}
