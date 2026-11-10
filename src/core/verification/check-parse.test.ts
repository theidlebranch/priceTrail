import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { checkParsedPrices } from "@/core/verification/check-parse";

const REQUIRED_HEADERS = [
  "Model",
  "Base input tokens",
  "5m cache writes",
  "1h cache writes",
  "Cache hits and refreshes",
  "Output tokens",
] as const;

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/anthropic-pricing.md"),
  "utf8",
);

function markdownTable(headers: readonly string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, separatorLine, body].filter(Boolean).join("\n");
}

function validRow(
  model: string,
  amounts = ["$1 / MTok", "$1.25 / MTok", "$2 / MTok", "$0.10 / MTok", "$5 / MTok"],
): string[] {
  return [model, ...amounts];
}

function priceRow(overrides: Partial<NormalizedPrice> & Pick<NormalizedPrice, "dimension">): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: "Claude Test",
    modelSlug: "claude-test",
    usdPer1M: "1",
    source: "official",
    ...overrides,
  };
}

describe("checkParsedPrices", () => {
  it("accepts the saved Anthropic fixture for the seeded model slugs", () => {
    const { rows } = parseAnthropicPricing(fixture);

    expect(rows.length).toBeGreaterThan(0);
    expect(
      checkParsedPrices({
        rows,
        expectedModelSlugs: ["claude-fable-5.1", "claude-mythos-5.1"],
      }),
    ).toEqual({ status: "ok" });
  });

  it("keeps the parsed rows when a cache write does not follow a fixed ratio", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Test", [
        "$1 / MTok",
        "$3 / MTok",
        "$2 / MTok",
        "$0.10 / MTok",
        "$5 / MTok",
      ]),
    ]);
    const { rows } = parseAnthropicPricing(markdown);

    expect(rows).toHaveLength(5);
    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "ok",
    });
  });

  it("keeps a page when an extra model's cache read does not follow a fixed ratio", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Fable 5.1", [
        "$10 / MTok",
        "$12.50 / MTok",
        "$20 / MTok",
        "$0.25 / MTok",
        "$50 / MTok",
      ]),
      validRow("Claude New", [
        "$8 / MTok",
        "$10 / MTok",
        "$16 / MTok",
        "$0.20 / MTok",
        "$40 / MTok",
      ]),
    ]);
    const { rows } = parseAnthropicPricing(markdown);

    expect(
      checkParsedPrices({
        rows,
        expectedModelSlugs: ["claude-fable-5.1"],
      }),
    ).toEqual({ status: "ok" });
  });

  it("reports a tracked model that the parse did not return", () => {
    const { rows } = parseAnthropicPricing(
      markdownTable(REQUIRED_HEADERS, [validRow("Claude Test")]),
    );

    expect(
      checkParsedPrices({
        rows,
        expectedModelSlugs: ["claude-test", "claude-fable-5.1"],
      }),
    ).toEqual({
      status: "suspect",
      reasons: ["missing tracked model: claude-fable-5.1"],
    });
  });

  it("reports an empty parse once, without listing every missing slug", () => {
    expect(
      checkParsedPrices({
        rows: [],
        expectedModelSlugs: ["claude-fable-5.1", "claude-mythos-5.1"],
      }),
    ).toEqual({
      status: "suspect",
      reasons: ["parsed price rows are empty"],
    });
  });

  it("leaves an OpenAI cache price out of the Anthropic group checks", () => {
    // One cache cell and no input price. Those group checks stay on Anthropic rows.
    const rows = [
      priceRow({
        provider: "openai",
        modelName: "gpt-6-astra",
        modelSlug: "gpt-6-astra",
        dimension: "cache_write_5m",
        usdPer1M: "99",
      }),
    ];

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["gpt-6-astra"] })).toEqual({
      status: "ok",
    });
  });

  it("throws when an amount is not a decimal", () => {
    const rows = [priceRow({ dimension: "input", usdPer1M: "nope" })];

    expect(() => checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toThrow(
      /unreadable price amount for claude-test input: nope/,
    );
  });

  it("checks each prompt tier on its own", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Haiku 5.5 (for prompts up to 100,000 tokens)", [
        "$1 / MTok",
        "$1.25 / MTok",
        "$2 / MTok",
        "$0.10 / MTok",
        "$5 / MTok",
      ]),
      validRow("Claude Haiku 5.5 (for prompts over 100,000 tokens)", [
        "$2 / MTok",
        "$2.50 / MTok",
        "$4 / MTok",
        "$0.20 / MTok",
        "$10 / MTok",
      ]),
    ]);
    const { rows } = parseAnthropicPricing(markdown);

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-haiku-5.5"] })).toEqual({
      status: "ok",
    });
  });

  it("treats 0.10 and 0.1 as the same cache read price", () => {
    const rows = [
      priceRow({ dimension: "input", usdPer1M: "1" }),
      priceRow({ dimension: "cache_read", usdPer1M: "0.10" }),
    ];

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "ok",
    });
  });

  it("reports two amounts for one dimension instead of picking one", () => {
    const rows = [
      priceRow({ dimension: "input", usdPer1M: "1" }),
      priceRow({ dimension: "input", usdPer1M: "2" }),
      priceRow({ dimension: "cache_read", usdPer1M: "0.1" }),
    ];

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "suspect",
      reasons: ["two input rows for claude-test"],
    });
  });

  it("reports a cache price that has no input price in the same tier", () => {
    const rows = [priceRow({ dimension: "cache_write_5m", usdPer1M: "1.25" })];

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "suspect",
      reasons: ["missing input price for claude-test"],
    });
  });

  it("accepts an unknown extra column when the cache ratios still match", () => {
    const markdown = markdownTable(
      [...REQUIRED_HEADERS, "Audio tokens"],
      [[...validRow("Claude Test"), "$9 / MTok"]],
    );
    const { rows, warnings } = parseAnthropicPricing(markdown);

    expect(warnings.some((warning) => /unmappedColumns/i.test(warning))).toBe(true);
    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "ok",
    });
  });

  it("checks each schedule segment on its own", () => {
    const early = { validFrom: "2026-01-01", validUntil: "2026-05-31" };
    const later = { validFrom: "2026-06-01" };
    const rows = [
      priceRow({ dimension: "input", usdPer1M: "1", ...early }),
      priceRow({ dimension: "cache_write_5m", usdPer1M: "1.25", ...early }),
      priceRow({ dimension: "cache_write_1h", usdPer1M: "2", ...early }),
      priceRow({ dimension: "cache_read", usdPer1M: "0.1", ...early }),
      priceRow({ dimension: "input", usdPer1M: "2", ...later }),
      priceRow({ dimension: "cache_write_5m", usdPer1M: "2.5", ...later }),
      priceRow({ dimension: "cache_write_1h", usdPer1M: "4", ...later }),
      priceRow({ dimension: "cache_read", usdPer1M: "0.2", ...later }),
    ];

    expect(checkParsedPrices({ rows, expectedModelSlugs: ["claude-test"] })).toEqual({
      status: "ok",
    });
  });
});
