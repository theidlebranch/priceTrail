import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import {
  goneModelCards,
  officialCandidateCards,
  planOfficialCandidateChanges,
  pricingRetirementCards,
  type StoredOfficialCard,
} from "@/core/pricing/official-candidates";

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

  it("does not card a new model whose note says retired or deprecated", () => {
    const cards = officialCandidateCards({
      rows: [
        row({ note: "retired" }),
        row({ modelName: "Claude Kept", modelSlug: "claude-kept", note: "limited availability" }),
        row({ modelName: "Retired Haiku", modelSlug: "retired-haiku" }),
      ],
      trackedSlugs: [],
      existingCandidateSlugs: [],
    });

    expect(cards.map((card) => card.modelSlug)).toEqual(["claude-kept", "retired-haiku"]);
  });
});

describe("pricingRetirementCards", () => {
  it("opens one card from the note, including a model we already track", () => {
    const cards = pricingRetirementCards({
      rows: [
        row({ note: "limited availability" }),
        row({ modelName: "Claude Old", modelSlug: "claude-old", note: "Deprecated next month" }),
        row({ modelName: "Claude Old", modelSlug: "claude-old", dimension: "output", note: "deprecated next month" }),
      ],
      existingCandidateSlugs: [],
    });

    expect(cards).toEqual([
      {
        modelName: "Claude Old",
        modelSlug: "claude-old",
        hint: "Deprecated next month",
      },
    ]);
  });

  it("skips a slug that already has a card", () => {
    const cards = pricingRetirementCards({
      rows: [row({ note: "retired" })],
      existingCandidateSlugs: ["claude-haiku-4.5"],
    });

    expect(cards).toEqual([]);
  });

  it("throws when one slug has two retirement notes", () => {
    expect(() =>
      pricingRetirementCards({
        rows: [
          row({ note: "retired" }),
          row({ dimension: "output", note: "deprecated" }),
        ],
        existingCandidateSlugs: [],
      }),
    ).toThrow(/two retirement notes/);
  });
});

describe("goneModelCards", () => {
  const tracked = [{ slug: "claude-fable-5.1", name: "Claude Fable 5.1" }];

  it("waits for a second good miss", () => {
    const once = goneModelCards({
      visits: [{ outcome: "changed", presentSlugs: [] }],
      tracked,
      existingCandidateSlugs: [],
    });
    const twice = goneModelCards({
      visits: [
        { outcome: "unchanged", presentSlugs: [] },
        { outcome: "changed", presentSlugs: [] },
      ],
      tracked,
      existingCandidateSlugs: [],
    });

    expect(once).toEqual([]);
    expect(twice).toEqual([
      {
        modelName: "Claude Fable 5.1",
        modelSlug: "claude-fable-5.1",
        hint: "Missing from two good pricing visits.",
      },
    ]);
  });

  it("lets a bad visit sit between two misses without resetting them", () => {
    const cards = goneModelCards({
      visits: [
        { outcome: "changed", presentSlugs: ["other"] },
        { outcome: "parser_suspect", presentSlugs: ["claude-fable-5.1"] },
        { outcome: "fetch_error", presentSlugs: ["claude-fable-5.1"] },
        { outcome: "changed", presentSlugs: [] },
      ],
      tracked,
      existingCandidateSlugs: [],
    });

    expect(cards).toHaveLength(1);
  });

  it("starts the count again when a good visit includes the model", () => {
    const cards = goneModelCards({
      visits: [
        { outcome: "changed", presentSlugs: [] },
        { outcome: "changed", presentSlugs: ["claude-fable-5.1"] },
        { outcome: "changed", presentSlugs: [] },
      ],
      tracked,
      existingCandidateSlugs: [],
    });

    expect(cards).toEqual([]);
  });

  it("does not open a card that already exists", () => {
    const cards = goneModelCards({
      visits: [
        { outcome: "unchanged", presentSlugs: [] },
        { outcome: "changed", presentSlugs: [] },
      ],
      tracked,
      existingCandidateSlugs: ["claude-fable-5.1"],
    });

    expect(cards).toEqual([]);
  });
});

