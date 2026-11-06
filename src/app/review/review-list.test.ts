import { describe, expect, it } from "vitest";
import { parseReviewItemId, toReviewListEntries, type ReviewListRow } from "./review-list";

function row(overrides: Partial<ReviewListRow> = {}): ReviewListRow {
  return {
    id: 4,
    reviewStatus: "flagged",
    labName: "Anthropic",
    modelName: "Claude Mythos 5.1",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    fetchedAt: new Date("2026-11-01T00:00:00.000Z"),
    reviewNote: "Example pending change for the public banner. Not a published price.",
    ...overrides,
  };
}

describe("toReviewListEntries", () => {
  it("links a waiting item and keeps the fetched time in UTC", () => {
    expect(toReviewListEntries([row()])).toEqual([
      {
        href: "/review/items/4",
        labName: "Anthropic",
        modelName: "Claude Mythos 5.1",
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing.md",
        fetchedAtText: "2026-11-01 00:00:00 UTC",
        reviewNote: "Example pending change for the public banner. Not a published price.",
      },
    ]);
  });

  it("keeps the order it was given", () => {
    const entries = toReviewListEntries([
      row({ id: 9, modelName: "Newer" }),
      row({ id: 4, modelName: "Older", reviewNote: null }),
    ]);

    expect(entries.map((entry) => entry.href)).toEqual(["/review/items/9", "/review/items/4"]);
    expect(entries[1]?.reviewNote).toBeNull();
  });

  it("returns an empty list when nothing is waiting", () => {
    expect(toReviewListEntries([])).toEqual([]);
  });

  it("throws when a row is not still waiting", () => {
    expect(() => toReviewListEntries([row({ reviewStatus: "confirmed" })])).toThrow(/confirmed/);
    expect(() => toReviewListEntries([row({ reviewStatus: "ok" })])).toThrow(/ok/);
    expect(() => toReviewListEntries([row({ reviewStatus: "rejected" })])).toThrow(/rejected/);
  });

  it("throws when the id is not a whole number", () => {
    expect(() => toReviewListEntries([row({ id: 0 })])).toThrow(/whole number/);
    expect(() => toReviewListEntries([row({ id: 1.5 })])).toThrow(/whole number/);
    expect(() => toReviewListEntries([row({ id: -3 })])).toThrow(/whole number/);
    expect(() => parseReviewItemId("01")).toThrow(/whole number/);
    expect(() => parseReviewItemId("1e2")).toThrow(/whole number/);
  });

  it("throws when the lab name or the source url is empty", () => {
    expect(() => toReviewListEntries([row({ labName: "  " })])).toThrow(/lab name/);
    expect(() => toReviewListEntries([row({ sourceUrl: "" })])).toThrow(/source url/);
  });

  it("throws when fetchedAt is not a real date", () => {
    expect(() => toReviewListEntries([row({ fetchedAt: new Date("nope") })])).toThrow(/fetchedAt/);
  });

  it("throws when two rows would share one path", () => {
    expect(() => toReviewListEntries([row({ id: 4 }), row({ id: 4, modelName: "Other" })])).toThrow(
      /\/review\/items\/4/,
    );
  });
});
