// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The fetch function is fake. Nothing here calls the live pricing page
 * or archive.org. A test source uses its own URL and lab slug, so it does
 * not collide with the seeded Anthropic rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/verify-anthropic.test.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { fetchLog, observationItems, observations, priceVersions, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import {
  failureNote,
  filedNote,
  requireChangedObservationId,
  verifyAnthropicSource,
} from "@/server/pipeline/verify-anthropic";
import type { FetchLike, ProviderSource } from "@/server/sources/provider-source";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST_SEEN = new Date("2026-06-02T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-03T16:00:00.000Z");
const JOB_ID = "spn2-eb689466aaf95d8a0a9e21c7b715f7caf3a5b380";
const TIMESTAMP = "20261019182706";
const KEYS = {
  IA_ACCESS_KEY: "access-key-test",
  IA_SECRET_KEY: "secret-key-test",
};
const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/anthropic-pricing.md"),
  "utf8",
);

describe("verify result checks", () => {
  it("returns the id when the check stored an observation", () => {
    expect(requireChangedObservationId({ outcome: "changed", observationId: 4 })).toBe(4);
  });

  it("throws when a changed check has no observation", () => {
    expect(() =>
      requireChangedObservationId({ outcome: "changed", observationId: null }),
    ).toThrow(/observation/);
  });

  it("keeps a real error message and replaces a blank failure", () => {
    expect(failureNote(new Error("HTTP 403"), "download failed")).toBe("HTTP 403");
    expect(failureNote(new Error("   "), "download failed")).toBe("download failed");
    expect(failureNote("boom", "download failed")).toBe("download failed");
  });

  it("throws when a filed check has no note", () => {
    expect(() => filedNote(null)).toThrow(/without a note/);
    expect(() => filedNote("   ")).toThrow(/without a note/);
    expect(filedNote("missing tracked model: example")).toBe("missing tracked model: example");
  });
});

