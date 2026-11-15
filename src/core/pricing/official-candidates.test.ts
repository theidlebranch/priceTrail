import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { officialCandidateCards } from "@/core/pricing/official-candidates";

function row(overrides: Partial<NormalizedPrice> = {}): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: "Claude Haiku 4.5",
    modelSlug: "claude-haiku-4.5",
    dimension: "input",
    usdPer1M: "1",
    source: "official",
    ...overrides,
  };
}

describe("officialCandidateCards", () => {
  it("cards an untracked slug and skips a tracked model and an existing card", () => {
    const cards = officialCandidateCards({
      rows: [
        row(),
        row({ modelName: "Claude Fable 5.1", modelSlug: "claude-fable-5.1", usdPer1M: "10" }),
        row({ modelName: "Claude Old", modelSlug: "claude-old", usdPer1M: "3" }),
      ],
      trackedSlugs: ["claude-fable-5.1"],
      existingCandidateSlugs: ["claude-old"],
    });

    expect(cards).toEqual([{ modelName: "Claude Haiku 4.5", modelSlug: "claude-haiku-4.5" }]);
  });

  it("keeps one card when the same slug has two prices", () => {
    const cards = officialCandidateCards({
      rows: [row({ dimension: "input" }), row({ dimension: "output", usdPer1M: "5" })],
      trackedSlugs: [],
      existingCandidateSlugs: [],
    });

    expect(cards).toEqual([{ modelName: "Claude Haiku 4.5", modelSlug: "claude-haiku-4.5" }]);
  });

  it("lists cards in slug order", () => {
    const cards = officialCandidateCards({
      rows: [
        row({ modelName: "Zed", modelSlug: "zed" }),
        row({ modelName: "Alpha", modelSlug: "alpha" }),
      ],
      trackedSlugs: [],
      existingCandidateSlugs: [],
    });

    expect(cards.map((card) => card.modelSlug)).toEqual(["alpha", "zed"]);
  });

  it("throws when one slug has two names", () => {
    expect(() =>
      officialCandidateCards({
        rows: [row({ modelName: "Haiku" }), row({ modelName: "Haiku 4.5", dimension: "output" })],
        trackedSlugs: [],
        existingCandidateSlugs: [],
      }),
    ).toThrow(/claude-haiku-4.5/);
  });

  it("throws when a slug cannot be one public path segment", () => {
    expect(() =>
      officialCandidateCards({
        rows: [row({ modelSlug: "a/b", modelName: "Broken" })],
        trackedSlugs: [],
        existingCandidateSlugs: [],
      }),
    ).toThrow(/slug/);
  });

  it("throws when a row did not come from an official page", () => {
    expect(() =>
      officialCandidateCards({
        rows: [row({ source: "litellm" })],
        trackedSlugs: [],
        existingCandidateSlugs: [],
      }),
    ).toThrow(/official/);
  });
});
