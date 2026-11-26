// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing.
 * Each one rolls its transaction back. The fetch implementation is a
 * fake, so the live model lists are not called.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/read-official-model-lists.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { findModelDetail } from "@/server/db/repositories/model-detail";
import { parseDatabaseEnv } from "@/server/env";
import { readOfficialModelLists, type OfficialModelListKeys } from "@/server/pipeline/read-official-model-lists";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { rejectCandidateModel } from "@/server/review/reject-candidate";
import {
  candidateModels,
  modelLimits,
  offerings,
  priceVersions,
  sources,
  witnessReads,
} from "@/server/db/schema";
import type { FetchLike } from "@/server/sources/provider-source";
import {
  ANTHROPIC_MODELS_URL,
  GOOGLE_MODELS_URL,
  OFFICIAL_MODEL_LIST_URLS,
  OPENAI_MODELS_URL,
  type OfficialListLab,
} from "@/server/sources/official-model-list";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST = new Date("2026-11-26T12:00:00.000Z");
const SECOND = new Date("2026-11-26T18:00:00.000Z");
const THIRD = new Date("2026-11-26T20:00:00.000Z");
const KEYS: OfficialModelListKeys = {
  openai: "openai-test-key",
  anthropic: "anthropic-test-key",
  google: "google-test-key",
};

