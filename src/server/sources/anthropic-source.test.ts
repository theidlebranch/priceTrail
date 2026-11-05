import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_LABS } from "@/server/db/seed-data";
import { anthropicSource } from "@/server/sources/anthropic-source";
import type { FetchLike } from "@/server/sources/provider-source";

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/anthropic-pricing.md"),
  "utf8",
);

const anthropicSeed = SEED_LABS.find((lab) => lab.slug === "anthropic");
const fableInput = anthropicSeed?.models
  .find((model) => model.slug === "claude-fable-5.1")
  ?.components.find((component) => component.dimension === "input");

function fakeFetch(status: number, body: string): FetchLike {
  return async () => new Response(body, { status });
}

describe("anthropicSource", () => {
  it("uses the same pricing URL the seed already records", () => {
    expect(anthropicSeed?.sourceUrl).toBe(
      "https://platform.claude.com/docs/en/about-claude/pricing.md",
    );
    expect(anthropicSource.url).toBe(anthropicSeed?.sourceUrl);
  });

  it("downloads the page and parses it into the hand-checked Fable price", async () => {
    let requestedUrl = "";
    let userAgent = "";
    let sawTimeout = false;
    const fetchImpl: FetchLike = async (url, init) => {
      requestedUrl = url;
      userAgent = new Headers(init?.headers).get("user-agent") ?? "";
      sawTimeout = init?.signal instanceof AbortSignal;
      return new Response(fixture, { status: 200 });
    };

    const page = await anthropicSource.fetchPage(fetchImpl);
    const parsed = anthropicSource.parse(page.rawContent);
    const row = parsed.rows.find(
      (price) =>
        price.modelSlug === "claude-fable-5.1" &&
        price.dimension === "input" &&
        price.condition === undefined,
    );

    expect(requestedUrl).toBe(anthropicSource.url);
    expect(userAgent).toMatch(/PriceTrail/);
    expect(sawTimeout).toBe(true);
    expect(page).toEqual({
      url: anthropicSource.url,
      httpStatus: 200,
      rawContent: fixture,
    });
    expect(fableInput?.amount).toBe("10");
    expect(row).toMatchObject({
      provider: "anthropic",
      modelName: "Claude Fable 5.1",
      usdPer1M: fableInput?.amount,
      source: "official",
    });
    expect(parsed.warnings).toEqual(expect.any(Array));
  });

  it("throws on HTTP 403 even when the body contains real prices", async () => {
    await expect(anthropicSource.fetchPage(fakeFetch(403, fixture))).rejects.toThrow(/HTTP 403/);
  });

  it("throws when the page body is empty", async () => {
    await expect(anthropicSource.fetchPage(fakeFetch(200, ""))).rejects.toThrow(/empty/i);
    await expect(anthropicSource.fetchPage(fakeFetch(200, " \n\t"))).rejects.toThrow(/empty/i);
  });

  it("throws when the download fails", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND platform.claude.com");
    };

    await expect(anthropicSource.fetchPage(fetchImpl)).rejects.toThrow(
      /ENOTFOUND platform.claude.com/,
    );
  });

  it("lets a page that is not the pricing table fail in the parser", async () => {
    const page = await anthropicSource.fetchPage(fakeFetch(200, "not a pricing page"));

    expect(() => anthropicSource.parse(page.rawContent)).toThrow(/0 matching tables/);
  });
});
