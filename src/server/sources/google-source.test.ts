import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOOGLE_LAB_SLUG, GOOGLE_PRICING_URL } from "@/server/db/google-catalog";
import { googleSource } from "@/server/sources/google-source";
import type { FetchLike } from "@/server/sources/provider-source";

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/google-pricing.2026-10-18.html"),
  "utf8",
);

const CHINESE_PAGE = `<!doctype html>
<html lang="zh">
  <head>
    <link rel="alternate" hreflang="en" href="https://ai.google.dev/gemini-api/docs/pricing" />
  </head>
  <body><p>价格</p></body>
</html>`;

const NO_STANDARD_TABLE = `<!doctype html>
<html lang="en">
  <body><p>not a pricing page</p></body>
</html>`;

function fakeFetch(status: number, body: string): FetchLike {
  return async () => new Response(body, { status });
}

describe("googleSource", () => {
  it("uses the English pricing URL the catalog records", () => {
    expect(GOOGLE_PRICING_URL).toBe("https://ai.google.dev/gemini-api/docs/pricing?hl=en");
    expect(googleSource.url).toBe(GOOGLE_PRICING_URL);
    expect(googleSource.url).toContain("?hl=en");
    expect(googleSource.lab).toBe(GOOGLE_LAB_SLUG);
  });

  it("requests English and parses the hand-checked Argon price", async () => {
    let requestedUrl = "";
    let userAgent = "";
    let acceptLanguage = "";
    let sawTimeout = false;
    const fetchImpl: FetchLike = async (url, init) => {
      requestedUrl = url;
      const headers = new Headers(init?.headers);
      userAgent = headers.get("user-agent") ?? "";
      acceptLanguage = headers.get("accept-language") ?? "";
      sawTimeout = init?.signal instanceof AbortSignal;
      return new Response(fixture, { status: 200 });
    };

    const page = await googleSource.fetchPage(fetchImpl);
    const parsed = googleSource.parse(page.rawContent);
    const row = parsed.rows.find(
      (price) =>
        price.modelSlug === "gemini-4-argon" &&
        price.dimension === "input" &&
        price.validUntil === "2026-11-30",
    );

    expect(requestedUrl).toBe(googleSource.url);
    expect(userAgent).toMatch(/PriceTrail/);
    expect(acceptLanguage).toBe("en");
    expect(sawTimeout).toBe(true);
    expect(page).toEqual({
      url: googleSource.url,
      httpStatus: 200,
      rawContent: fixture,
    });
    expect(row).toMatchObject({
      provider: "google",
      modelName: "Gemini 4 Argon",
      usdPer1M: "2",
      source: "official",
    });
    expect(parsed.warnings.some((warning) => /storage price/i.test(warning))).toBe(true);
  });

  it("throws on HTTP 403 even when the body contains real prices", async () => {
    await expect(googleSource.fetchPage(fakeFetch(403, fixture))).rejects.toThrow(/HTTP 403/);
  });

  it("throws when the page body is empty", async () => {
    await expect(googleSource.fetchPage(fakeFetch(200, ""))).rejects.toThrow(/empty/i);
    await expect(googleSource.fetchPage(fakeFetch(200, " \n\t"))).rejects.toThrow(/empty/i);
  });

  it("throws when the download fails", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND ai.google.dev");
    };

    await expect(googleSource.fetchPage(fetchImpl)).rejects.toThrow(/ENOTFOUND ai.google.dev/);
  });

  it("lets a page that is not English fail in the parser", async () => {
    const page = await googleSource.fetchPage(fakeFetch(200, CHINESE_PAGE));

    expect(() => googleSource.parse(page.rawContent)).toThrow(/html lang/i);
  });

  it("lets a page with no Standard table fail in the parser", async () => {
    const page = await googleSource.fetchPage(fakeFetch(200, NO_STANDARD_TABLE));

    expect(() => googleSource.parse(page.rawContent)).toThrow(/0 Standard pricing tables/);
  });
});
