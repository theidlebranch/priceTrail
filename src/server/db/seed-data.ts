/**
 * The prices a person agreed to publish.
 *
 * The parsers read the saved pages and propose amounts. This list is the
 * check. If a number here disagrees with the parser, the seed throws and
 * writes nothing. Do not type a price that is not in the fixture.
 *
 * These six models are the top of each saved page: Claude 5.1, and the
 * gpt-6 Standard rows. Older models stay out. Google stays out.
 *
 * OpenAI's long-context cells for these models have no token cutoff, so
 * the parser emits no row for them. Do not add those amounts here.
 * A model whose page note says retired does not belong here either.
 *
 * Amounts are the parser's decimal strings: "10", not "10.00".
 * first_seen_at is the source-spike day. The fixture files do not record
 * an hour, so the time is UTC midnight. The public label is that day.
 */

export const SEED_FIRST_SEEN_AT = new Date("2026-10-18T00:00:00.000Z");

export type SeedDimension =
  | "input"
  | "output"
  | "cache_read"
  | "cache_write_5m"
  | "cache_write_1h"
  | "cache_write";

export type SeedComponent = {
  dimension: SeedDimension;
  amount: string;
};

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
    models: [
      { slug: "claude-fable-5.1", components: fableAmounts },
      { slug: "claude-mythos-5.1", components: fableAmounts },
    ],
  },
  {
    name: "OpenAI",
    slug: "openai",
    fixturePath: "tests/fixtures/openai-pricing.md",
    sourceUrl: "https://developers.openai.com/api/docs/pricing.md",
    parser: "openai",
    models: [
      {
        slug: "gpt-6-astra",
        components: [
          { dimension: "input", amount: "10" },
          { dimension: "cache_read", amount: "1" },
          { dimension: "cache_write", amount: "12.5" },
          { dimension: "output", amount: "50" },
        ],
      },
      {
        slug: "gpt-6.1-sol",
        components: [
          { dimension: "input", amount: "2" },
          { dimension: "cache_read", amount: "0.1" },
          { dimension: "cache_write", amount: "2.5" },
          { dimension: "output", amount: "10" },
        ],
      },
      {
        slug: "gpt-6-luna",
        components: [
          { dimension: "input", amount: "0.1" },
          { dimension: "cache_read", amount: "0.01" },
          { dimension: "cache_write", amount: "0.125" },
          { dimension: "output", amount: "0.5" },
        ],
      },
      {
        slug: "gpt-6-sol",
        components: [
          { dimension: "input", amount: "2" },
          { dimension: "cache_read", amount: "0.2" },
          { dimension: "cache_write", amount: "2.5" },
          { dimension: "output", amount: "10" },
        ],
      },
    ],
  },
];
