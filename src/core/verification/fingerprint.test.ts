import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { fingerprintParsedPrices } from "@/core/verification/fingerprint";

function priceRow(
  overrides: Partial<NormalizedPrice> & Pick<NormalizedPrice, "dimension" | "usdPer1M">,
): NormalizedPrice {
  return {
    provider: "openai",
    modelName: "Example Model",
    modelSlug: "example-model",
    source: "official",
    ...overrides,
  };
}

describe("fingerprintParsedPrices", () => {
  it("stays the same when rows, keys, or warnings are only reordered", () => {
    const inputRow = priceRow({ dimension: "input", usdPer1M: "1" });
    const outputRow = priceRow({ dimension: "output", usdPer1M: "5" });
    const reorderedKeys: NormalizedPrice = {
      source: "official",
      usdPer1M: "1",
      dimension: "input",
      modelSlug: "example-model",
      modelName: "Example Model",
      provider: "openai",
    };

    const forward = fingerprintParsedPrices({
      rows: [inputRow, outputRow],
      warnings: ["column batch", "column flex"],
    });
    const backward = fingerprintParsedPrices({
      rows: [outputRow, reorderedKeys],
      warnings: ["column flex", "column batch"],
    });

    expect(backward).toBe(forward);
    expect(forward).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not rearrange the caller's arrays", () => {
    const rows = [
      priceRow({ dimension: "output", usdPer1M: "5" }),
      priceRow({ dimension: "input", usdPer1M: "1" }),
    ];
    const warnings = ["column flex", "column batch"];
    const rowsBefore = rows.map((row) => ({ ...row }));
    const warningsBefore = [...warnings];

    fingerprintParsedPrices({ rows, warnings });

    expect(rows).toEqual(rowsBefore);
    expect(warnings).toEqual(warningsBefore);
  });

  it("changes when an amount changes", () => {
    const before = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "1" })],
      warnings: [],
    });
    const after = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "2" })],
      warnings: [],
    });

    expect(after).not.toBe(before);
  });

  it("treats 1 and 1.0 as different text", () => {
    const plain = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "1" })],
      warnings: [],
    });
    const padded = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "1.0" })],
      warnings: [],
    });

    expect(padded).not.toBe(plain);
  });

  it("changes when a warning is added", () => {
    const quiet = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "1" })],
      warnings: [],
    });
    const noisy = fingerprintParsedPrices({
      rows: [priceRow({ dimension: "input", usdPer1M: "1" })],
      warnings: ["unmapped column: batch"],
    });

    expect(noisy).not.toBe(quiet);
  });
});
