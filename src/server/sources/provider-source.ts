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
 * Anthropic is the only source in this step. OpenAI and Google stay
 * later, so this type is not a registry yet.
 */
export type ProviderSource = {
  lab: "anthropic";
  url: string;
  fetchPage: (fetchImpl: FetchLike) => Promise<FetchedPage>;
  parse: (rawContent: string) => ParsedOfficialPrices;
};
