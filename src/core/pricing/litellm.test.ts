import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLiteLLM } from "./litellm";
import type { NormalizedPrice } from "./shape";

const fixture = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/litellm-sample.json"),
    "utf8",
  ),
) as unknown;

function findRow(
  rows: NormalizedPrice[],
  modelSlug: string,
  dimension: string,
) {
  return rows.find(
    (row) => row.modelSlug === modelSlug && row.dimension === dimension,
  );
}

function chatEntry(overrides: Record<string, unknown> = {}) {
  return {
    litellm_provider: "anthropic",
    mode: "chat",
    input_cost_per_token: 0.000001,
    output_cost_per_token: 0.000005,
    ...overrides,
  };
}

describe("parseLiteLLM", () => {
  it("parses the sample fixture into per-1M rows and leaves tier prices unmapped", () => {
    const { rows, warnings } = parseLiteLLM(fixture);

    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.source === "litellm")).toBe(true);
    expect(rows.every((row) => row.modelName === row.modelSlug)).toBe(true);
    expect(rows.every((row) => row.condition === undefined)).toBe(true);
    expect(rows.every((row) => row.validFrom === undefined)).toBe(true);
    expect(rows.every((row) => row.validUntil === undefined)).toBe(true);
    expect(rows.some((row) => row.modelSlug.includes("20251001"))).toBe(false);
    expect(rows.some((row) => row.modelSlug.startsWith("gemini/"))).toBe(false);
    expect(rows.some((row) => row.dimension === "cache_write")).toBe(false);

    const haiku = rows.filter((row) => row.modelSlug === "claude-haiku-4-5");
    expect(haiku).toHaveLength(5);
    expect(haiku.every((row) => row.provider === "anthropic")).toBe(true);
    expect(findRow(rows, "claude-haiku-4-5", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "claude-haiku-4-5", "output")?.usdPer1M).toBe("5");
    expect(findRow(rows, "claude-haiku-4-5", "cache_read")?.usdPer1M).toBe("0.1");
    expect(findRow(rows, "claude-haiku-4-5", "cache_write_5m")?.usdPer1M).toBe(
      "1.25",
    );
    expect(findRow(rows, "claude-haiku-4-5", "cache_write_1h")?.usdPer1M).toBe(
      "2",
    );
    expect(
      warnings.some(
        (warning) =>
          warning.includes("claude-haiku-4-5") &&
          /split|tier|above_\d+k/i.test(warning),
      ),
    ).toBe(false);

    expect(rows.filter((row) => row.modelSlug === "gpt-5.5")).toHaveLength(3);
    expect(rows.filter((row) => row.modelSlug === "gpt-5.5").every((row) => row.provider === "openai")).toBe(true);
    expect(findRow(rows, "gpt-5.5", "input")?.usdPer1M).toBe("5");
    expect(findRow(rows, "gpt-5.5", "output")?.usdPer1M).toBe("30");
    expect(findRow(rows, "gpt-5.5", "cache_read")?.usdPer1M).toBe("0.5");
    expect(findRow(rows, "gpt-5.5", "cache_write_5m")).toBeUndefined();
    expect(findRow(rows, "gpt-5.5", "cache_write_1h")).toBeUndefined();
    expect(warnings.some((warning) => /gpt-5\.5/.test(warning) && /272k/.test(warning))).toBe(true);

    expect(findRow(rows, "gemini-3.1-pro-preview", "input")).toMatchObject({
      provider: "google",
      modelName: "gemini-3.1-pro-preview",
      usdPer1M: "2",
    });
    expect(findRow(rows, "gemini-3.1-pro-preview", "output")?.usdPer1M).toBe("12");
    expect(findRow(rows, "gemini-3.1-pro-preview", "cache_read")?.usdPer1M).toBe(
      "0.2",
    );
    expect(findRow(rows, "gemini-2.5-pro", "input")?.usdPer1M).toBe("1.25");
    expect(findRow(rows, "gemini-2.5-pro", "output")?.usdPer1M).toBe("10");
    expect(findRow(rows, "gemini-2.5-pro", "cache_read")?.usdPer1M).toBe("0.125");
    expect(findRow(rows, "gemini-4-argon", "input")?.usdPer1M).toBe("2");
    expect(findRow(rows, "gemini-4-argon", "output")?.usdPer1M).toBe("10");
    expect(findRow(rows, "gemini-4-argon", "cache_read")?.usdPer1M).toBe("0.1");
    expect(findRow(rows, "gemini-3.8-flash", "input")?.usdPer1M).toBe("0.75");
    expect(findRow(rows, "gemini-3.8-flash", "output")?.usdPer1M).toBe("3.75");
    expect(findRow(rows, "gemini-3.8-flash", "cache_read")?.usdPer1M).toBe(
      "0.075",
    );

    for (const slug of ["gemini-3.1-pro-preview", "gemini-2.5-pro"]) {
      expect(
        warnings.some((warning) => warning.includes(slug) && /200k/.test(warning)),
      ).toBe(true);
      expect(rows.filter((row) => row.modelSlug === slug)).toHaveLength(3);
      expect(
        rows
          .filter((row) => row.modelSlug === slug)
          .every((row) => row.provider === "google"),
      ).toBe(true);
    }

    expect(
      warnings.some(
        (warning) =>
          warning.includes("gemini-4-argon") && /reasoning/i.test(warning),
      ),
    ).toBe(true);
    expect(rows.some((row) => row.usdPer1M === "2.5")).toBe(false);
  });

  it("ignores batch, flex, and priority prices, including tier copies of them", () => {
    const { rows, warnings } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry({
        input_cost_per_token_batches: 0.0000005,
        output_cost_per_token_flex: 0.0000099,
        cache_read_input_token_cost_priority: 9.9e-6,
        input_cost_per_token_above_200k_tokens_batches: 0.0000099,
      }),
    });

    expect(rows).toHaveLength(2);
    expect(findRow(rows, "claude-haiku-4-5", "input")?.usdPer1M).toBe("1");
    expect(findRow(rows, "claude-haiku-4-5", "output")?.usdPer1M).toBe("5");
    expect(rows.some((row) => row.usdPer1M === "0.5" || row.usdPer1M === "9.9")).toBe(
      false,
    );
    expect(warnings).toEqual([]);
  });

  it("maps above_1hr to cache_write_1h and does not treat it as a context split", () => {
    const { rows, warnings } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry({
        cache_creation_input_token_cost_above_1hr: 0.000002,
      }),
    });

    expect(findRow(rows, "claude-haiku-4-5", "cache_write_1h")?.usdPer1M).toBe("2");
    expect(warnings.some((warning) => /split|above_\d+k/i.test(warning))).toBe(
      false,
    );
  });

  it("warns on a context split and does not copy the threshold into a condition", () => {
    const { rows, warnings } = parseLiteLLM({
      "gpt-5.5": chatEntry({
        litellm_provider: "openai",
        input_cost_per_token: 0.000005,
        output_cost_per_token: 0.00003,
        input_cost_per_token_above_272k_tokens: 0.00001,
        output_cost_per_token_above_272k_tokens: 0.000045,
      }),
    });

    expect(rows.every((row) => row.condition === undefined)).toBe(true);
    expect(rows.some((row) => row.usdPer1M === "10" || row.usdPer1M === "45")).toBe(
      false,
    );
    expect(findRow(rows, "gpt-5.5", "input")?.usdPer1M).toBe("5");
    expect(warnings.some((warning) => /272k/.test(warning))).toBe(true);
  });

  it("warns on an unmapped cost field and still keeps the plain output price", () => {
    const { rows, warnings } = parseLiteLLM({
      "gemini/gemini-4-argon": chatEntry({
        litellm_provider: "gemini",
        input_cost_per_token: 0.000002,
        output_cost_per_token: 0.00001,
        output_cost_per_reasoning_token: 0.00001,
      }),
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.provider === "google")).toBe(true);
    expect(rows.every((row) => row.modelSlug === "gemini-4-argon")).toBe(true);
    expect(findRow(rows, "gemini-4-argon", "output")?.usdPer1M).toBe("10");
    expect(
      warnings.some((warning) => /output_cost_per_reasoning_token/.test(warning)),
    ).toBe(true);
  });

  it("warns on a per-query cost object and does not emit a row for it", () => {
    const { rows, warnings } = parseLiteLLM({
      "gpt-5.5": chatEntry({
        litellm_provider: "openai",
        input_cost_per_token: 0.000005,
        output_cost_per_token: 0.00003,
        search_context_cost_per_query: {
          search_context_size_low: 0.01,
        },
      }),
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.usdPer1M === "5" || row.usdPer1M === "30")).toBe(
      true,
    );
    expect(
      warnings.some((warning) => /search_context_cost_per_query/.test(warning)),
    ).toBe(true);
  });

  it("ignores non-price fields", () => {
    const { rows, warnings } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry({
        max_tokens: 64000,
        supports_vision: true,
        source: "https://example.com",
        regional_processing_uplift_multiplier_eu: 1.1,
      }),
    });

    expect(rows).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("skips other providers and non-chat modes", () => {
    const { rows } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry(),
      "bedrock/claude-haiku-4-5": chatEntry({
        litellm_provider: "bedrock",
        input_cost_per_token: 0.000009,
        output_cost_per_token: 0.000009,
      }),
      "text-embedding-3-small": chatEntry({
        litellm_provider: "openai",
        mode: "embedding",
        input_cost_per_token: 0.000009,
        output_cost_per_token: 0.000009,
      }),
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.provider === "anthropic")).toBe(true);
    expect(rows.every((row) => row.usdPer1M === "1" || row.usdPer1M === "5")).toBe(
      true,
    );
  });

  it("collapses an agreeing dated snapshot into the bare key", () => {
    const { rows, warnings } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry(),
      "claude-haiku-4-5-20251001": chatEntry(),
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.modelSlug === "claude-haiku-4-5")).toBe(true);
    expect(rows.every((row) => row.modelName === "claude-haiku-4-5")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("uses the bare key when only a dated snapshot is present", () => {
    const { rows } = parseLiteLLM({
      "claude-haiku-4-5-20251001": chatEntry(),
    });

    expect(rows[0]?.modelSlug).toBe("claude-haiku-4-5");
    expect(rows[0]?.modelName).toBe("claude-haiku-4-5");
  });

  it("warns and omits a dimension when the dated snapshot disagrees", () => {
    const { rows, warnings } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry(),
      "claude-haiku-4-5-20251001": chatEntry({
        input_cost_per_token: 0.000002,
      }),
    });

    expect(findRow(rows, "claude-haiku-4-5", "input")).toBeUndefined();
    expect(findRow(rows, "claude-haiku-4-5", "output")?.usdPer1M).toBe("5");
    expect(rows.some((row) => row.modelSlug.includes("20251001"))).toBe(false);
    expect(warnings.some((warning) => /disagree/i.test(warning))).toBe(true);
  });

  it("omits a cache dimension when the field is absent instead of emitting 0", () => {
    const { rows } = parseLiteLLM({
      "claude-haiku-4-5": chatEntry(),
    });

    expect(findRow(rows, "claude-haiku-4-5", "cache_read")).toBeUndefined();
    expect(findRow(rows, "claude-haiku-4-5", "cache_write_5m")).toBeUndefined();
    expect(findRow(rows, "claude-haiku-4-5", "cache_write_1h")).toBeUndefined();
    expect(rows.some((row) => row.usdPer1M === "0")).toBe(false);
  });

  it("throws when no kept chat rows remain", () => {
    expect(() =>
      parseLiteLLM({
        "bedrock/claude-haiku-4-5": chatEntry({ litellm_provider: "bedrock" }),
      }),
    ).toThrow(/no kept|zero chat|no chat/i);
    expect(() => parseLiteLLM({})).toThrow(/no kept|zero chat|no chat/i);
  });

  it("throws when a non-chat mode is the only row", () => {
    expect(() =>
      parseLiteLLM({
        "text-embedding-3-small": chatEntry({ mode: "embedding" }),
      }),
    ).toThrow(/no kept|zero chat|no chat/i);
  });

  it("throws when mode is absent on a kept provider", () => {
    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": {
          litellm_provider: "anthropic",
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.000005,
        },
      }),
    ).toThrow(/mode/i);
  });

  it("throws when a kept model is missing input or output", () => {
    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": {
          litellm_provider: "anthropic",
          mode: "chat",
          output_cost_per_token: 0.000005,
        },
      }),
    ).toThrow(/input/i);

    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": {
          litellm_provider: "anthropic",
          mode: "chat",
          input_cost_per_token: 0.000001,
        },
      }),
    ).toThrow(/output/i);
  });

  it("throws when a mapped cost is not a finite number", () => {
    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": chatEntry({
          input_cost_per_token: Number.POSITIVE_INFINITY,
        }),
      }),
    ).toThrow(/finite/i);

    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": chatEntry({
          cache_read_input_token_cost: null,
        }),
      }),
    ).toThrow(/finite|missing|null/i);
  });

  it("throws when a mapped cost is negative", () => {
    expect(() =>
      parseLiteLLM({
        "claude-haiku-4-5": chatEntry({
          output_cost_per_token: -0.000005,
        }),
      }),
    ).toThrow(/negative/i);
  });

  it("throws when a gemini key has no gemini/ prefix", () => {
    expect(() =>
      parseLiteLLM({
        "gemini-2.5-pro": chatEntry({ litellm_provider: "gemini" }),
      }),
    ).toThrow(/gemini\//i);
  });
});