describe.skipIf(databaseUrl.length === 0)("verifyAnthropicSource", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const parsed = parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    const opened = createDb(parsed.databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("throws before any download when the source row is missing", async () => {
    await withEvidence(async (tx) => {
      const pageUrl = uniquePageUrl();
      const network = forbiddenFetch();
      await expect(
        verifyAnthropicSource(tx, {
          source: testSource({
            labSlug: uniqueSlug("lab"),
            pageUrl,
            fetchPage: downloadingPage(pageUrl),
          }),
          fetchedAt: FIRST_SEEN,
          fetchImpl: network.fetchImpl,
          env: KEYS,
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(new RegExp(`source ${escapeRegExp(pageUrl)} does not exist`));
      expect(network.calls()).toBe(0);
    });
  });

  it("throws before any download when the source is inactive", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSource(tx, { active: false });
      const network = forbiddenFetch();
      await expect(verifyAnthropicSource(tx, visit(planted, network.fetchImpl))).rejects.toThrow(
        /inactive/,
      );
      expect(network.calls()).toBe(0);
    });
  });

  it("throws before any download when the source is not an official page", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSource(tx, { type: "aggregator" });
      const network = forbiddenFetch();
      await expect(verifyAnthropicSource(tx, visit(planted, network.fetchImpl))).rejects.toThrow(
        /not an official page/,
      );
      expect(network.calls()).toBe(0);
    });
  });

  it("records a network failure and does not ask Wayback", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, {
        error: new Error("getaddrinfo ENOTFOUND example.test"),
      });

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result).toEqual({
        kind: "fetch_error",
        note: "getaddrinfo ENOTFOUND example.test",
      });
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
      expect(await logsFor(tx, planted.sourceId)).toEqual([
        expect.objectContaining({
          outcome: "fetch_error",
          httpStatus: null,
          observationId: null,
          note: "getaddrinfo ENOTFOUND example.test",
        }),
      ]);
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("records HTTP 403 as a failed download and does not parse the body", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { status: 403, body: fixture });

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("fetch_error");
      if (result.kind !== "fetch_error") {
        return;
      }
      expect(result.note).toMatch(/HTTP 403/);
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
      const logs = await logsFor(tx, planted.sourceId);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        outcome: "fetch_error",
        httpStatus: null,
        observationId: null,
      });
    });
  });

  it("records a download failure when the thrown value is not an Error", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: fixture });
      const source = testSource({
        labSlug: planted.labSlug,
        pageUrl: planted.pageUrl,
        fetchPage: async () => {
          throw "boom";
        },
      });

      const result = await verifyAnthropicSource(tx, {
        ...visit(planted, network.fetchImpl),
        source,
      });

      expect(result).toEqual({ kind: "fetch_error", note: "download failed" });
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("records a page that is not the pricing table and does not archive it", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: "not a pricing page" });

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("parser_suspect");
      if (result.kind !== "parser_suspect") {
        return;
      }
      expect(result.note).toMatch(/0 matching tables/);
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
      expect(await logsFor(tx, planted.sourceId)).toEqual([
        expect.objectContaining({
          outcome: "parser_suspect",
          httpStatus: 200,
          observationId: null,
        }),
      ]);
    });
  });

  it("records a suspect parse when a tracked model is missing from the page", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx, { modelSlug: uniqueSlug("missing-model") });
      const network = pageFetch(planted.pageUrl, { body: fixture });

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("parser_suspect");
      if (result.kind !== "parser_suspect") {
        return;
      }
      expect(result.note).toMatch(new RegExp(`missing tracked model: ${planted.modelSlug}`));
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("lets an unreadable amount throw and does not archive the page", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: fixture });
      const source = testSource({
        labSlug: planted.labSlug,
        pageUrl: planted.pageUrl,
        fetchPage: downloadingPage(planted.pageUrl),
        parse: () => ({
          rows: [badAmountRow(planted.modelSlug)],
          warnings: [],
        }),
      });

      await expect(
        verifyAnthropicSource(tx, {
          ...visit(planted, network.fetchImpl),
          source,
        }),
      ).rejects.toThrow(/unreadable price amount/);
      expect(network.waybackCalls()).toBe(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("stores a new page, archives it, and does not open a price", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx, { modelSlug: "claude-fable-5.1" });
      const network = pageFetch(planted.pageUrl, { body: fixture, wayback: "success" });
      const before = await priceCount(tx, planted.offeringId);

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") {
        return;
      }
      expect(result.archive).toEqual({
        kind: "archived",
        permalink: waybackPermalink(planted.pageUrl),
      });
      expect(network.waybackCalls()).toBe(2);
      expect(await priceCount(tx, planted.offeringId)).toBe(before);

      const stored = await tx
        .select()
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: result.observationId,
        rawContent: fixture,
        archiveUrl: waybackPermalink(planted.pageUrl),
        archiveStatus: "archived",
      });

      const items = await tx
        .select()
        .from(observationItems)
        .where(eq(observationItems.observationId, result.observationId));
      expect(items).toEqual([
        expect.objectContaining({
          offeringId: planted.offeringId,
          reviewStatus: "flagged",
          groundingResult: null,
        }),
      ]);
    });
  });

  it("does not ask Wayback again when the parsed page is unchanged", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx, { modelSlug: "claude-fable-5.1" });
      const network = pageFetch(planted.pageUrl, { body: fixture, wayback: "success" });
      const first = await verifyAnthropicSource(tx, {
        ...visit(planted, network.fetchImpl),
        fetchedAt: FIRST_SEEN,
      });
      expect(first.kind).toBe("changed");
      const waybackAfterFirst = network.waybackCalls();

      const second = await verifyAnthropicSource(tx, {
        ...visit(planted, network.fetchImpl),
        fetchedAt: NEXT_SEEN,
      });

      expect(second).toEqual({ kind: "unchanged" });
      expect(network.waybackCalls()).toBe(waybackAfterFirst);
      expect(await observationCount(tx, planted.sourceId)).toBe(1);
    });
  });

  it("keeps the snapshot when Wayback fails and does not throw", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx, { modelSlug: "claude-fable-5.1" });
      const network = pageFetch(planted.pageUrl, { body: fixture, wayback: "error" });

      const result = await verifyAnthropicSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") {
        return;
      }
      expect(result.archive.kind).toBe("failed");
      const stored = await tx
        .select()
        .from(observations)
        .where(eq(observations.id, result.observationId));
      expect(stored[0]).toMatchObject({
        rawContent: fixture,
        archiveUrl: null,
        archiveStatus: "failed",
      });
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("leaves the snapshot pending when the Internet Archive keys are missing", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx, { modelSlug: "claude-fable-5.1" });
      const network = pageFetch(planted.pageUrl, { body: fixture, wayback: "success" });

      await expect(
        verifyAnthropicSource(tx, {
          ...visit(planted, network.fetchImpl),
          env: {},
        }),
      ).rejects.toThrow(/IA_ACCESS_KEY/);

      expect(network.waybackCalls()).toBe(0);
      const stored = await tx
        .select()
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        archiveUrl: null,
        archiveStatus: "pending",
      });
    });
  });

  async function withEvidence(run: (tx: EvidenceDb) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
        throw new RolledBack();
      });
    } catch (error) {
      if (error instanceof RolledBack) {
        return;
      }
      throw error;
    }
  }
});

class RolledBack extends Error {
  constructor() {
    super("verify test rolled back");
    this.name = "RolledBack";
  }
}

type PlantedSource = {
  sourceId: number;
  pageUrl: string;
  labSlug: string;
};

type PlantedTracked = PlantedSource & {
  modelSlug: string;
  offeringId: number;
};

async function plantSource(
  tx: EvidenceDb,
  options: { active?: boolean; type?: "official" | "aggregator" } = {},
): Promise<PlantedSource> {
  const pageUrl = uniquePageUrl();
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({
        url: pageUrl,
        type: options.type ?? "official",
        active: options.active ?? true,
      })
      .returning(),
    "insert source",
  );
  return { sourceId: source.id, pageUrl, labSlug: uniqueSlug("lab") };
}

