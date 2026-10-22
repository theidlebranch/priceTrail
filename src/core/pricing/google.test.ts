import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGooglePricing } from "./google";
import type { NormalizedPrice } from "./shape";

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/google-pricing.2026-10-18.html"),
  "utf8",
);

type PageRow = {
  label: string;
  free?: string;
  paid: string;
};

function page(options: {
  lang?: string;
  hreflang?: string;
  modelName?: string;
  codes?: string[];
  mode?: string;
  paidHeader?: string;
  rows?: PageRow[];
} = {}): string {
  const lang = options.lang ?? "en";
  const modelName = options.modelName ?? "Gemini Test";
  const codes = options.codes ?? ["gemini-test"];
  const mode = options.mode ?? "standard";
  const paidHeader = options.paidHeader ?? "Paid Tier, per 1M tokens in USD";
  const rows = options.rows ?? [{ label: "Input price", paid: "$1.00" }];
  const hreflang = options.hreflang
    ? `<link rel="alternate" hreflang="${options.hreflang}" href="https://example.com/pricing" />`
    : "";
  const codeMarkup = codes.map((code) => `<code>${code}</code>`).join(" and ");
  const body = rows
    .map(
      (row) =>
        `<tr><td>${row.label}</td><td>${row.free ?? "Free of charge"}</td><td>${row.paid}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}">
  <head>${hreflang}</head>
  <body>
    <div class="heading-group">
      <h2>${modelName}</h2>
      <em>${codeMarkup}</em>
    </div>
    <h3 id="${mode}">${mode}</h3>
    <table class="pricing-table">
      <thead>
        <tr>
          <th></th>
          <th>Free Tier</th>
          <th>${paidHeader}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;
}

function findRow(
  rows: NormalizedPrice[],
  modelSlug: string,
  dimension: string,
  filter: {
    condition?: NormalizedPrice["condition"];
    validFrom?: string;
    validUntil?: string;
  } = {},
) {
  return rows.find((row) => {
    if (row.modelSlug !== modelSlug || row.dimension !== dimension) {
      return false;
    }
    if (
      "condition" in filter &&
      JSON.stringify(row.condition) !== JSON.stringify(filter.condition)
    ) {
      return false;
    }
    if ("validFrom" in filter && row.validFrom !== filter.validFrom) {
      return false;
    }
    if ("validUntil" in filter && row.validUntil !== filter.validUntil) {
      return false;
    }
    return true;
  });
}

describe("parseGooglePricing", () => {
  it("parses Standard schedules, tiers, and leaves Batch and storage out of the rows", () => {
    const { rows, warnings } = parseGooglePricing(fixture);

    const argonInputs = rows.filter(
      (row) => row.modelSlug === "gemini-4-argon" && row.dimension === "input",
    );
    expect(argonInputs).toHaveLength(2);
    expect(findRow(rows, "gemini-4-argon", "input", { validUntil: "2026-11-30" })).toMatchObject({
      provider: "google",
      modelName: "Gemini 4 Argon",
      usdPer1M: "2",
      source: "official",
    });
    expect(findRow(rows, "gemini-4-argon", "input", { validFrom: "2026-12-01" })).toMatchObject({
      usdPer1M: "4",
    });
    expect(
      argonInputs.some((row) => row.validFrom === undefined && row.validUntil === undefined),
    ).toBe(false);
    expect(rows.some((row) => row.modelSlug === "gemini-4-argon" && row.usdPer1M === "1")).toBe(
      false,
    );

    expect(
      findRow(rows, "gemini-2.5-pro", "input", {
        condition: { promptTokensAtMost: 200000 },
      })?.usdPer1M,
    ).toBe("1.25");
    expect(
      findRow(rows, "gemini-2.5-pro", "input", {
        condition: { promptTokensOver: 200000 },
      })?.usdPer1M,
    ).toBe("2.5");
    expect(
      findRow(rows, "gemini-2.5-pro", "output", {
        condition: { promptTokensOver: 200000 },
      })?.usdPer1M,
    ).toBe("15");

    const proCache = rows.filter(
      (row) => row.modelSlug === "gemini-2.5-pro" && row.dimension === "cache_read",
    );
    expect(proCache.map((row) => row.usdPer1M).sort()).toEqual(["0.125", "0.25"]);
    expect(proCache.some((row) => row.usdPer1M === "4.5")).toBe(false);
    expect(
      warnings.some(
        (warning) =>
          /storage price/i.test(warning) &&
          /gemini-2\.5-pro/.test(warning) &&
          /4\.50/.test(warning),
      ),
    ).toBe(true);

    expect(rows.some((row) => row.modelSlug.includes("gemini-3.1-pro-preview"))).toBe(false);
    expect(
      warnings.some(
        (warning) =>
          /multiple model codes/i.test(warning) &&
          /gemini-3.1-pro-preview-customtools/.test(warning),
      ),
    ).toBe(true);
  });

  it("throws when html lang is not English, even if hreflang is en", () => {
    const html = page({ lang: "zh", hreflang: "en" });

    expect(() => parseGooglePricing(html)).toThrow(/html lang/i);
  });

  it("throws when the Paid header is not per 1M tokens", () => {
    const html = page({ paidHeader: "Paid Tier" });

    expect(() => parseGooglePricing(html)).toThrow(/per 1M tokens in USD/i);
  });

  it("throws when a Standard table has two Paid columns", () => {
    const html = page().replace(
      "<th>Paid Tier, per 1M tokens in USD</th>",
      "<th>Paid Tier, per 1M tokens in USD</th><th>Paid Tier, per 1M tokens in USD</th>",
    );

    expect(() => parseGooglePricing(html)).toThrow(/duplicate paid column/i);
  });

  it("throws when the page has no Standard table", () => {
    const html = page({ mode: "batch" });

    expect(() => parseGooglePricing(html)).toThrow(/0 Standard/i);
  });

  it("throws when a Standard table has no model code", () => {
    const html = page({ codes: [] });

    expect(() => parseGooglePricing(html)).toThrow(/0 model codes/i);
  });

  it("throws when a Standard table has no price rows", () => {
    const html = page({ rows: [] });

    expect(() => parseGooglePricing(html)).toThrow(/empty table/i);
  });

  it("throws when a mapped cell is not a known price", () => {
    const html = page({ rows: [{ label: "Input price", paid: "contact sales" }] });

    expect(() => parseGooglePricing(html)).toThrow(/unrecognized cell/i);
  });

  it("throws when a tier phrase is not <= or >", () => {
    const html = page({
      rows: [{ label: "Input price", paid: "$2.00, prompts < 200k tokens" }],
    });

    expect(() => parseGooglePricing(html)).toThrow(/unparseable tier/i);
  });

  it("throws when the same mapped price label appears twice", () => {
    const html = page({
      rows: [
        { label: "Input price", paid: "$1.00" },
        { label: "Input price", paid: "$2.00" },
      ],
    });

    expect(() => parseGooglePricing(html)).toThrow(/duplicate price label/i);
  });

  it("warns on an unmapped label and does not publish that cell", () => {
    const html = page({
      rows: [
        { label: "Input price", paid: "$1.00" },
        { label: "Audio input price", paid: "$9.00" },
      ],
    });

    const { rows, warnings } = parseGooglePricing(html);

    expect(findRow(rows, "gemini-test", "input")?.usdPer1M).toBe("1");
    expect(rows.some((row) => row.usdPer1M === "9")).toBe(false);
    expect(warnings.some((warning) => /unmapped label/i.test(warning) && /Audio input price/.test(warning))).toBe(
      true,
    );
  });

  it("does not turn a modality segment into input or output", () => {
    const html = page({
      rows: [
        { label: "Input price", paid: "$0.50 (text)" },
        { label: "Output price", paid: "$9.00 (audio)" },
        { label: "Context caching price", paid: "$0.20" },
      ],
    });

    const { rows, warnings } = parseGooglePricing(html);

    expect(findRow(rows, "gemini-test", "input")).toBeUndefined();
    expect(findRow(rows, "gemini-test", "output")).toBeUndefined();
    expect(findRow(rows, "gemini-test", "cache_read")?.usdPer1M).toBe("0.2");
    expect(warnings.some((warning) => /unmapped modality/i.test(warning))).toBe(true);
    expect(rows.some((row) => row.usdPer1M === "0.5" || row.usdPer1M === "9")).toBe(false);
  });

  it("warns and emits no rows when one heading lists two model codes", () => {
    const html = page({
      codes: ["gemini-a", "gemini-b"],
      rows: [{ label: "Input price", paid: "$1.00" }],
    });

    const { rows, warnings } = parseGooglePricing(html);

    expect(rows).toEqual([]);
    expect(warnings.some((warning) => /multiple model codes/i.test(warning))).toBe(true);
  });

  it("reads the Paid column and ignores a dollar amount in Free", () => {
    const html = page({
      rows: [{ label: "Input price", free: "$99.00", paid: "$1.50" }],
    });

    const { rows } = parseGooglePricing(html);

    expect(findRow(rows, "gemini-test", "input")?.usdPer1M).toBe("1.5");
    expect(rows.some((row) => row.usdPer1M === "99")).toBe(false);
  });
});