describe.skipIf(databaseUrl.length === 0)("readOfficialModelLists", { timeout: 20_000 }, () => {
  let db: ReturnType<typeof createDb>["db"];
  let close: ReturnType<typeof createDb>["close"];

  beforeAll(() => {
    const opened = createDb(parseDatabaseEnv({ DATABASE_URL: databaseUrl }).databaseUrl);
    db = opened.db;
    close = opened.close;
  });

  afterAll(async () => {
    await close();
  });

  it("stores token limits on the first read and opens no card", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      const anthropic = await plant(tx, "anthropic");
      const mythos = await plant(tx, "anthropic");
      const openai = await plant(tx, "openai");
      const google = await plant(tx, "google");
      const seen: string[] = [];
      const result = await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists(seen, {
          openai: { data: [{ id: openai.slug, created: 1, owned_by: "openai" }] },
          anthropic: {
            data: [
              {
                id: anthropic.slug,
                display_name: "Tracked",
                max_input_tokens: 1_000_000,
                max_tokens: 128_000,
                lifecycle: "active",
              },
            ],
            has_more: false,
          },
          google: [
            { models: [], nextPageToken: "1" },
            {
              models: [
                {
                  name: `models/${google.slug}`,
                  displayName: "Tracked",
                  inputTokenLimit: 1_048_576,
                  outputTokenLimit: 32_768,
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
            },
          ],
        }),
      });

      expect(result.labs.map((lab) => lab.kind)).toEqual(["ok", "ok", "ok"]);
      expect(result.labs[0]).toMatchObject({ isBaseline: true, newModelCount: 0, limitCount: 0 });
      expect(result.labs[1]).toMatchObject({ isBaseline: true, limitCount: 1, newModelCount: 0 });
      expect(result.labs[2]).toMatchObject({ isBaseline: true, limitCount: 1, newModelCount: 0 });
      expect(seen.every((url) => !url.includes("test-key"))).toBe(true);
      expect(await limitsFor(tx, openai.id)).toEqual([]);
      expect(await limitsFor(tx, anthropic.id)).toEqual([
        { maxInputTokens: 1_000_000, maxOutputTokens: 128_000, observedAt: FIRST },
      ]);
      expect(await limitsFor(tx, google.id)).toEqual([
        { maxInputTokens: 1_048_576, maxOutputTokens: 32_768, observedAt: FIRST },
      ]);
      expect(await cardBodies(tx)).toEqual([]);
      expect(await priceCount(tx, mythos.id)).toBe(0);
      const detail = await findModelDetail(tx, "anthropic", anthropic.slug);
      expect(detail?.tokenLimit).toMatchObject({
        maxInputTokens: 1_000_000,
        maxOutputTokens: 128_000,
        listName: "Anthropic",
      });
    });
  });

  it("leaves the old limit when that lab's later download fails", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      const anthropic = await plant(tx, "anthropic");
      const google = await plant(tx, "google");
      await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          anthropic: anthropicBody(anthropic.slug, 1_000_000, 128_000),
          google: [googleBody(google.slug, 100, 50)],
        }),
      });

      const result = await readOfficialModelLists(tx, {
        fetchedAt: SECOND,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          fail: ["anthropic"],
          google: [googleBody(google.slug, 200, 80)],
        }),
      });

      expect(result.labs.find((lab) => lab.lab === "anthropic")).toMatchObject({ kind: "fetch_error" });
      expect(result.labs.find((lab) => lab.lab === "google")).toMatchObject({ kind: "ok", limitCount: 1 });
      expect(await limitsFor(tx, anthropic.id)).toEqual([
        { maxInputTokens: 1_000_000, maxOutputTokens: 128_000, observedAt: FIRST },
      ]);
      expect(await limitsFor(tx, google.id)).toEqual([
        { maxInputTokens: 200, maxOutputTokens: 80, observedAt: SECOND },
      ]);
    });
  });

  it("skips a missing key and does not call that lab", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      const anthropic = await plant(tx, "anthropic");
      await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists([], { anthropic: anthropicBody(anthropic.slug, 10, 20) }),
      });
      const seen: string[] = [];
      const result = await readOfficialModelLists(tx, {
        fetchedAt: SECOND,
        keys: { ...KEYS, anthropic: null },
        fetchImpl: fakeLists(seen, { anthropic: anthropicBody(anthropic.slug, 1, 1) }),
      });

      expect(result.labs.find((lab) => lab.lab === "anthropic")).toEqual({
        lab: "anthropic",
        kind: "skipped",
        reason: "missing key",
      });
      expect(seen.some((url) => url.startsWith(ANTHROPIC_MODELS_URL))).toBe(false);
      expect(await limitsFor(tx, anthropic.id)).toEqual([
        { maxInputTokens: 10, maxOutputTokens: 20, observedAt: FIRST },
      ]);
    });
  });

  it("cards a new name and a new shutdown, and skips a dated snapshot", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      const openai = await plant(tx, "openai");
      const mythos = await plant(tx, "openai");
      await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          openai: { data: [{ id: openai.slug, owned_by: "openai" }] },
        }),
      });

      const fresh = `fresh-${randomUUID()}`;
      const result = await readOfficialModelLists(tx, {
        fetchedAt: SECOND,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          openai: {
            data: [
              { id: openai.slug, owned_by: "openai", shutdown_date: "2027-06-01" },
              { id: fresh, owned_by: "openai" },
              { id: "gpt-5.4-2026-03-05", owned_by: "openai", shutdown_date: "2026-04-01" },
              { id: "gpt-4o-mini-tts", owned_by: "openai" },
            ],
          },
        }),
      });

      expect(result.labs.find((lab) => lab.lab === "openai")).toMatchObject({
        kind: "ok",
        isBaseline: false,
        newModelCount: 1,
        retirementCount: 1,
        limitCount: 0,
      });
      expect(await cardBodies(tx)).toEqual([
        { rawSlug: fresh, kind: "new_name", hint: null, status: "pending_review" },
        {
          rawSlug: openai.slug,
          kind: "retirement",
          hint: "Shutdown date 2027-06-01.",
          status: "pending_review",
        },
      ]);
      const detail = await findModelDetail(tx, "openai", mythos.slug);
      expect(detail?.deprecatedAt).toBeNull();
      expect(detail?.tokenLimit).toBeNull();
      expect(await priceCount(tx, openai.id)).toBe(0);
    });
  });

  it("cards a model that appears only on the retired query after the baseline", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists([], { anthropic: { data: [], has_more: false } }),
      });
      const result = await readOfficialModelLists(tx, {
        fetchedAt: SECOND,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          anthropic: { data: [], has_more: false },
          anthropicRetired: {
            data: [
              {
                id: "claude-old",
                display_name: "Claude Old",
                lifecycle: "retired",
                max_input_tokens: 200_000,
                max_tokens: 8_192,
              },
            ],
            has_more: false,
          },
        }),
      });

      expect(result.labs.find((lab) => lab.lab === "anthropic")).toMatchObject({
        newModelCount: 0,
        retirementCount: 1,
      });
      expect(await cardBodies(tx)).toEqual([
        {
          rawSlug: "claude-old",
          kind: "retirement",
          hint: "Lifecycle retired.",
          status: "pending_review",
        },
      ]);
    });
  });

  it("does not open another card after reject", async () => {
    await withRollback(async (tx) => {
      await clearLists(tx);
      const slug = `fresh-${randomUUID()}`;
      await readOfficialModelLists(tx, {
        fetchedAt: FIRST,
        keys: KEYS,
        fetchImpl: fakeLists([], { anthropic: { data: [], has_more: false } }),
      });
      await readOfficialModelLists(tx, {
        fetchedAt: SECOND,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          anthropic: {
            data: [{ id: slug, display_name: "Fresh", lifecycle: "active" }],
            has_more: false,
          },
        }),
      });
      const card = await cards(tx);
      expect(card).toHaveLength(1);
      await rejectCandidateModel(tx, {
        candidateId: card[0]?.id ?? 0,
        note: "Not this one.",
        reviewedBy: "google:reviewer1",
        reviewedAt: SECOND,
      });
      await readOfficialModelLists(tx, {
        fetchedAt: THIRD,
        keys: KEYS,
        fetchImpl: fakeLists([], {
          anthropic: {
            data: [{ id: slug, display_name: "Fresh", lifecycle: "active" }],
            has_more: false,
          },
        }),
      });

      expect(await cardBodies(tx)).toEqual([
        { rawSlug: slug, kind: "new_name", hint: null, status: "rejected" },
      ]);
    });
  });

  async function withRollback(run: (tx: SignalDb) => Promise<void>): Promise<void> {
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
    super("official model list test rolled back");
    this.name = "RolledBack";
  }
}

