import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenRouter } from "./openrouter";
import type { NormalizedPrice } from "./shape";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/fixtures/openrouter-sample.json"), "utf8"),
) as unknown;

function findRow(rows: NormalizedPrice[], modelSlug: string, dimension: string) {
  return rows.find((row) => row.modelSlug === modelSlug && row.dimension === dimension);
}

function catalog(models: Record<string, unknown>[]) {
  return { data: models };
}

function model(
  id: string,
  pricing: Record<string, unknown>,
  name?: string,
): Record<string, unknown> {
  return { id, name: name ?? id, pricing };
}

describe("parseOpenRouter", () => {
  it("parses the sample fixture into per-1M rows and leaves other modes out", () => {
    const { rows, warnings } = parseOpenRouter(fixture);

    expect(rows.every((row) => row.source === "openrouter")).toBe(true);
    expect(rows.some((row) => row.modelSlug.includes(":"))).toBe(false);
    expect(rows.some((row) => row.modelSlug === "llama-sample")).toBe(false);
    expect(rows.some((row) => row.modelSlug === "router-sample")).toBe(false);
    expect(rows.some((row) => row.provider === "google" && row.modelSlug === "gemini-2.5-pro")).toBe(
      true,
    );

    const fable = rows.filter((row) => row.modelSlug === "claude-fable-5.1");
    expect(fable).toHaveLength(5);
    expect(fable.every((row) => row.provider === "anthropic")).toBe(true);
    expect(fable.every((row) => row.modelName === "Anthropic: Claude Fable 5.1")).toBe(true);
    expect(findRow(rows, "claude-fable-5.1", "input")?.usdPer1M).toBe("10");
    expect(findRow(rows, "claude-fable-5.1", "output")?.usdPer1M).toBe("50");
    expect(findRow(rows, "claude-fable-5.1", "cache_read")?.usdPer1M).toBe("0.25");
    expect(findRow(rows, "claude-fable-5.1", "cache_write_5m")?.usdPer1M).toBe("12.5");
    expect(findRow(rows, "claude-fable-5.1", "cache_write_1h")?.usdPer1M).toBe("20");

    const sol = rows.filter((row) => row.modelSlug === "gpt-6-sol");
    expect(sol.map((row) => row.dimension).sort()).toEqual([
      "cache_read",
      "cache_write_5m",
      "input",
      "output",
    ]);
    expect(findRow(rows, "gpt-6-sol", "input")?.usdPer1M).toBe("2");
    expect(rows.filter((row) => row.modelSlug === "gpt-6-sol-pro")).toHaveLength(2);

    expect(findRow(rows, "gemini-2.5-pro", "input")?.usdPer1M).toBe("1.25");
    expect(findRow(rows, "gemini-2.5-pro", "cache_read")?.usdPer1M).toBe("0.125");
    expect(findRow(rows, "gemini-free-sample", "input")?.usdPer1M).toBe("0");
    expect(findRow(rows, "gemini-free-sample", "output")?.usdPer1M).toBe("0");

    expect(warnings.some((warning) => warning.includes("claude-fable-5.1:batch"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("gpt-6-sol") && /long-context/i.test(warning))).toBe(
      true,
    );
    expect(warnings.some((warning) => warning.includes("router-sample") && /unknown price/i.test(warning))).toBe(
      true,
    );
    expect(warnings.some((warning) => warning.includes("web_search"))).toBe(true);
    expect(rows.some((row) => row.usdPer1M === "4")).toBe(false);
  });

  it("multiplies a per-token string by one million without float math", () => {
    const { rows } = parseOpenRouter(
      catalog([
        model("anthropic/decimal-sample", {
          prompt: "0.0000001",
          completion: "0.00000125",
        }),
      ]),
    );

    expect(findRow(rows, "decimal-sample", "input")?.usdPer1M).toBe("0.1");
    expect(findRow(rows, "decimal-sample", "output")?.usdPer1M).toBe("1.25");
  });

  it("ignores a lab we do not track and a billing variant", () => {
    const { rows, warnings } = parseOpenRouter(
      catalog([
        model("anthropic/kept", { prompt: "0.000001", completion: "0.000001" }),
        model("anthropic/kept:free", { prompt: "0", completion: "0" }),
        model("mistral/other", { prompt: "0.000001", completion: "0.000001" }),
      ]),
    );

    expect(rows.map((row) => row.modelSlug)).toEqual(["kept", "kept"]);
    expect(warnings).toEqual(["skipped variant anthropic/kept:free"]);
  });

  it("skips an unknown price and keeps a zero price", () => {
    const { rows, warnings } = parseOpenRouter(
      catalog([
        model("openai/known", { prompt: "0", completion: "0.000002" }),
        model("openai/unknown", { prompt: "-1", completion: "0.000002" }),
      ]),
    );

    expect(rows.map((row) => row.modelSlug)).toEqual(["known", "known"]);
    expect(findRow(rows, "known", "input")?.usdPer1M).toBe("0");
    expect(warnings).toEqual(["skipped unknown price for unknown"]);
  });

  it("throws when a kept price is not a decimal string", () => {
    expect(() =>
      parseOpenRouter(
        catalog([model("anthropic/bad", { prompt: "nope", completion: "0.000001" })]),
      ),
    ).toThrow(/price prompt is not a decimal string for bad/);
  });

  it("throws when no kept row remains", () => {
    expect(() => parseOpenRouter(catalog([model("meta/only", { prompt: "0.000001", completion: "0" })]))).toThrow(
      /no kept chat rows/,
    );
  });
});
