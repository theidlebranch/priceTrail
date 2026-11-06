import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_LABS } from "@/server/db/seed-data";
import { openaiSource } from "@/server/sources/openai-source";
import type { FetchLike } from "@/server/sources/provider-source";

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/openai-pricing.2026-11-05.md"),
  "utf8",
);

const openaiSeed = SEED_LABS.find((lab) => lab.slug === "openai");
const astraInput = openaiSeed?.models
  .find((model) => model.slug === "gpt-6-astra")
  ?.components.find((component) => component.dimension === "input");

function fakeFetch(status: number, body: string): FetchLike {
  return async () => new Response(body, { status });
}

describe("openaiSource", () => {
  it("uses the same pricing URL the seed already records", () => {
    expect(openaiSeed?.sourceUrl).toBe("https://developers.openai.com/api/docs/pricing.md");
    expect(openaiSource.url).toBe(openaiSeed?.sourceUrl);
    expect(openaiSource.lab).toBe("openai");
  });

  it("downloads the page and parses it into the hand-checked Astra price", async () => {
    let requestedUrl = "";
    let userAgent = "";
    let sawTimeout = false;
    const fetchImpl: FetchLike = async (url, init) => {
      requestedUrl = url;
      userAgent = new Headers(init?.headers).get("user-agent") ?? "";
      sawTimeout = init?.signal instanceof AbortSignal;
      return new Response(fixture, { status: 200 });
    };

    const page = await openaiSource.fetchPage(fetchImpl);
    const parsed = openaiSource.parse(page.rawContent);
    const row = parsed.rows.find(
      (price) =>
        price.modelSlug === "gpt-6-astra" &&
        price.dimension === "input" &&
        price.condition === undefined,
    );

    expect(requestedUrl).toBe(openaiSource.url);
    expect(userAgent).toMatch(/PriceTrail/);
    expect(sawTimeout).toBe(true);
    expect(page).toEqual({
      url: openaiSource.url,
      httpStatus: 200,
      rawContent: fixture,
    });
    expect(astraInput?.amount).toBe("10");
    expect(row).toMatchObject({
      provider: "openai",
      modelName: "gpt-6-astra",
      usdPer1M: astraInput?.amount,
      source: "official",
    });
    expect(parsed.warnings.some((warning) => /needs_threshold/.test(warning))).toBe(true);
  });

  it("throws on HTTP 403 even when the body contains real prices", async () => {
    await expect(openaiSource.fetchPage(fakeFetch(403, fixture))).rejects.toThrow(/HTTP 403/);
  });

  it("throws when the page body is empty", async () => {
    await expect(openaiSource.fetchPage(fakeFetch(200, ""))).rejects.toThrow(/empty/i);
    await expect(openaiSource.fetchPage(fakeFetch(200, " \n\t"))).rejects.toThrow(/empty/i);
  });

  it("throws when the download fails", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND developers.openai.com");
    };

    await expect(openaiSource.fetchPage(fetchImpl)).rejects.toThrow(
      /ENOTFOUND developers.openai.com/,
    );
  });

  it("lets a page that is not the Standard table fail in the parser", async () => {
    const page = await openaiSource.fetchPage(fakeFetch(200, "not a pricing page"));

    expect(() => openaiSource.parse(page.rawContent)).toThrow(/Prices per 1M tokens/);
  });
});