async function clearLists(tx: SignalDb): Promise<void> {
  for (const url of OFFICIAL_MODEL_LIST_URLS) {
    const rows = await tx.select({ id: sources.id }).from(sources).where(eq(sources.url, url));
    const sourceId = rows[0]?.id;
    if (sourceId === undefined) {
      continue;
    }
    await tx.delete(candidateModels).where(eq(candidateModels.sourceId, sourceId));
    await tx.delete(witnessReads).where(eq(witnessReads.sourceId, sourceId));
  }
}

async function plant(tx: SignalDb, lab: OfficialListLab): Promise<{ id: number; slug: string }> {
  const catalog = createCatalogRepository(tx);
  const names = { openai: "OpenAI", anthropic: "Anthropic", google: "Google" } as const;
  const found = await catalog.findLabBySlug(lab);
  const labRow = found ?? (await catalog.insertLab({ name: names[lab], slug: lab }));
  const slug = `list-${randomUUID()}`;
  const model = await catalog.insertModel({ labId: labRow.id, name: slug, slug });
  await catalog.insertOffering({ modelId: model.id, platform: "official-api" });
  return { id: model.id, slug };
}

async function limitsFor(
  tx: SignalDb,
  modelId: number,
): Promise<{ maxInputTokens: number | null; maxOutputTokens: number | null; observedAt: Date }[]> {
  return tx
    .select({
      maxInputTokens: modelLimits.maxInputTokens,
      maxOutputTokens: modelLimits.maxOutputTokens,
      observedAt: modelLimits.observedAt,
    })
    .from(modelLimits)
    .where(eq(modelLimits.modelId, modelId));
}

async function cards(tx: SignalDb) {
  const rows = await tx
    .select({
      id: candidateModels.id,
      rawSlug: candidateModels.rawSlug,
      kind: candidateModels.kind,
      hint: candidateModels.hint,
      status: candidateModels.status,
    })
    .from(candidateModels)
    .innerJoin(sources, eq(sources.id, candidateModels.sourceId))
    .where(inArray(sources.url, [...OFFICIAL_MODEL_LIST_URLS]));
  return rows.sort((left, right) => left.rawSlug.localeCompare(right.rawSlug));
}

async function cardBodies(tx: SignalDb) {
  const rows = await cards(tx);
  return rows.map((row) => ({
    rawSlug: row.rawSlug,
    kind: row.kind,
    hint: row.hint,
    status: row.status,
  }));
}

async function priceCount(tx: SignalDb, modelId: number): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .innerJoin(offerings, eq(offerings.id, priceVersions.offeringId))
    .where(eq(offerings.modelId, modelId));
  return rows.length;
}

function anthropicBody(slug: string, input: number, output: number) {
  return {
    data: [
      {
        id: slug,
        display_name: "Tracked",
        max_input_tokens: input,
        max_tokens: output,
        lifecycle: "active",
      },
    ],
    has_more: false,
  };
}

function googleBody(slug: string, input: number, output: number) {
  return {
    models: [
      {
        name: `models/${slug}`,
        displayName: "Tracked",
        inputTokenLimit: input,
        outputTokenLimit: output,
        supportedGenerationMethods: ["generateContent"],
      },
    ],
  };
}

function fakeLists(
  seen: string[],
  input: {
    openai?: unknown;
    anthropic?: unknown;
    anthropicRetired?: unknown;
    google?: unknown[];
    fail?: OfficialListLab[];
  },
): FetchLike {
  return async (url) => {
    seen.push(url);
    if (url.includes("test-key")) {
      throw new Error("a model list URL included a key");
    }
    if (url.startsWith(OPENAI_MODELS_URL)) {
      if (input.fail?.includes("openai")) {
        return new Response("no", { status: 500 });
      }
      return json(input.openai ?? { data: [] });
    }
    if (url.startsWith(ANTHROPIC_MODELS_URL)) {
      if (input.fail?.includes("anthropic")) {
        return new Response("no", { status: 500 });
      }
      if (url.includes("lifecycle")) {
        return json(input.anthropicRetired ?? { data: [], has_more: false });
      }
      return json(input.anthropic ?? { data: [], has_more: false });
    }
    if (url.startsWith(GOOGLE_MODELS_URL)) {
      if (input.fail?.includes("google")) {
        return new Response("no", { status: 500 });
      }
      const pages = input.google ?? [{ models: [] }];
      const token = new URL(url).searchParams.get("pageToken");
      const page = token === null ? pages[0] : pages[Number(token)];
      return json(page ?? { models: [] });
    }
    return new Response("missing", { status: 404 });
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