describe("planOfficialCandidateChanges", () => {
  const twoMisses = [
    { outcome: "unchanged" as const, presentSlugs: [] as string[] },
    { outcome: "changed" as const, presentSlugs: [] as string[] },
  ];

  function stored(overrides: Partial<StoredOfficialCard> = {}): StoredOfficialCard {
    return {
      id: 7,
      rawSlug: "claude-haiku-4.5",
      kind: "new_name",
      status: "approved",
      ...overrides,
    };
  }

  it("opens a retirement card beside an approved new-name card", () => {
    const plan = planOfficialCandidateChanges({
      rows: [row({ note: "retired" })],
      tracked: [{ slug: "claude-haiku-4.5", name: "Claude Haiku 4.5" }],
      visits: [],
      goodVisit: true,
      stored: [stored()],
    });

    expect(plan.conversions).toEqual([]);
    expect(plan.inserts).toEqual([
      {
        rawName: "Claude Haiku 4.5",
        rawSlug: "claude-haiku-4.5",
        kind: "retirement",
        hint: "retired",
      },
    ]);
  });

  it("opens a gone card beside an approved new-name card", () => {
    const plan = planOfficialCandidateChanges({
      rows: [row({ modelName: "Claude Other", modelSlug: "claude-other" })],
      tracked: [{ slug: "claude-haiku-4.5", name: "Claude Haiku 4.5" }],
      visits: twoMisses,
      goodVisit: true,
      stored: [stored()],
    });

    expect(plan.inserts).toEqual([
      {
        rawName: "Claude Other",
        rawSlug: "claude-other",
        kind: "new_name",
        hint: null,
      },
      {
        rawName: "Claude Haiku 4.5",
        rawSlug: "claude-haiku-4.5",
        kind: "gone",
        hint: "Missing from two good pricing visits.",
      },
    ]);
  });

  it("turns a pending new-name card into the retirement card", () => {
    const plan = planOfficialCandidateChanges({
      rows: [row({ note: "Deprecated next month" })],
      tracked: [],
      visits: [],
      goodVisit: true,
      stored: [stored({ status: "pending_review" })],
    });

    expect(plan.inserts).toEqual([]);
    expect(plan.conversions).toEqual([
      {
        id: 7,
        rawName: "Claude Haiku 4.5",
        rawSlug: "claude-haiku-4.5",
        hint: "Deprecated next month",
      },
    ]);
  });

  it("does not convert a pending card on a bad visit", () => {
    const plan = planOfficialCandidateChanges({
      rows: [row({ note: "retired" })],
      tracked: [],
      visits: [],
      goodVisit: false,
      stored: [stored({ status: "pending_review" })],
    });

    expect(plan).toEqual({ inserts: [], conversions: [] });
  });

  it("does not open a retirement card after the new name was rejected", () => {
    const plan = planOfficialCandidateChanges({
      rows: [row({ note: "retired" })],
      tracked: [],
      visits: [],
      goodVisit: true,
      stored: [stored({ status: "rejected" })],
    });

    expect(plan).toEqual({ inserts: [], conversions: [] });
  });

  it("does not open a second retirement or gone card after reject", () => {
    const plan = planOfficialCandidateChanges({
      rows: [
        row({ note: "retired" }),
        row({ modelName: "Claude Other", modelSlug: "claude-other" }),
      ],
      tracked: [{ slug: "claude-haiku-4.5", name: "Claude Haiku 4.5" }],
      visits: twoMisses,
      goodVisit: true,
      stored: [
        stored({ id: 1, kind: "retirement", status: "rejected" }),
        stored({ id: 2, kind: "gone", status: "rejected" }),
      ],
    });

    expect(plan.inserts).toEqual([
      {
        rawName: "Claude Other",
        rawSlug: "claude-other",
        kind: "new_name",
        hint: null,
      },
    ]);
    expect(plan.conversions).toEqual([]);
  });
});
