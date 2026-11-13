import { describe, expect, it } from "vitest";
import type { NormalizedPrice } from "@/core/pricing/shape";
import {
  compareLiteLLMWitness,
  type TrackedWitnessModel,
} from "@/core/witness/compare-litellm";

function row(
  modelSlug: string,
  dimension: NormalizedPrice["dimension"],
  usdPer1M: string,
  provider: NormalizedPrice["provider"] = "anthropic",
): NormalizedPrice {
  return {
    provider,
    modelName: modelSlug,
    modelSlug,
    dimension,
    usdPer1M,
    source: "litellm",
  };
}

function tracked(overrides: Partial<TrackedWitnessModel> = {}): TrackedWitnessModel {
  return {
    modelId: 1,
    labSlug: "anthropic",
    modelSlug: "claude-fable-5.1",
    aliases: ["claude-fable-5-1"],
    offeringId: 10,
    openComponents: [{ dimension: "input", amount: "10", condition: {} }],
    ...overrides,
  };
}

describe("compareLiteLLMWitness", () => {
  it("treats 0.10 and 0.1 as the same open price", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-fable-5-1", "input", "0.1")],
      tracked: [
        tracked({
          openComponents: [{ dimension: "input", amount: "0.10", condition: {} }],
        }),
      ],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.agreedCount).toBe(1);
    expect(result.disagreements).toEqual([]);
    expect(result.isBaseline).toBe(true);
    expect(result.newModels).toEqual([]);
  });

  it("stores one disagreement and keeps both amount strings", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-fable-5-1", "input", "0.2")],
      tracked: [
        tracked({
          openComponents: [{ dimension: "input", amount: "0.10", condition: {} }],
        }),
      ],
      previousSlugs: ["claude-fable-5-1"],
      existingCandidateSlugs: [],
    });

    expect(result.agreedCount).toBe(0);
    expect(result.disagreements).toEqual([
      {
        offeringId: 10,
        modelId: 1,
        dimension: "input",
        ourValue: "0.10",
        aggregatorValue: "0.2",
      },
    ]);
  });

  it("compares the witness base amount to the short tier and ignores the long tier", () => {
    const result = compareLiteLLMWitness({
      rows: [row("gpt-6-sol", "input", "5", "openai")],
      tracked: [
        tracked({
          labSlug: "openai",
          modelSlug: "gpt-6-sol",
          aliases: [],
          openComponents: [
            {
              dimension: "input",
              amount: "5",
              condition: { promptTokensAtMost: 272000 },
            },
            {
              dimension: "input",
              amount: "10",
              condition: { promptTokensOver: 272000 },
            },
          ],
        }),
      ],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.agreedCount).toBe(1);
    expect(result.disagreements).toEqual([]);
  });

  it("skips a cache-write duration the witness does not name", () => {
    const result = compareLiteLLMWitness({
      rows: [
        row("gpt-6-sol", "input", "5", "openai"),
        row("gpt-6-sol", "output", "15", "openai"),
      ],
      tracked: [
        tracked({
          labSlug: "openai",
          modelSlug: "gpt-6-sol",
          aliases: [],
          openComponents: [
            { dimension: "input", amount: "5", condition: {} },
            { dimension: "output", amount: "15", condition: {} },
            { dimension: "cache_write_30m", amount: "6.25", condition: {} },
          ],
        }),
      ],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.agreedCount).toBe(1);
    expect(result.disagreements).toEqual([]);
  });

  it("marks a model with no witness name as not linked on the first read", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-other", "input", "1")],
      tracked: [tracked({ aliases: [] })],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.signals).toEqual([{ modelId: 1, kind: "not_linked" }]);
    expect(result.newModels).toEqual([]);
    expect(result.agreedCount).toBe(0);
  });

  it("creates a new-model card only for a slug the previous read did not see", () => {
    const first = compareLiteLLMWitness({
      rows: [row("claude-fable-5-1", "input", "10"), row("claude-other", "input", "1")],
      tracked: [tracked()],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });
    const second = compareLiteLLMWitness({
      rows: [
        row("claude-fable-5-1", "input", "10"),
        row("claude-other", "input", "1"),
        row("claude-new", "input", "2"),
      ],
      tracked: [tracked()],
      previousSlugs: first.seenSlugs,
      existingCandidateSlugs: [],
    });

    expect(first.newModels).toEqual([]);
    expect(second.newModels).toEqual([{ labSlug: "anthropic", rawSlug: "claude-new" }]);
  });

  it("does not open a second card for a slug that already has one", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-fable-5-1", "input", "10"), row("claude-new", "input", "2")],
      tracked: [tracked()],
      previousSlugs: ["claude-fable-5-1"],
      existingCandidateSlugs: ["claude-new"],
    });

    expect(result.newModels).toEqual([]);
  });

  it("marks a model that was linked and then disappears as missing", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-other", "input", "1")],
      tracked: [tracked()],
      previousSlugs: ["claude-fable-5-1"],
      existingCandidateSlugs: [],
    });

    expect(result.signals).toEqual([{ modelId: 1, kind: "missing" }]);
  });

  it("keeps a stored alias that was never in the file as not linked", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-other", "input", "1")],
      tracked: [tracked()],
      previousSlugs: ["claude-other"],
      existingCandidateSlugs: [],
    });

    expect(result.signals).toEqual([{ modelId: 1, kind: "not_linked" }]);
  });

  it("counts a linked model with no open price as not compared", () => {
    const result = compareLiteLLMWitness({
      rows: [row("claude-fable-5-1", "input", "10")],
      tracked: [tracked({ offeringId: null, openComponents: [] })],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.notComparedCount).toBe(1);
    expect(result.agreedCount).toBe(0);
    expect(result.disagreements).toEqual([]);
  });

  it("records the model when its page slug is also stored as an alias", () => {
    const result = compareLiteLLMWitness({
      rows: [row("gpt-6-sol", "input", "5", "openai")],
      tracked: [
        tracked({
          labSlug: "openai",
          modelSlug: "gpt-6-sol",
          aliases: ["gpt-6-sol"],
          openComponents: [{ dimension: "input", amount: "5", condition: {} }],
        }),
      ],
      previousSlugs: null,
      existingCandidateSlugs: [],
    });

    expect(result.agreedCount).toBe(1);
    expect(result.disagreements).toEqual([]);
    expect(result.signals).toEqual([]);
  });

  it("throws when two tracked models share one witness name", () => {
    expect(() =>
      compareLiteLLMWitness({
        rows: [row("gpt-6-sol", "input", "5", "openai")],
        tracked: [
          tracked({
            modelId: 1,
            labSlug: "openai",
            modelSlug: "gpt-6-sol",
            aliases: [],
          }),
          tracked({
            modelId: 2,
            labSlug: "openai",
            modelSlug: "gpt-6-luna",
            aliases: ["gpt-6-sol"],
          }),
        ],
        previousSlugs: null,
        existingCandidateSlugs: [],
      }),
    ).toThrow(/witness name gpt-6-sol is linked to two tracked models/);
  });

  it("throws when one dimension has two comparable amounts", () => {
    expect(() =>
      compareLiteLLMWitness({
        rows: [row("claude-fable-5-1", "input", "10")],
        tracked: [
          tracked({
            openComponents: [
              { dimension: "input", amount: "10", condition: {} },
              { dimension: "input", amount: "12", condition: {} },
            ],
          }),
        ],
        previousSlugs: null,
        existingCandidateSlugs: [],
      }),
    ).toThrow(/two amounts for input on claude-fable-5.1/);
  });
});
