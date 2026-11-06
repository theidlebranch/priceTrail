import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { toReviewDetailView, type ReviewItemInput } from "./review-detail";

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

function item(overrides: Partial<ReviewItemInput> = {}): ReviewItemInput {
  return {
    id: 4,
    reviewStatus: "flagged",
    labName: "Anthropic",
    modelName: "Claude Mythos 5.1",
    modelSlug: "claude-mythos-5.1",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    sourceType: "official",
    fetchedAt: new Date("2026-11-01T00:00:00.000Z"),
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    groundingResult: null,
    parsedData: {
      rows: [price(), price({ dimension: "output", usdPer1M: "50" })],
      warnings: [],
    },
    ...overrides,
  };
}

describe("toReviewDetailView", () => {
  it("shows the parsed prices for this model and says the cell check is missing", () => {
    const view = toReviewDetailView(
      item({
        parsedData: {
          rows: [
            price({ usdPer1M: "10.50", condition: { promptTokensAtMost: 100000 } }),
            price({
              modelSlug: "claude-fable-5.1",
              modelName: "Claude Fable 5.1",
              usdPer1M: "15",
            }),
          ],
          warnings: ["storage price stays a warning"],
        },
      }),
    );

    expect(view.prices).toEqual({
      kind: "parsed",
      warningCount: 1,
      warningText: "This snapshot has 1 warning.",
      rows: [
        {
          dimensionLabel: "Input",
          amountText: "10.50",
          conditionText: "prompts up to 100,000 tokens",
          scheduleText: null,
          note: null,
          sourceText: "official",
        },
      ],
    });
    expect(view.cellCheckText).toBe("No cell check is stored for this item.");
    expect(view.notPublishedText).toBe("This is not a published price.");
    expect(view.actionsText).toBe("Confirm and reject are not on this page yet.");
    expect(view.statusText).toBe("Waiting for review.");
    expect(view.fetchedAtText).toBe("2026-11-01 00:00:00 UTC");
    expect(JSON.stringify(view)).not.toContain("15");
    expect(JSON.stringify(view)).not.toContain("storage price");
  });

  it("keeps a schedule as the dates written on the page", () => {
    const view = toReviewDetailView(
      item({
        parsedData: {
          rows: [price({ usdPer1M: "2", validFrom: "2026-10-18", validUntil: "2026-11-30" })],
          warnings: [],
        },
      }),
    );

    expect(view.prices.kind === "parsed" ? view.prices.rows[0]?.scheduleText : null).toBe(
      "2026-10-18 through 2026-11-30",
    );
    expect(view.prices.kind === "parsed" ? view.prices.rows[0]?.amountText : null).toBe("2");
  });

  it("shows a finished stamp without treating it as a published price", () => {
    const view = toReviewDetailView(
      item({
        reviewStatus: "confirmed",
        reviewedBy: "google:123",
        reviewedAt: new Date("2026-11-02T15:04:05.000Z"),
        reviewNote: "Checked the Standard table.",
      }),
    );

    expect(view.statusText).toBe("A reviewer confirmed this item.");
    expect(view.reviewedBy).toBe("google:123");
    expect(view.reviewedAtText).toBe("2026-11-02 15:04:05 UTC");
    expect(view.reviewNote).toBe("Checked the Standard table.");
    expect(view.notPublishedText).toBe("This is not a published price.");
  });

  it("does not read an amount out of the seeded example object", () => {
    const view = toReviewDetailView(
      item({
        parsedData: {
          example: "pending-review",
          modelSlug: "claude-mythos-5.1",
          dimension: "input",
          usdPer1M: "999",
        },
      }),
    );

    expect(view.prices).toEqual({
      kind: "not-a-price-list",
      message: "This snapshot is not a parsed price list.",
    });
    expect(JSON.stringify(view)).not.toContain("999");
  });

  it("throws when a stored grounding result has no reader", () => {
    expect(() => toReviewDetailView(item({ groundingResult: { matched: true } }))).toThrow(
      /grounding_result/,
    );
  });

  it("throws when a parsed row is not a price", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: {
            rows: [{ provider: "anthropic", usdPer1M: "10" }],
            warnings: [],
          },
        }),
      ),
    ).toThrow(/price schema/);
  });

  it("throws when an amount is not a plain decimal", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: {
            rows: [price({ usdPer1M: "nope" })],
            warnings: [],
          },
        }),
      ),
    ).toThrow(/plain decimal/);
  });

  it("throws when the parsed list has no row for this model", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: {
            rows: [price({ modelSlug: "claude-fable-5.1", usdPer1M: "15" })],
            warnings: [],
          },
        }),
      ),
    ).toThrow(/claude-mythos-5\.1/);
  });

  it("throws when a schedule date is not a calendar day", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: {
            rows: [price({ validFrom: "December 1, 2026" })],
            warnings: [],
          },
        }),
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws when the review status is not known", () => {
    expect(() => toReviewDetailView(item({ reviewStatus: "maybe" }))).toThrow(/maybe/);
  });

  it("throws when the pipeline object has rows that are not a list", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: { rows: "10", warnings: [] },
        }),
      ),
    ).toThrow(/rows or warnings/);
  });

  it("throws when a warning is not text", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: { rows: [price()], warnings: [1] },
        }),
      ),
    ).toThrow(/warning/);
  });

  it("throws when the source type is not a known page kind", () => {
    expect(() => toReviewDetailView(item({ sourceType: "blog" }))).toThrow(/blog/);
  });

  it("throws when a schedule day is not a real calendar day", () => {
    expect(() =>
      toReviewDetailView(
        item({
          parsedData: {
            rows: [price({ validFrom: "2026-02-31" })],
            warnings: [],
          },
        }),
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws when reviewedAt is not a real date", () => {
    expect(() => toReviewDetailView(item({ reviewedAt: new Date("nope") }))).toThrow(/reviewedAt/);
  });
});
