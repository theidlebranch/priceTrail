import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { componentsForConfirm, sameConfirmPrice } from "@/core/review/confirm-price";

/**
 * These checks decide whether a parsed snapshot can become a published
 * price. They do not open a database. Each throw is a case that fails
 * on purpose, so a bad snapshot cannot reach publishPriceVersion().
 */

function price(overrides: Partial<NormalizedPrice> = {}): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: "Claude Mythos 5.1",
    modelSlug: "claude-mythos-5.1",
    dimension: "input",
    usdPer1M: "10",
    source: "official",
    ...overrides,
  };
}

function snapshot(rows: NormalizedPrice[], warnings: unknown[] = []) {
  return { rows, warnings };
}

describe("componentsForConfirm", () => {
  it("keeps this model's rows and drops the rest", () => {
    const components = componentsForConfirm(
      snapshot([
        price({ usdPer1M: "10.50", condition: { promptTokensAtMost: 100000 } }),
        price({ dimension: "output", usdPer1M: "50" }),
        price({
          modelSlug: "claude-fable-5.1",
          modelName: "Claude Fable 5.1",
          usdPer1M: "15",
        }),
      ]),
      "claude-mythos-5.1",
    );

    expect(components).toEqual([
      {
        dimension: "input",
        unit: "usd_per_1m_tokens",
        amount: "10.50",
        condition: { promptTokensAtMost: 100000 },
      },
      {
        dimension: "output",
        unit: "usd_per_1m_tokens",
        amount: "50",
      },
    ]);
  });

  it("throws when the snapshot is not a parsed price list", () => {
    expect(() =>
      componentsForConfirm(
        { example: "pending-review", modelSlug: "claude-mythos-5.1", usdPer1M: "999" },
        "claude-mythos-5.1",
      ),
    ).toThrow(/not a parsed price list/);
  });

  it("throws when this model has a schedule date", () => {
    expect(() =>
      componentsForConfirm(
        snapshot([
          price({ usdPer1M: "2", validUntil: "2026-11-30" }),
          price({ usdPer1M: "4", validFrom: "2026-12-01" }),
        ]),
        "claude-mythos-5.1",
      ),
    ).toThrow(/schedule/);
  });

  it("throws when an amount is not a plain decimal", () => {
    expect(() =>
      componentsForConfirm(snapshot([price({ usdPer1M: "10.50 USD" })]), "claude-mythos-5.1"),
    ).toThrow(/plain decimal/);
  });

  it("throws when a row did not come from the official page", () => {
    expect(() =>
      componentsForConfirm(snapshot([price({ source: "litellm" })]), "claude-mythos-5.1"),
    ).toThrow(/official/);
  });

  it("throws when two rows share a dimension and a tier", () => {
    expect(() =>
      componentsForConfirm(
        snapshot([price({ usdPer1M: "10" }), price({ usdPer1M: "12" })]),
        "claude-mythos-5.1",
      ),
    ).toThrow(/dimension and tier/);
  });

  it("throws when this model is missing from the list", () => {
    expect(() =>
      componentsForConfirm(
        snapshot([price({ modelSlug: "claude-fable-5.1", modelName: "Claude Fable 5.1" })]),
        "claude-mythos-5.1",
      ),
    ).toThrow(/claude-mythos-5\.1/);
  });

  it("throws when a row is not a price", () => {
    expect(() =>
      componentsForConfirm(
        { rows: [{ provider: "anthropic", usdPer1M: "10" }], warnings: [] },
        "claude-mythos-5.1",
      ),
    ).toThrow(/price schema/);
  });

  it("throws when a warning is not text", () => {
    expect(() => componentsForConfirm({ rows: [price()], warnings: [1] }, "claude-mythos-5.1")).toThrow(
      /warning/,
    );
  });
});

describe("sameConfirmPrice", () => {
  it("treats 0.10 and 0.1 as the same price", () => {
    const next = componentsForConfirm(snapshot([price({ usdPer1M: "0.10" })]), "claude-mythos-5.1");

    expect(
      sameConfirmPrice(next, [
        {
          dimension: "input",
          unit: "usd_per_1m_tokens",
          amount: "0.1",
          condition: {},
        },
      ]),
    ).toBe(true);
  });

  it("returns false when an amount changed", () => {
    const next = componentsForConfirm(snapshot([price({ usdPer1M: "12" })]), "claude-mythos-5.1");

    expect(
      sameConfirmPrice(next, [
        {
          dimension: "input",
          unit: "usd_per_1m_tokens",
          amount: "10",
          condition: {},
        },
      ]),
    ).toBe(false);
  });
});
