import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenAiPricing } from "./openai";

const REQUIRED_HEADERS = [
  "Model",
  "Short context input",
  "Short context cached input",
  "Short context cache writes",
  "Short context output",
  "Long context input",
  "Long context cached input",
  "Long context cache writes",
  "Long context output",
] as const;

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/openai-pricing.md"),
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
  amounts = [
    "$1.00",
    "$0.10",
    "$1.25",
    "$5.00",
    "$2.00",
    "$0.20",
    "$2.50",
    "$7.50",
  ],
): string[] {
  return [model, ...amounts];
}

function standardPage(
  table: string,
  options: { unit?: boolean; heading?: boolean; extraHeading?: boolean } = {},
): string {
  const parts: string[] = [];
  if (options.unit !== false) {
    parts.push("Prices per 1M tokens.");
  }
  if (options.heading !== false) {
    parts.push("### Standard pricing data");
  }
  parts.push(table);
  if (options.extraHeading) {
    parts.push("### Standard pricing data");
    parts.push(table);
  }
  return parts.join("\n\n");
}

function findRow(
  rows: ReturnType<typeof parseOpenAiPricing>["rows"],
  modelSlug: string,
  dimension: string,
  condition?: {
    promptTokensAtMost?: number;
    promptTokensOver?: number;
    promptTokensUnder?: number;
    promptTokensAtLeast?: number;
  },
) {
  return rows.find(
    (row) =>
      row.modelSlug === modelSlug &&
      row.dimension === dimension &&
      JSON.stringify(row.condition) === JSON.stringify(condition),
  );
}

describe("parseOpenAiPricing", () => {
  it("parses the official Standard table and ignores Batch", () => {
    const { rows, warnings } = parseOpenAiPricing(fixture);

    const lunaInput = findRow(rows, "gpt-6-luna", "input");
    expect(lunaInput).toMatchObject({
      provider: "openai",
      modelName: "gpt-6-luna",
      usdPer1M: "0.1",
      source: "official",
    });
    expect(lunaInput?.condition).toBeUndefined();
    expect(findRow(rows, "gpt-6-luna", "cache_read")?.usdPer1M).toBe("0.01");
    expect(findRow(rows, "gpt-6-luna", "cache_write")?.usdPer1M).toBe("0.125");
    expect(findRow(rows, "gpt-6-luna", "output")?.usdPer1M).toBe("0.5");

    expect(findRow(rows, "gpt-6-luna", "input", { promptTokensAtLeast: 272000 })).toBeUndefined();
    expect(rows.some((row) => row.modelSlug === "gpt-6-luna" && row.usdPer1M === "0.2")).toBe(
      false,
    );
    expect(warnings.some((warning) => /needs_threshold/i.test(warning) && /gpt-6-luna/.test(warning))).toBe(
      true,
    );

    const gpt55Short = findRow(rows, "gpt-5.5", "input", { promptTokensUnder: 272000 });
    expect(gpt55Short).toMatchObject({
      modelName: "gpt-5.5",
      usdPer1M: "5",
      condition: { promptTokensUnder: 272000 },
    });
    expect(findRow(rows, "gpt-5.5", "input", { promptTokensAtLeast: 272000 })?.usdPer1M).toBe(
      "10",
    );
    expect(findRow(rows, "gpt-5.5", "cache_write", { promptTokensUnder: 272000 })).toBeUndefined();
    expect(findRow(rows, "gpt-5.5", "cache_write", { promptTokensAtLeast: 272000 })).toBeUndefined();
  });

  it("throws when the unit sentence is missing", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]), {
      unit: false,
    });

    expect(() => parseOpenAiPricing(markdown)).toThrow(/Prices per 1M tokens/i);
  });

  it("throws when the Standard heading is missing", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]), {
      heading: false,
    });

    expect(() => parseOpenAiPricing(markdown)).toThrow(/0 Standard pricing data headings/i);
  });

  it("throws when two Standard headings are present", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]), {
      extraHeading: true,
    });

    expect(() => parseOpenAiPricing(markdown)).toThrow(/2 Standard pricing data headings/i);
  });

  it("throws when the Standard section has no table but a later section does", () => {
    const markdown = [
      "Prices per 1M tokens.",
      "### Standard pricing data",
      "### Batch pricing data",
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]),
    ].join("\n\n");

    expect(() => parseOpenAiPricing(markdown)).toThrow(/empty table/i);
  });

  it("throws when a required column is missing", () => {
    const markdown = standardPage(
      markdownTable(
        REQUIRED_HEADERS.filter((header) => header !== "Short context output"),
        [validRow("gpt-test").slice(0, -1)],
      ),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/missing required column/i);
  });

  it("throws when a required column appears twice", () => {
    const markdown = standardPage(
      markdownTable(
        [...REQUIRED_HEADERS, "Short context output"],
        [[...validRow("gpt-test"), "$9.00"]],
      ),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/duplicate required column/i);
  });

  it("throws when a cell is not a dollar amount or dash", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [
        validRow("gpt-test", [
          "$1.00",
          "$0.10",
          "free",
          "$5.00",
          "$2.00",
          "$0.20",
          "$2.50",
          "$7.50",
        ]),
      ]),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/unrecognized cell/i);
  });

  it("throws when the Standard table has no model rows", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, []));

    expect(() => parseOpenAiPricing(markdown)).toThrow(/empty table/i);
  });

  it("throws when every price cell is a dash", () => {
    const markdown = standardPage(
      markdownTable(
        REQUIRED_HEADERS,
        [validRow("gpt-test", ["-", "-", "-", "-", "-", "-", "-", "-"])],
      ),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/empty table/i);
  });

  it("skips a dash cell instead of treating it as a free price", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [
        validRow("gpt-test", [
          "$1.00",
          "$0.10",
          "-",
          "$5.00",
          "-",
          "-",
          "-",
          "-",
        ]),
      ]),
    );

    const { rows } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "gpt-test", "cache_write")).toBeUndefined();
    expect(rows.some((row) => row.usdPer1M === "0")).toBe(false);
  });

  it("throws when a parenthetical is not a stated context-length boundary", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-5.5 (<272K context)")]),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/unparseable|parenthetical/i);
  });

  it("warns about unknown extra columns instead of dropping them silently", () => {
    const markdown = standardPage(
      markdownTable(
        [...REQUIRED_HEADERS, "Audio tokens"],
        [[...validRow("gpt-test"), "$9.00"]],
      ),
    );

    const { rows, warnings } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
    expect(warnings.some((warning) => /unmappedColumns/i.test(warning))).toBe(true);
  });
});
