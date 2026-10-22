import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseModelsDevAnthropic } from "./models-dev";
import type { NormalizedPrice } from "./shape";

const fixture = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/models-dev-sample.json"),
    "utf8",
  ),
) as unknown;

const HAIKU_COST = {
  input: 1,
  output: 5,
  cache_read: 0.1,
  cache_write: 1.25,
};

function findRow(
  rows: NormalizedPrice[],
  modelSlug: string,
  dimension: string,
) {
  return rows.find(
    (row) => row.modelSlug === modelSlug && row.dimension === dimension,
  );
}

function anthropicPayload(
  models: Record<string, unknown>,
  extraProviders: Record<string, unknown> = {},
) {
  return {
    anthropic: { id: "anthropic", models },
    ...extraProviders,
  };
}

function haikuModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    cost: { ...HAIKU_COST },
    ...overrides,
  };
}

describe("parseModelsDevAnthropic", () => {
  it("parses the sample fixture into one row per Haiku dimension and ignores other providers", () => {
    const { rows, warnings } = parseModelsDevAnthropic(fixture);

    expect(rows).toHaveLength(4);
    expect(warnings).toEqual([]);
    expect(rows.every((row) => row.provider === "anthropic")).toBe(true);
    expect(rows.every((row) => row.source === "models.dev")).toBe(true);
    expect(rows.every((row) => row.modelName === "Claude Haiku 4.5")).toBe(true);
    expect(rows.every((row) => row.modelSlug === "claude-haiku-4.5")).toBe(true);
    expect(rows.every((row) => row.condition === undefined)).toBe(true);
    expect(rows.every((row) => row.validFrom === undefined)).toBe(true);
    expect(rows.every((row) => row.validUntil === undefined)).toBe(true);
    expect(rows.some((row) => row.dimension === "cache_write_1h")).toBe(false);

    expect(findRow(rows, "claude-haiku-4.5", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "claude-haiku-4.5", "output")?.usdPer1M).toBe("5");
    expect(findRow(rows, "claude-haiku-4.5", "cache_read")?.usdPer1M).toBe("0.1");
    expect(findRow(rows, "claude-haiku-4.5", "cache_write_5m")?.usdPer1M).toBe(
      "1.25",
    );
  });

  it("strips a trailing (latest) parenthetical before slugging the display name", () => {
    const { rows } = parseModelsDevAnthropic(
      anthropicPayload({
        "claude-haiku-4-5": haikuModel({
          name: "Claude Haiku 4.5 (latest)",
        }),
      }),
    );

    expect(rows[0]?.modelName).toBe("Claude Haiku 4.5");
    expect(rows[0]?.modelSlug).toBe("claude-haiku-4.5");
    expect(rows[0]?.note).toBeUndefined();
  });

  it("omits optional cache dimensions when they are absent", () => {
    const { rows } = parseModelsDevAnthropic(
      anthropicPayload({
        "claude-haiku-4-5": haikuModel({
          cost: { input: 1, output: 5 },
        }),
      }),
    );

    expect(rows).toHaveLength(2);
    expect(findRow(rows, "claude-haiku-4.5", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "claude-haiku-4.5", "output")?.usdPer1M).toBe("5");
    expect(findRow(rows, "claude-haiku-4.5", "cache_read")).toBeUndefined();
    expect(findRow(rows, "claude-haiku-4.5", "cache_write_5m")).toBeUndefined();
  });

  it("throws when the anthropic provider is missing", () => {
    expect(() =>
      parseModelsDevAnthropic({
        openai: { id: "openai", models: { "gpt-5.5": haikuModel() } },
      }),
    ).toThrow(/no anthropic provider|missing anthropic/i);
  });

  it("throws when anthropic has zero models", () => {
    expect(() => parseModelsDevAnthropic(anthropicPayload({}))).toThrow(
      /zero anthropic models|no anthropic models/i,
    );
  });

  it("throws when a model has no cost", () => {
    const model = haikuModel();
    delete (model as { cost?: unknown }).cost;

    expect(() =>
      parseModelsDevAnthropic(anthropicPayload({ "claude-haiku-4-5": model })),
    ).toThrow(/no cost|missing cost/i);
  });

  it("throws when a model is missing input or output", () => {
    expect(() =>
      parseModelsDevAnthropic(
        anthropicPayload({
          "claude-haiku-4-5": haikuModel({
            cost: { output: 5, cache_read: 0.1, cache_write: 1.25 },
          }),
        }),
      ),
    ).toThrow(/missing input|missing required/i);
  });

  it("throws when a cost is not a finite number", () => {
    expect(() =>
      parseModelsDevAnthropic(
        anthropicPayload({
          "claude-haiku-4-5": haikuModel({
            cost: { ...HAIKU_COST, input: Number.POSITIVE_INFINITY },
          }),
        }),
      ),
    ).toThrow(/not a finite number|finite number/i);
  });

  it("throws on an unknown cost key instead of guessing a mapping", () => {
    expect(() =>
      parseModelsDevAnthropic(
        anthropicPayload({
          "claude-haiku-4-5": haikuModel({
            cost: { ...HAIKU_COST, tiers: [{ input: 2 }] },
          }),
        }),
      ),
    ).toThrow(/unknown cost key|unmapped cost/i);
  });

  it("throws on a parenthetical other than a trailing (latest)", () => {
    expect(() =>
      parseModelsDevAnthropic(
        anthropicPayload({
          "claude-haiku-4-5": haikuModel({
            name: "Claude Haiku 4.5 (preview)",
          }),
        }),
      ),
    ).toThrow(/parenthetical|latest/i);
  });

  it("warns about experimental mode blocks and does not read those prices", () => {
    const { rows, warnings } = parseModelsDevAnthropic(
      anthropicPayload({
        "claude-haiku-4-5": haikuModel({
          experimental: {
            modes: {
              fast: {
                cost: { input: 99, output: 99, cache_read: 99, cache_write: 99 },
              },
            },
          },
        }),
      }),
    );

    expect(findRow(rows, "claude-haiku-4.5", "input")?.usdPer1M).toBe("1");
    expect(rows.some((row) => row.usdPer1M === "99")).toBe(false);
    expect(warnings.some((warning) => /experimental|mode block/i.test(warning))).toBe(
      true,
    );
  });

  it("warns and omits a dimension when two aliases disagree on its amount", () => {
    const { rows, warnings } = parseModelsDevAnthropic(
      anthropicPayload({
        "claude-haiku-4-5": haikuModel({
          name: "Claude Haiku 4.5 (latest)",
        }),
        "claude-haiku-4-5-20251001": haikuModel({
          id: "claude-haiku-4-5-20251001",
          name: "Claude Haiku 4.5",
          cost: { ...HAIKU_COST, input: 2 },
        }),
      }),
    );

    expect(findRow(rows, "claude-haiku-4.5", "input")).toBeUndefined();
    expect(findRow(rows, "claude-haiku-4.5", "output")?.usdPer1M).toBe("5");
    expect(
      warnings.some((warning) => /disagree|conflict/i.test(warning)),
    ).toBe(true);
  });
});
