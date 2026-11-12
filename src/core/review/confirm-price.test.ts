import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import {
  componentsForConfirm,
  sameConfirmPrice,
  trackedPriceUnchanged,
} from "@/core/review/confirm-price";

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

const REVIEWED_AT = new Date("2026-11-10T12:00:00.000Z");

function confirm(parsedData: unknown, modelSlug: string, reviewedAt = REVIEWED_AT) {
  return componentsForConfirm(parsedData, modelSlug, reviewedAt);
}

describe("componentsForConfirm", () => {
  it("keeps this model's rows and drops the rest", () => {
    const components = confirm(
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

  it("keeps a long-context price whose cutoff is not stated", () => {
    const components = confirm(
      snapshot([
        price({ usdPer1M: "2" }),
        price({ usdPer1M: "4", condition: { longContext: true } }),
      ]),
      "claude-mythos-5.1",
    );

    expect(components).toEqual([
      { dimension: "input", unit: "usd_per_1m_tokens", amount: "2" },
      {
        dimension: "input",
        unit: "usd_per_1m_tokens",
        amount: "4",
        condition: { longContext: true },
      },
    ]);
  });

  it("throws when the snapshot is not a parsed price list", () => {
    expect(() =>
      confirm(
        { example: "pending-review", modelSlug: "claude-mythos-5.1", usdPer1M: "999" },
        "claude-mythos-5.1",
      ),
    ).toThrow(/not a parsed price list/);
  });

  it("keeps the segment that includes 2026-11-10 and drops the later one", () => {
    const components = confirm(
      snapshot([
        price({
          provider: "google",
          modelName: "Gemini 4 Argon",
          modelSlug: "gemini-4-argon",
          usdPer1M: "2",
          validUntil: "2026-11-30",
        }),
        price({
          provider: "google",
          modelName: "Gemini 4 Argon",
          modelSlug: "gemini-4-argon",
          usdPer1M: "4",
          validFrom: "2026-12-01",
        }),
      ]),
      "gemini-4-argon",
      new Date("2026-11-10T23:00:00.000Z"),
    );

    expect(components).toEqual([
      { dimension: "input", unit: "usd_per_1m_tokens", amount: "2" },
    ]);
  });

  it("keeps the segment that includes 2026-12-01", () => {
    const components = confirm(
      snapshot([
        price({
          provider: "google",
          modelName: "Gemini 4 Argon",
          modelSlug: "gemini-4-argon",
          usdPer1M: "2",
          validUntil: "2026-11-30",
        }),
        price({
          provider: "google",
          modelName: "Gemini 4 Argon",
          modelSlug: "gemini-4-argon",
          usdPer1M: "4",
          validFrom: "2026-12-01",
        }),
      ]),
      "gemini-4-argon",
      new Date("2026-12-01T00:00:00.000Z"),
    );

    expect(components).toEqual([
      { dimension: "input", unit: "usd_per_1m_tokens", amount: "4" },
    ]);
  });

  it("throws when the review day falls in a gap", () => {
    expect(() =>
      confirm(
        snapshot([
          price({ usdPer1M: "2", validUntil: "2026-11-30" }),
          price({ usdPer1M: "4", validFrom: "2026-12-02" }),
        ]),
        "claude-mythos-5.1",
        new Date("2026-12-01T00:00:00.000Z"),
      ),
    ).toThrow(/no price for claude-mythos-5\.1 applies on 2026-12-01/);
  });

  it("keeps both token tiers when neither row has a schedule", () => {
    const components = confirm(
      snapshot([
        price({
          provider: "google",
          modelName: "Gemini 2.5 Pro",
          modelSlug: "gemini-2.5-pro",
          usdPer1M: "1.25",
          condition: { promptTokensAtMost: 200000 },
        }),
        price({
          provider: "google",
          modelName: "Gemini 2.5 Pro",
          modelSlug: "gemini-2.5-pro",
          usdPer1M: "2.5",
          condition: { promptTokensOver: 200000 },
        }),
      ]),
      "gemini-2.5-pro",
    );

    expect(components).toEqual([
      {
        dimension: "input",
        unit: "usd_per_1m_tokens",
        amount: "1.25",
        condition: { promptTokensAtMost: 200000 },
      },
      {
        dimension: "input",
        unit: "usd_per_1m_tokens",
        amount: "2.5",
        condition: { promptTokensOver: 200000 },
      },
    ]);
  });

  it("throws when a schedule date is not a calendar day", () => {
    expect(() =>
      confirm(snapshot([price({ usdPer1M: "2", validUntil: "2026-02-31" })]), "claude-mythos-5.1"),
    ).toThrow(/schedule date/);
  });

  it("throws when an amount is not a plain decimal", () => {
    expect(() =>
      confirm(snapshot([price({ usdPer1M: "10.50 USD" })]), "claude-mythos-5.1"),
    ).toThrow(/plain decimal/);
  });

  it("throws when a row did not come from the official page", () => {
    expect(() =>
      confirm(snapshot([price({ source: "litellm" })]), "claude-mythos-5.1"),
    ).toThrow(/official/);
  });

  it("throws when two rows share a dimension and a tier", () => {
    expect(() =>
      confirm(
        snapshot([price({ usdPer1M: "10" }), price({ usdPer1M: "12" })]),
        "claude-mythos-5.1",
      ),
    ).toThrow(/dimension and tier/);
  });

  it("throws when this model is missing from the list", () => {
    expect(() =>
      confirm(
        snapshot([price({ modelSlug: "claude-fable-5.1", modelName: "Claude Fable 5.1" })]),
        "claude-mythos-5.1",
      ),
    ).toThrow(/claude-mythos-5\.1/);
  });

  it("throws when a row is not a price", () => {
    expect(() =>
      confirm(
        { rows: [{ provider: "anthropic", usdPer1M: "10" }], warnings: [] },
        "claude-mythos-5.1",
      ),
    ).toThrow(/price schema/);
  });

  it("throws when a warning is not text", () => {
    expect(() => confirm({ rows: [price()], warnings: [1] }, "claude-mythos-5.1")).toThrow(
      /warning/,
    );
  });
});

describe("sameConfirmPrice", () => {
  it("treats 0.10 and 0.1 as the same price", () => {
    const next = confirm(snapshot([price({ usdPer1M: "0.10" })]), "claude-mythos-5.1");

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
    const next = confirm(snapshot([price({ usdPer1M: "12" })]), "claude-mythos-5.1");

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

describe("trackedPriceUnchanged", () => {
  const open = [
    {
      dimension: "input",
      unit: "usd_per_1m_tokens",
      amount: "10",
      condition: {},
    },
  ];

  it("is true when today's prices match the open price", () => {
    const rows = [price({ usdPer1M: "10" }), price({ modelSlug: "other-model", usdPer1M: "99" })];

    expect(
      trackedPriceUnchanged({
        nextRows: rows,
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open,
      }),
    ).toBe(true);
  });

  it("treats 10 and 10.0 as the same row", () => {
    expect(
      trackedPriceUnchanged({
        nextRows: [price({ usdPer1M: "10" })],
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open: [{ ...open[0], amount: "10.00" }],
      }),
    ).toBe(true);
  });

  it("is false when the amount differs from the open price", () => {
    expect(
      trackedPriceUnchanged({
        nextRows: [price({ usdPer1M: "12" })],
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open,
      }),
    ).toBe(false);
  });

  it("is true when a later dated price is new and today's price matches", () => {
    const next = [
      price({
        provider: "google",
        modelName: "Gemini 4 Argon",
        modelSlug: "gemini-4-argon",
        usdPer1M: "2",
        validUntil: "2026-11-30",
      }),
      price({
        provider: "google",
        modelName: "Gemini 4 Argon",
        modelSlug: "gemini-4-argon",
        usdPer1M: "4",
        validFrom: "2026-12-01",
      }),
    ];

    expect(
      trackedPriceUnchanged({
        nextRows: next,
        modelSlug: "gemini-4-argon",
        fetchedAt: new Date("2026-11-10T23:00:00.000Z"),
        open: [
          {
            dimension: "input",
            unit: "usd_per_1m_tokens",
            amount: "2",
            condition: {},
          },
        ],
      }),
    ).toBe(true);
  });

  it("is false when output changed and input still matches", () => {
    expect(
      trackedPriceUnchanged({
        nextRows: [price({ usdPer1M: "10" }), price({ dimension: "output", usdPer1M: "40" })],
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open,
      }),
    ).toBe(false);
  });

  it("is false when there is no open price", () => {
    expect(
      trackedPriceUnchanged({
        nextRows: [price()],
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open: null,
      }),
    ).toBe(false);
  });

  it("is true when there is no previous snapshot and today's price matches", () => {
    expect(
      trackedPriceUnchanged({
        nextRows: [price()],
        modelSlug: "claude-mythos-5.1",
        fetchedAt: REVIEWED_AT,
        open,
      }),
    ).toBe(true);
  });
});
