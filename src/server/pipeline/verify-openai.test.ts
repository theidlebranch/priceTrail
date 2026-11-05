// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The fetch function is fake. Nothing here calls the live pricing page
 * or archive.org.
 *
 * openaiSource always uses the lab slug "openai" and the real pricing URL.
 * pnpm seed may already have those rows, and both values are unique.
 * This file plants its own lab and URL so the test does not write on the
 * seeded source. parse is still openaiSource.parse, and the download
 * still goes through fetchOfficialPage.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/verify-openai.test.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { SEED_LABS } from "@/server/db/seed-data";
import { fetchLog, observationItems, observations, priceVersions, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { verifyOfficialSource } from "@/server/pipeline/verify-official-source";
import { openaiSource } from "@/server/sources/openai-source";
import { fetchOfficialPage, type FetchLike, type ProviderSource } from "@/server/sources/provider-source";

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
  path.join(process.cwd(), "tests/fixtures/openai-pricing.md"),
  "utf8",
);
const NOT_A_PRICING_PAGE = "not a pricing page";

describe.skipIf(databaseUrl.length === 0)("verifyOfficialSource for OpenAI", () => {
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

  it("stores a new page, archives it, and does not open a price", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: fixture });

      const result = await verifyOfficialSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") {
        return;
      }
      expect(result.archive).toEqual({
        kind: "archived",
        permalink: waybackPermalink(planted.pageUrl),
      });
      expect(network.waybackCalls()).toBe(2);
      expect(await priceCount(tx, planted.offeringIds)).toBe(0);

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
      expect(warningList(stored[0]?.parsedData).some((warning) => /needs_threshold/.test(warning))).toBe(
        true,
      );

      const items = await tx
        .select()
        .from(observationItems)
        .where(eq(observationItems.observationId, result.observationId));
      expect(items).toHaveLength(planted.offeringIds.length);
      expect(items.map((item) => item.offeringId).sort((a, b) => a - b)).toEqual(
        [...planted.offeringIds].sort((a, b) => a - b),
      );
      expect(items.every((item) => item.reviewStatus === "flagged" && item.groundingResult === null)).toBe(
        true,
      );
    });
  });

  it("does not ask Wayback again when the parsed page is unchanged", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: fixture });
      const first = await verifyOfficialSource(tx, {
        ...visit(planted, network.fetchImpl),
        fetchedAt: FIRST_SEEN,
      });
      expect(first.kind).toBe("changed");
      const waybackAfterFirst = network.waybackCalls();

      const second = await verifyOfficialSource(tx, {
        ...visit(planted, network.fetchImpl),
        fetchedAt: NEXT_SEEN,
      });

      expect(second).toEqual({ kind: "unchanged" });
      expect(network.waybackCalls()).toBe(waybackAfterFirst);
      const stored = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(1);
      expect(await priceCount(tx, planted.offeringIds)).toBe(0);
    });
  });

  it("records a page that is not the Standard table and does not keep the text", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantTracked(tx);
      const network = pageFetch(planted.pageUrl, { body: NOT_A_PRICING_PAGE });

      const result = await verifyOfficialSource(tx, visit(planted, network.fetchImpl));

      expect(result.kind).toBe("parser_suspect");
      if (result.kind !== "parser_suspect") {
        return;
      }
      expect(result.note).toMatch(/Prices per 1M tokens/);
      expect(result.note).not.toContain(NOT_A_PRICING_PAGE);
      expect(network.waybackCalls()).toBe(0);
      const stored = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(0);
      const logs = await tx
        .select()
        .from(fetchLog)
        .where(eq(fetchLog.sourceId, planted.sourceId));
      expect(logs).toEqual([
        expect.objectContaining({
          outcome: "parser_suspect",
          httpStatus: 200,
          observationId: null,
        }),
      ]);
      expect(logs[0]?.note).not.toContain(NOT_A_PRICING_PAGE);
      expect(await priceCount(tx, planted.offeringIds)).toBe(0);
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

type Planted = {
  sourceId: number;
  pageUrl: string;
  labSlug: string;
  offeringIds: number[];
};

function trackedModelSlugs(): readonly string[] {
  const lab = SEED_LABS.find((entry) => entry.slug === "openai");
  if (lab === undefined) {
    throw new Error("openai seed lab is missing");
  }
  return lab.models.map((model) => model.slug);
}

async function plantTracked(tx: EvidenceDb): Promise<Planted> {
  const catalog = createCatalogRepository(tx);
  const labSlug = `openai-${randomUUID()}`;
  const lab = await catalog.insertLab({ name: "OpenAI test lab", slug: labSlug });
  const offeringIds: number[] = [];
  for (const modelSlug of trackedModelSlugs()) {
    const model = await catalog.insertModel({
      labId: lab.id,
      name: modelSlug,
      slug: modelSlug,
    });
    const offering = await catalog.insertOffering({
      modelId: model.id,
      platform: "official-api",
    });
    offeringIds.push(offering.id);
  }
  const pageUrl = `https://example.test/pricing/${randomUUID()}`;
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url: pageUrl, type: "official" })
      .returning(),
    "insert source",
  );
  return { sourceId: source.id, pageUrl, labSlug, offeringIds };
}

function visit(planted: Planted, fetchImpl: FetchLike): Parameters<typeof verifyOfficialSource>[1] {
  return {
    source: openAiVisitSource(planted),
    fetchedAt: FIRST_SEEN,
    fetchImpl,
    env: KEYS,
    now: () => 0,
    sleep: async () => {},
  };
}

/**
 * Same parser and download rules as production. The lab and URL are the
 * planted ones, so this check does not lock the seeded OpenAI source.
 */
function openAiVisitSource(planted: Planted): ProviderSource {
  return {
    lab: planted.labSlug,
    url: planted.pageUrl,
    fetchPage: (fetchImpl) => fetchOfficialPage(planted.pageUrl, "OpenAI pricing page", fetchImpl),
    parse: openaiSource.parse,
  };
}

function pageFetch(
  pageUrl: string,
  input: { body: string },
): { fetchImpl: FetchLike; waybackCalls: () => number } {
  let waybackCalls = 0;
  let waybackStep = 0;
  const fetchImpl: FetchLike = async (url) => {
    if (url.startsWith("https://web.archive.org/")) {
      waybackCalls += 1;
      if (waybackCalls > 4) {
        throw new Error(`wayback loop at step ${waybackStep} for ${url}`);
      }
      if (waybackStep === 0) {
        waybackStep += 1;
        return jsonResponse(200, { url: pageUrl, job_id: JOB_ID });
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
    return new Response(input.body, { status: 200 });
  };
  return { fetchImpl, waybackCalls: () => waybackCalls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function waybackPermalink(pageUrl: string): string {
  return `https://web.archive.org/web/${TIMESTAMP}/${pageUrl}`;
}

function warningList(value: unknown): string[] {
  if (typeof value !== "object" || value === null || !("warnings" in value)) {
    throw new Error("parsed_data has no warnings");
  }
  const warnings = value.warnings;
  if (!Array.isArray(warnings)) {
    throw new Error("parsed_data warnings are not strings");
  }
  const texts: string[] = [];
  for (const item of warnings) {
    if (typeof item !== "string") {
      throw new Error("parsed_data warnings are not strings");
    }
    texts.push(item);
  }
  return texts;
}

async function priceCount(tx: EvidenceDb, offeringIds: readonly number[]): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(inArray(priceVersions.offeringId, [...offeringIds]));
  return rows.length;
}
