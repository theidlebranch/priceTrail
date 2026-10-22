import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnthropicPricing } from "./anthropic";
import { compareAnthropicWitness } from "./compare-anthropic-witness";
import { parseModelsDevAnthropic } from "./models-dev";
import type { NormalizedPrice } from "./shape";

const officialFixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/anthropic-pricing.md"),
  "utf8",
);

const modelsDevFixture = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/models-dev-sample.json"),
    "utf8",
  ),
) as unknown;

function officialPrice(
  overrides: Partial<NormalizedPrice> &
    Pick<NormalizedPrice, "modelSlug" | "dimension" | "usdPer1M">,
): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: overrides.modelName ?? "Claude Test",
    source: "official",
    ...overrides,
  };
}

function witnessPrice(
  overrides: Partial<NormalizedPrice> &
    Pick<NormalizedPrice, "modelSlug" | "dimension" | "usdPer1M">,
): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: overrides.modelName ?? "Claude Test",
    source: "models.dev",
    ...overrides,
  };
}

describe("compareAnthropicWitness", () => {
  it("matches Haiku 4.5 on the shared dimensions and does not treat 1h cache write as a mismatch", () => {
    const official = parseAnthropicPricing(officialFixture).rows;
    const witness = parseModelsDevAnthropic(modelsDevFixture).rows;
    const report = compareAnthropicWitness(official, witness);

    const haikuMatches = report.matches.filter(
      (row) => row.modelSlug === "claude-haiku-4.5",
    );
    expect(haikuMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelSlug: "claude-haiku-4.5",
          dimension: "input",
          usdPer1M: "1",
        }),
        expect.objectContaining({
          modelSlug: "claude-haiku-4.5",
          dimension: "output",
          usdPer1M: "5",
        }),
        expect.objectContaining({
          modelSlug: "claude-haiku-4.5",
          dimension: "cache_read",
          usdPer1M: "0.1",
        }),
        expect.objectContaining({
          modelSlug: "claude-haiku-4.5",
          dimension: "cache_write_5m",
          usdPer1M: "1.25",
        }),
      ]),
    );
    expect(haikuMatches).toHaveLength(4);

    expect(
      report.mismatches.some((row) => row.dimension === "cache_write_1h"),
    ).toBe(false);
    expect(
      report.gaps.some(
        (row) =>
          row.modelSlug === "claude-haiku-4.5" &&
          row.dimension === "cache_write_1h" &&
          row.side === "witness_missing",
      ),
    ).toBe(true);
    expect(report.gaps.some((row) => row.side === "witness_missing")).toBe(true);
    expect(report.gaps.some((row) => row.side === "uncompared")).toBe(true);
  });

  it("reports a price disagreement instead of throwing", () => {
    const report = compareAnthropicWitness(
      [officialPrice({ modelSlug: "claude-haiku-4.5", dimension: "input", usdPer1M: "1" })],
      [witnessPrice({ modelSlug: "claude-haiku-4.5", dimension: "input", usdPer1M: "9" })],
    );

    expect(report.mismatches).toEqual([
      {
        modelSlug: "claude-haiku-4.5",
        dimension: "input",
        official: "1",
        witness: "9",
      },
    ]);
    expect(report.matches).toEqual([]);
  });

  it("treats a conditioned official row as an uncompared gap, not a mismatch", () => {
    const report = compareAnthropicWitness(
      [
        officialPrice({
          modelSlug: "claude-haiku-5.5",
          dimension: "input",
          usdPer1M: "0.1",
          condition: { promptTokensAtMost: 100000 },
        }),
      ],
      [
        witnessPrice({
          modelSlug: "claude-haiku-5.5",
          dimension: "input",
          usdPer1M: "1",
        }),
      ],
    );

    expect(report.mismatches).toEqual([]);
    expect(report.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelSlug: "claude-haiku-5.5",
          dimension: "input",
          side: "uncompared",
          condition: { promptTokensAtMost: 100000 },
        }),
        expect.objectContaining({
          modelSlug: "claude-haiku-5.5",
          dimension: "input",
          side: "official_missing",
        }),
      ]),
    );
  });
});
