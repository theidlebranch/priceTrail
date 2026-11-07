import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenAiPricing } from "./openai";

const REQUIRED_HEADERS = [
  "Model",
  "Short context input",
  "Short context output",
  "Short context cached input",
  "Short context 30m write",
  "Short context 12h write",
  "Long context input",
  "Long context output",
  "Long context cached input",
  "Long context 30m write",
  "Long context 12h write",
] as const;

const OCTOBER_HEADERS = [
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
  path.join(process.cwd(), "tests/fixtures/openai-pricing.2026-11-05.md"),
  "utf8",
);

const octoberFixture = readFileSync(
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
    "$5.00",
    "$0.10",
    "$1.25",
    "$2.50",
    "$2.00",
    "$7.50",
    "$0.20",
    "$2.50",
    "$5.00",
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

function pageWithSections(tables: string[]): string {
  return ["Prices per 1M tokens.", ...tables.flatMap((table) => ["### Standard pricing data", table])].join(
    "\n\n",
  );
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
    longContext?: true;
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
  it("parses every Standard section and ignores Batch", () => {
    const { rows, warnings } = parseOpenAiPricing(fixture);

    const lunaInput = findRow(rows, "gpt-6-luna", "input");
    expect(lunaInput).toMatchObject({
      provider: "openai",
      modelName: "gpt-6-luna",
      usdPer1M: "0.1",
      source: "official",
    });
    expect(lunaInput?.condition).toBeUndefined();
    expect(findRow(rows, "gpt-6-luna", "output")?.usdPer1M).toBe("0.5");
    expect(findRow(rows, "gpt-6-luna", "cache_read")?.usdPer1M).toBe("0.01");
    expect(findRow(rows, "gpt-6-luna", "cache_write_30m")?.usdPer1M).toBe("0.125");
    expect(findRow(rows, "gpt-6-luna", "cache_write_12h")?.usdPer1M).toBe("0.25");
    expect(findRow(rows, "gpt-6-luna", "cache_write")).toBeUndefined();

    expect(findRow(rows, "gpt-6-luna", "input", { promptTokensAtLeast: 272000 })).toBeUndefined();
    expect(findRow(rows, "gpt-6-luna", "input", { longContext: true })).toMatchObject({
      usdPer1M: "0.2",
      condition: { longContext: true },
    });
    expect(warnings.some((warning) => /needs_threshold/i.test(warning))).toBe(false);

    expect(findRow(rows, "gpt-6-cyber", "input")?.usdPer1M).toBe("20");
    expect(findRow(rows, "gpt-6-cyber", "cache_write_30m")?.usdPer1M).toBe("25");
    expect(findRow(rows, "gpt-6-rosalind", "input")?.usdPer1M).toBe("15");
    expect(findRow(rows, "gpt-6-rosalind", "cache_write_12h")?.usdPer1M).toBe("37.5");
    expect(findRow(rows, "gpt-4o", "input")?.usdPer1M).toBe("2.5");
    expect(findRow(rows, "gpt-4o", "cache_read")?.usdPer1M).toBe("1.25");
    expect(findRow(rows, "gpt-4o", "cache_write_30m")).toBeUndefined();

    const repeated = rows.filter(
      (row) => row.modelSlug === "gpt-5.6-sol" && row.dimension === "input",
    );
    expect(repeated.map((row) => row.usdPer1M).sort()).toEqual(["4", "8"]);

    const gpt55Short = findRow(rows, "gpt-5.5", "input", { promptTokensUnder: 272000 });
    expect(gpt55Short).toMatchObject({
      modelName: "gpt-5.5",
      usdPer1M: "5",
      condition: { promptTokensUnder: 272000 },
    });
    expect(findRow(rows, "gpt-5.5", "input", { promptTokensAtLeast: 272000 })?.usdPer1M).toBe(
      "10",
    );
    expect(
      findRow(rows, "gpt-5.5", "cache_write_30m", { promptTokensUnder: 272000 }),
    ).toBeUndefined();
    expect(
      findRow(rows, "gpt-5.5", "cache_write_12h", { promptTokensAtLeast: 272000 }),
    ).toBeUndefined();

    expect(rows.some((row) => row.modelSlug === "gpt-6-astra" && row.usdPer1M === "5")).toBe(
      false,
    );
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

  it("reads a model that appears only in a later Standard section", () => {
    const markdown = pageWithSections([
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-one")]),
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-two", ["$3.00", ...validRow("ignored").slice(2)])]),
    ]);

    const { rows } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-one", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "gpt-two", "input")?.usdPer1M).toBe("3");
  });

  it("throws when a later Standard section is missing a required column", () => {
    const brokenHeaders = REQUIRED_HEADERS.filter((header) => header !== "Short context output");
    const markdown = pageWithSections([
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-one")]),
      markdownTable(brokenHeaders, [validRow("gpt-two").filter((_, index) => index !== 2)]),
    ]);

    expect(() => parseOpenAiPricing(markdown)).toThrow(/missing required column/i);
  });

  it("throws when two Standard sections disagree on one model", () => {
    const first = validRow("gpt-test");
    const second = validRow("gpt-test", ["$9.00", ...first.slice(2)]);
    const markdown = pageWithSections([
      markdownTable(REQUIRED_HEADERS, [first]),
      markdownTable(REQUIRED_HEADERS, [second]),
    ]);

    expect(() => parseOpenAiPricing(markdown)).toThrow(/duplicate model slug: gpt-test/);
  });

  it("keeps one copy when a later Standard section repeats the same prices", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]), {
      extraHeading: true,
    });

    const { rows } = parseOpenAiPricing(markdown);
    const inputs = rows.filter((row) => row.modelSlug === "gpt-test" && row.dimension === "input");

    expect(inputs).toHaveLength(2);
    expect(inputs.find((row) => row.condition === undefined)?.usdPer1M).toBe("1");
    expect(inputs.find((row) => row.condition?.longContext === true)?.usdPer1M).toBe("2");
  });

  it("keeps one copy when the same price is written as $4.00 and $4", () => {
    const first = validRow("gpt-test");
    const second = [...first];
    second[1] = "$1";
    const markdown = pageWithSections([
      markdownTable(REQUIRED_HEADERS, [first]),
      markdownTable(REQUIRED_HEADERS, [second]),
    ]);

    const { rows } = parseOpenAiPricing(markdown);
    const inputs = rows.filter((row) => row.modelSlug === "gpt-test" && row.dimension === "input");

    expect(inputs).toHaveLength(2);
    expect(inputs.find((row) => row.condition === undefined)?.usdPer1M).toBe("1");
    expect(inputs.find((row) => row.condition?.longContext === true)?.usdPer1M).toBe("2");
  });

  it("throws when a repeated model names a different context boundary", () => {
    const markdown = pageWithSections([
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-5.5 (<272K context length)")]),
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-5.5")]),
    ]);

    expect(() => parseOpenAiPricing(markdown)).toThrow(/duplicate model slug: gpt-5.5/);
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

  it("throws when a Standard section has two tables", () => {
    const table = markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]);
    const markdown = standardPage([table, table].join("\n\n"));

    expect(() => parseOpenAiPricing(markdown)).toThrow(/2 tables/i);
  });

  it("throws when a required column is missing", () => {
    const markdown = standardPage(
      markdownTable(
        REQUIRED_HEADERS.filter((header) => header !== "Short context output"),
        [validRow("gpt-test").filter((_, index) => index !== 2)],
      ),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/missing required column/i);
  });

  it("throws when the October cache-write column is still the header", () => {
    const markdown = standardPage(
      markdownTable(OCTOBER_HEADERS, [["gpt-test", "$1.00", "$0.10", "$1.25", "$5.00", "$2.00", "$0.20", "$2.50", "$7.50"]]),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/missing required column/i);
    expect(() => parseOpenAiPricing(octoberFixture)).toThrow(/missing required column/i);
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
    const amounts = validRow("gpt-test").slice(1);
    amounts[3] = "free";
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, [["gpt-test", ...amounts]]));

    expect(() => parseOpenAiPricing(markdown)).toThrow(/unrecognized cell/i);
  });

  it("throws when the Standard table has no model rows", () => {
    const markdown = standardPage(markdownTable(REQUIRED_HEADERS, []));

    expect(() => parseOpenAiPricing(markdown)).toThrow(/empty table/i);
  });

  it("throws when every price cell is a dash", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [
        validRow("gpt-test", ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]),
      ]),
    );

    expect(() => parseOpenAiPricing(markdown)).toThrow(/empty table/i);
  });

  it("skips a dash cell instead of treating it as a free price", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [
        validRow("gpt-test", [
          "$1.00",
          "$5.00",
          "$0.10",
          "-",
          "$2.50",
          "-",
          "-",
          "-",
          "-",
          "-",
        ]),
      ]),
    );

    const { rows } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "gpt-test", "cache_write_30m")).toBeUndefined();
    expect(findRow(rows, "gpt-test", "cache_write_12h")?.usdPer1M).toBe("2.5");
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
      markdownTable([...REQUIRED_HEADERS, "Audio tokens"], [[...validRow("gpt-test"), "$9.00"]]),
    );

    const { rows, warnings } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
    expect(warnings.some((warning) => /unmappedColumns/i.test(warning))).toBe(true);
  });

  it("keeps a short table when it has an extra column", () => {
    const markdown = standardPage(
      markdownTable(
        ["Model", "Input", "Output", "Cached input", "Audio tokens"],
        [["gpt-test", "$1.00", "$5.00", "$0.10", "$9.00"]],
      ),
    );

    const { rows, warnings } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "gpt-test", "output")?.usdPer1M).toBe("5");
    expect(findRow(rows, "gpt-test", "cache_read")?.usdPer1M).toBe("0.1");
    expect(warnings.some((warning) => /unmappedColumns: Audio tokens/.test(warning))).toBe(true);
  });

  it("reads a table that sits under a Standard subheading", () => {
    const markdown = [
      "Prices per 1M tokens.",
      "### Standard pricing data",
      "#### Standard text models",
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-test")]),
    ].join("\n\n");

    const { rows } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-test", "input")?.usdPer1M).toBe("1");
  });

  it("does not read a Batch table that follows a Standard subheading", () => {
    const markdown = [
      "Prices per 1M tokens.",
      "### Standard pricing data",
      "#### Standard text models",
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-one")]),
      "### Batch pricing data",
      markdownTable(REQUIRED_HEADERS, [validRow("gpt-batch")]),
    ].join("\n\n");

    const { rows } = parseOpenAiPricing(markdown);

    expect(findRow(rows, "gpt-one", "input")?.usdPer1M).toBe("1");
    expect(rows.some((row) => row.modelSlug === "gpt-batch")).toBe(false);
  });

  it("reads long-context cache writes when the row names a token cutoff", () => {
    const markdown = standardPage(
      markdownTable(REQUIRED_HEADERS, [
        validRow("gpt-5.5 (<272K context length)", [
          "$1.00",
          "$5.00",
          "$0.10",
          "$1.25",
          "$2.50",
          "$2.00",
          "$7.50",
          "$0.20",
          "$3.75",
          "$6.25",
        ]),
      ]),
    );

    const { rows } = parseOpenAiPricing(markdown);
    const longContext = { promptTokensAtLeast: 272000 };

    expect(findRow(rows, "gpt-5.5", "cache_write_30m", longContext)?.usdPer1M).toBe("3.75");
    expect(findRow(rows, "gpt-5.5", "cache_write_12h", longContext)?.usdPer1M).toBe("6.25");
    expect(findRow(rows, "gpt-5.5", "cache_write_30m", { promptTokensUnder: 272000 })?.usdPer1M).toBe(
      "1.25",
    );
  });
});
