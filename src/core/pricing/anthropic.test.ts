import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnthropicPricing } from "./anthropic";

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

function validRow(model: string, amounts = ["$1 / MTok", "$1.25 / MTok", "$2 / MTok", "$0.10 / MTok", "$5 / MTok"]): string[] {
  return [model, ...amounts];
}

function findRow(
  rows: ReturnType<typeof parseAnthropicPricing>["rows"],
  modelSlug: string,
  dimension: string,
  condition?: { promptTokensAtMost?: number; promptTokensOver?: number },
) {
  return rows.find(
    (row) =>
      row.modelSlug === modelSlug &&
      row.dimension === dimension &&
      JSON.stringify(row.condition) === JSON.stringify(condition),
  );
}

describe("parseAnthropicPricing", () => {
  it("parses the official fixture into one row per model dimension", () => {
    const { rows, warnings } = parseAnthropicPricing(fixture);

    expect(rows).toHaveLength(105);
    expect(warnings.filter((warning) => /multiplier/i.test(warning))).toEqual([]);

    const fableCacheRead = findRow(rows, "claude-fable-5.1", "cache_read");
    expect(fableCacheRead).toMatchObject({
      provider: "anthropic",
      modelName: "Claude Fable 5.1",
      usdPer1M: "0.25",
      source: "official",
    });

    const fableCacheWrite5m = findRow(rows, "claude-fable-5.1", "cache_write_5m");
    expect(fableCacheWrite5m?.usdPer1M).toBe("12.5");

    const haikuAtMost = findRow(rows, "claude-haiku-5.5", "input", {
      promptTokensAtMost: 100000,
    });
    expect(haikuAtMost).toMatchObject({
      modelName: "Claude Haiku 5.5",
      usdPer1M: "0.1",
      condition: { promptTokensAtMost: 100000 },
    });

    const haikuOver = findRow(rows, "claude-haiku-5.5", "output", {
      promptTokensOver: 100000,
    });
    expect(haikuOver).toMatchObject({
      modelName: "Claude Haiku 5.5",
      usdPer1M: "2.5",
      condition: { promptTokensOver: 100000 },
    });

    const opusRetired = findRow(rows, "claude-opus-4.1", "input");
    expect(opusRetired?.note).toMatch(/retired/i);

    const mythosLimited = findRow(rows, "claude-mythos-5.1", "input");
    expect(mythosLimited?.note).toMatch(/limited availability/i);
  });

  it("throws when a required column is missing", () => {
    const markdown = markdownTable(
      REQUIRED_HEADERS.filter((header) => header !== "Output tokens"),
      [validRow("Claude Test")],
    );

    expect(() => parseAnthropicPricing(markdown)).toThrow(/missing required column/i);
  });

  it("throws when a cell is not $X / MTok", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Test", ["$1 / MTok", "$1.25 / MTok", "$2 / MTok", "free", "$5 / MTok"]),
    ]);

    expect(() => parseAnthropicPricing(markdown)).toThrow(/\$X \/ MTok|unrecognized unit|unrecognized cell/i);
  });

  it("throws when the matching table has no model rows", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, []);

    expect(() => parseAnthropicPricing(markdown)).toThrow(/empty table/i);
  });

  it("throws when no matching pricing table is present", () => {
    const markdown = markdownTable(
      ["Concept", "Details"],
      [["Billing unit", "Claude Consumption Unit"]],
    );

    expect(() => parseAnthropicPricing(markdown)).toThrow(/0 matching tables/i);
  });

  it("throws when two matching pricing tables are present", () => {
    const table = markdownTable(REQUIRED_HEADERS, [validRow("Claude Test")]);

    expect(() => parseAnthropicPricing(`${table}\n\n${table}`)).toThrow(
      /2 matching tables/i,
    );
  });

  it("throws when a tier-like parenthetical cannot be parsed", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Haiku 5.5 (for prompts around 100,000 tokens)"),
    ]);

    expect(() => parseAnthropicPricing(markdown)).toThrow(
      /unparseable tier|tier parenthetical/i,
    );
  });

  it("warns on a cache multiplier mismatch and still returns the rows", () => {
    const markdown = markdownTable(REQUIRED_HEADERS, [
      validRow("Claude Test", [
        "$1 / MTok",
        "$3 / MTok",
        "$2 / MTok",
        "$0.10 / MTok",
        "$5 / MTok",
      ]),
    ]);

    const { rows, warnings } = parseAnthropicPricing(markdown);

    expect(rows).toHaveLength(5);
    expect(findRow(rows, "claude-test", "cache_write_5m")?.usdPer1M).toBe("3");
    expect(warnings.some((warning) => /multiplier/i.test(warning))).toBe(true);
  });

  it("warns about unknown extra columns instead of dropping them silently", () => {
    const markdown = markdownTable(
      [...REQUIRED_HEADERS, "Audio tokens"],
      [[...validRow("Claude Test"), "$9 / MTok"]],
    );

    const { rows, warnings } = parseAnthropicPricing(markdown);

    expect(rows).toHaveLength(5);
    expect(warnings.some((warning) => /unmappedColumns/i.test(warning))).toBe(
      true,
    );
  });
});