async function plantTracked(
  tx: EvidenceDb,
  options: { modelSlug?: string } = {},
): Promise<PlantedTracked> {
  const catalog = createCatalogRepository(tx);
  const labSlug = uniqueSlug("lab");
  const modelSlug = options.modelSlug ?? "claude-fable-5.1";
  const lab = await catalog.insertLab({ name: "Example Lab", slug: labSlug });
  const model = await catalog.insertModel({
    labId: lab.id,
    name: "Example Model",
    slug: modelSlug,
  });
  const offering = await catalog.insertOffering({
    modelId: model.id,
    platform: "official-api",
  });
  const pageUrl = uniquePageUrl();
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url: pageUrl, type: "official" })
      .returning(),
    "insert source",
  );
  return {
    sourceId: source.id,
    pageUrl,
    labSlug,
    modelSlug,
    offeringId: offering.id,
  };
}

function visit(planted: PlantedSource, fetchImpl: FetchLike): Parameters<typeof verifyAnthropicSource>[1] {
  return {
    source: testSource({
      labSlug: planted.labSlug,
      pageUrl: planted.pageUrl,
      fetchPage: downloadingPage(planted.pageUrl),
      parse: parseAnthropicPricing,
    }),
    fetchedAt: FIRST_SEEN,
    fetchImpl,
    env: KEYS,
    now: () => 0,
    sleep: async () => {},
  };
}

function testSource(input: {
  labSlug: string;
  pageUrl: string;
  fetchPage: ProviderSource["fetchPage"];
  parse?: ProviderSource["parse"];
}): ProviderSource {
  return {
    lab: input.labSlug,
    url: input.pageUrl,
    fetchPage: input.fetchPage,
    parse: input.parse ?? parseAnthropicPricing,
  };
}

function downloadingPage(pageUrl: string): ProviderSource["fetchPage"] {
  return async (fetchImpl) => {
    const response = await fetchImpl(pageUrl);
    if (!response.ok) {
      throw new Error(`pricing page fetch failed: HTTP ${response.status} for ${pageUrl}`);
    }
    const rawContent = await response.text();
    if (rawContent.trim() === "") {
      throw new Error(`pricing page was empty: ${pageUrl}`);
    }
    return { url: pageUrl, httpStatus: response.status, rawContent };
  };
}

function forbiddenFetch(): { fetchImpl: FetchLike; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("fetch should not be called");
    },
  };
}

function pageFetch(
  pageUrl: string,
  input: {
    status?: number;
    body?: string;
    error?: Error;
    wayback?: "success" | "error";
  },
): { fetchImpl: FetchLike; waybackCalls: () => number } {
  let waybackCalls = 0;
  let waybackStep = 0;
  const fetchImpl: FetchLike = async (url) => {
    if (url.startsWith("https://web.archive.org/")) {
      waybackCalls += 1;
      // A stuck poll would spin until the test timeout, because the fake
      // clock never moves. Two calls are a submit and one status check.
      if (waybackCalls > 4) {
        throw new Error(`wayback loop at step ${waybackStep} for ${url}`);
      }
      if (waybackStep === 0) {
        waybackStep += 1;
        return jsonResponse(200, { url: pageUrl, job_id: JOB_ID });
      }
      if (input.wayback === "error") {
        return jsonResponse(200, {
          status: "error",
          message: "Couldn't resolve host",
          job_id: JOB_ID,
        });
      }
      return jsonResponse(200, {
        status: "success",
        job_id: JOB_ID,
        timestamp: TIMESTAMP,
        original_url: pageUrl,
      });
    }
    if (url !== pageUrl) {
      throw new Error(`unexpected url ${url}`);
    }
    if (input.error) {
      throw input.error;
    }
    return new Response(input.body ?? "", { status: input.status ?? 200 });
  };
  return { fetchImpl, waybackCalls: () => waybackCalls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function waybackPermalink(pageUrl: string): string {
  return `https://web.archive.org/web/${TIMESTAMP}/${pageUrl}`;
}

function badAmountRow(modelSlug: string): NormalizedPrice {
  return {
    provider: "anthropic",
    modelName: "Example Model",
    modelSlug,
    dimension: "input",
    usdPer1M: "nope",
    source: "official",
  };
}

async function logsFor(tx: EvidenceDb, sourceId: number) {
  return tx
    .select()
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(asc(fetchLog.id));
}

async function observationCount(tx: EvidenceDb, sourceId: number): Promise<number> {
  const rows = await tx
    .select({ id: observations.id })
    .from(observations)
    .where(eq(observations.sourceId, sourceId));
  return rows.length;
}

async function priceCount(tx: EvidenceDb, offeringId: number): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId));
  return rows.length;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function uniquePageUrl(): string {
  return `https://example.test/pricing/${uniqueSlug("page")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
