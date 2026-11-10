/**
 * The prices a person agreed to publish.
 *
 * The parsers read the saved pages and propose amounts. This list is the
 * check. If a number here disagrees with the parser, the seed throws and
 * writes nothing. Do not type a price that is not in the fixture.
 *
 * These six models are the top of each saved page: Claude 5.1, and the
 * gpt-6 Standard rows. Older models stay out. Google prices stay out.
 * The Google lab is planted by plantGoogleCatalog(), and that function
 * does not publish a price.
 *
 * The November page states the short and long cutoff once:
 * at most 272,000 tokens, and over 272,000 tokens. Both tiers are published.
 * The November page names a 30-minute write and a 12-hour write. Those
 * are cache_write_30m and cache_write_12h. The October fixture still
 * has the old single cache-write column, and this list does not read it.
 * A model whose page note says retired does not belong here either.
 *
 * Amounts are the parser's decimal strings: "10", not "10.00".
 * firstSeenAt is the day of that lab's fixture. The files do not record
 * an hour, so the time is UTC midnight. The public label is that day.
 * Anthropic stays on the source-spike day. OpenAI uses the November page.
 */

const SEED_FIRST_SEEN_AT = new Date("2026-10-18T00:00:00.000Z");

export type SeedDimension =
  | "input"
  | "output"
  | "cache_read"
  | "cache_write_5m"
  | "cache_write_1h"
  | "cache_write"
  | "cache_write_30m"
  | "cache_write_12h";

export type SeedComponent = {
  dimension: SeedDimension;
  amount: string;
  condition?: {
    promptTokensAtMost?: number;
    promptTokensOver?: number;
  };
};

const SHORT_CONTEXT = { promptTokensAtMost: 272000 } as const;
const LONG_CONTEXT = { promptTokensOver: 272000 } as const;

function openAiTiers(
  short: {
    input: string;
    cacheRead: string;
    write30m: string;
    write12h: string;
    output: string;
  },
  long: {
    input: string;
    cacheRead: string;
    write30m: string;
    write12h: string;
    output: string;
  },
): readonly SeedComponent[] {
  return [
    { dimension: "input", amount: short.input, condition: SHORT_CONTEXT },
    { dimension: "cache_read", amount: short.cacheRead, condition: SHORT_CONTEXT },
    { dimension: "cache_write_30m", amount: short.write30m, condition: SHORT_CONTEXT },
    { dimension: "cache_write_12h", amount: short.write12h, condition: SHORT_CONTEXT },
    { dimension: "output", amount: short.output, condition: SHORT_CONTEXT },
    { dimension: "input", amount: long.input, condition: LONG_CONTEXT },
    { dimension: "cache_read", amount: long.cacheRead, condition: LONG_CONTEXT },
    { dimension: "cache_write_30m", amount: long.write30m, condition: LONG_CONTEXT },
    { dimension: "cache_write_12h", amount: long.write12h, condition: LONG_CONTEXT },
    { dimension: "output", amount: long.output, condition: LONG_CONTEXT },
  ];
}

export type SeedModelSpec = {
  slug: string;
  components: readonly SeedComponent[];
};

export type SeedLabSpec = {
  name: string;
  slug: string;
  fixturePath: string;
  sourceUrl: string;
  parser: "anthropic" | "openai";
  firstSeenAt: Date;
  models: readonly SeedModelSpec[];
};

const fableAmounts: readonly SeedComponent[] = [
  { dimension: "input", amount: "10" },
  { dimension: "cache_write_5m", amount: "12.5" },
  { dimension: "cache_write_1h", amount: "20" },
  { dimension: "cache_read", amount: "0.25" },
  { dimension: "output", amount: "50" },
];

export const SEED_LABS: readonly SeedLabSpec[] = [
  {
    name: "Anthropic",
    slug: "anthropic",
    fixturePath: "tests/fixtures/anthropic-pricing.md",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    parser: "anthropic",
    firstSeenAt: SEED_FIRST_SEEN_AT,
    models: [
      { slug: "claude-fable-5.1", components: fableAmounts },
      { slug: "claude-mythos-5.1", components: fableAmounts },
    ],
  },
  {
    name: "OpenAI",
    slug: "openai",
    fixturePath: "tests/fixtures/openai-pricing.2026-11-05.md",
    sourceUrl: "https://developers.openai.com/api/docs/pricing.md",
    parser: "openai",
    firstSeenAt: new Date("2026-11-05T00:00:00.000Z"),
    models: [
      {
        slug: "gpt-6-astra",
        components: openAiTiers(
          { input: "10", cacheRead: "1", write30m: "12.5", write12h: "25", output: "50" },
          { input: "20", cacheRead: "2", write30m: "25", write12h: "50", output: "75" },
        ),
      },
      {
        slug: "gpt-6.1-sol",
        components: openAiTiers(
          { input: "2", cacheRead: "0.1", write30m: "2.5", write12h: "5", output: "10" },
          { input: "4", cacheRead: "0.2", write30m: "5", write12h: "10", output: "15" },
        ),
      },
      {
        slug: "gpt-6-luna",
        components: openAiTiers(
          { input: "0.1", cacheRead: "0.01", write30m: "0.125", write12h: "0.25", output: "0.5" },
          { input: "0.2", cacheRead: "0.02", write30m: "0.25", write12h: "0.5", output: "0.75" },
        ),
      },
      {
        slug: "gpt-6-sol",
        components: openAiTiers(
          { input: "2", cacheRead: "0.2", write30m: "2.5", write12h: "5", output: "10" },
          { input: "4", cacheRead: "0.4", write30m: "5", write12h: "10", output: "15" },
        ),
      },
    ],
  },
];
