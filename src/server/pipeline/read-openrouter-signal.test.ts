// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back.
 *
 * The reader sees every Anthropic, OpenAI, and Google model already in
 * the database. Assertions look at the model this test planted.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/read-openrouter-signal.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import { readLiteLLMSignal } from "@/server/pipeline/read-litellm-signal";
import { readOpenRouterSignal } from "@/server/pipeline/read-openrouter-signal";
import type { SignalDb } from "@/server/pipeline/store-witness-read";
import {
  candidateModels,
  labs,
  modelAliases,
  models,
  offerings,
  priceComponents,
  priceVersions,
  sources,
  verificationFlags,
  witnessReads,
} from "@/server/db/schema";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST = new Date("2099-01-01T00:00:00.000Z");
const SECOND = new Date("2099-01-02T00:00:00.000Z");
const LATER_LITELLM = new Date("2099-06-01T00:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("readOpenRouterSignal", () => {
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

  it("stores a disagreement on the first read and does not publish a price", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      const before = await versionsFor(tx, planted.offeringId);
      const seen: string[] = [];
      const result = await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: async (url) => {
          seen.push(url);
          return jsonResponse(
            catalog([
              {
                id: `anthropic/${planted.alias}`,
                name: "Planted model",
                prompt: "0.00002",
              },
            ]),
          );
        },
      });

      expect(seen).toEqual([OPENROUTER_MODELS_URL]);
      expect(result).toMatchObject({ kind: "ok", isBaseline: true, newModelCount: 0 });
      expect(await flagsFor(tx, planted.offeringId)).toEqual([
        { ourValue: "10", aggregatorValue: "20", dimension: "input" },
      ]);
      expect(await versionsFor(tx, planted.offeringId)).toEqual(before);
    });
  });

  it("opens one card with the display name for a slug the previous read did not see", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00001" }]),
        ),
      });
      const result = await readOpenRouterSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(
          catalog([
            { id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00001" },
            { id: "anthropic/brand-new-model", name: "Anthropic: Brand New", prompt: "0.00001" },
          ]),
        ),
      });

      expect(result).toMatchObject({ kind: "ok", isBaseline: false, newModelCount: 1 });
      const cards = await tx
        .select({
          rawSlug: candidateModels.rawSlug,
          rawName: candidateModels.rawName,
          status: candidateModels.status,
        })
        .from(candidateModels)
        .where(eq(candidateModels.rawSlug, "brand-new-model"));
      expect(cards).toEqual([
        { rawSlug: "brand-new-model", rawName: "Anthropic: Brand New", status: "pending_review" },
      ]);
    });
  });

  it("leaves the previous disagreement in place when the download fails", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00002" }]),
        ),
      });
      const result = await readOpenRouterSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: async () => {
          throw new Error("network down");
        },
      });

      expect(result.kind).toBe("fetch_error");
      expect(await flagsFor(tx, planted.offeringId)).toHaveLength(1);
    });
  });

  it("keeps a resolved flag when the next read replaces the open disagreements", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00002" }]),
        ),
      });
      await tx
        .update(verificationFlags)
        .set({ resolvedAt: FIRST, resolution: "human_confirmed" })
        .where(eq(verificationFlags.offeringId, planted.offeringId));

      await readOpenRouterSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00003" }]),
        ),
      });

      const flags = await tx
        .select({
          aggregatorValue: verificationFlags.aggregatorValue,
          resolvedAt: verificationFlags.resolvedAt,
        })
        .from(verificationFlags)
        .where(eq(verificationFlags.offeringId, planted.offeringId));
      expect(flags.sort((left, right) => left.aggregatorValue.localeCompare(right.aggregatorValue))).toEqual([
        { aggregatorValue: "20", resolvedAt: FIRST },
        { aggregatorValue: "30", resolvedAt: null },
      ]);
    });
  });

  it("does not let a later LiteLLM read block an earlier OpenRouter read", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      await readLiteLLMSignal(tx, {
        fetchedAt: LATER_LITELLM,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001 })),
      });

      const result = await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00001" }]),
        ),
      });

      expect(result.kind).toBe("ok");
      const reads = await tx
        .select({ url: sources.url })
        .from(witnessReads)
        .innerJoin(sources, eq(witnessReads.sourceId, sources.id))
        .where(eq(witnessReads.fetchedAt, FIRST));
      expect(reads).toEqual([{ url: OPENROUTER_MODELS_URL }]);
    });
  });

  it("throws when this source's own read is earlier than its latest read", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx);
      await readOpenRouterSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00001" }]),
        ),
      });

      await expect(
        readOpenRouterSignal(tx, {
          fetchedAt: FIRST,
          fetchImpl: fakeFetch(
            catalog([{ id: `anthropic/${planted.alias}`, name: "Planted model", prompt: "0.00001" }]),
          ),
        }),
      ).rejects.toThrow(/earlier than the latest witness read/);
    });
  });

  it("links the page slug when a hyphen alias is also stored", async () => {
    await withRollback(async (tx) => {
      const planted = await plantModel(tx, { withHyphenAlias: true });
      const result = await readOpenRouterSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(
          catalog([{ id: `anthropic/${planted.modelSlug}`, name: "Planted model", prompt: "0.00001" }]),
        ),
      });

      expect(result).toMatchObject({ kind: "ok", disagreementCount: 0 });
      const flags = await flagsFor(tx, planted.offeringId);
      expect(flags).toEqual([]);
      const cards = await tx
        .select({ rawSlug: candidateModels.rawSlug })
        .from(candidateModels)
        .innerJoin(sources, eq(candidateModels.sourceId, sources.id))
        .where(and(eq(sources.url, OPENROUTER_MODELS_URL), eq(candidateModels.rawSlug, planted.hyphenAlias)));
      expect(cards).toEqual([]);
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
    super("openrouter signal test rolled back");
    this.name = "RolledBack";
  }
}

async function plantModel(
  tx: SignalDb,
  options: { withHyphenAlias?: boolean } = {},
): Promise<{ modelId: number; offeringId: number; modelSlug: string; alias: string; hyphenAlias: string }> {
  const suffix = randomUUID();
  const labRows = await tx.select({ id: labs.id }).from(labs).where(eq(labs.slug, "anthropic")).limit(1);
  const lab =
    labRows[0] ??
    requireInsertedRow(
      await tx.insert(labs).values({ name: "Anthropic", slug: "anthropic" }).returning(),
      "lab",
    );
  const modelSlug = `signal-${suffix}`;
  const model = requireInsertedRow(
    await tx
      .insert(models)
      .values({ labId: lab.id, name: `Signal ${suffix}`, slug: modelSlug })
      .returning(),
    "model",
  );
  const alias = `signal-alias-${suffix}`;
  const hyphenAlias = `signal-alias-${suffix}-hyphen`;
  await tx.insert(modelAliases).values({
    modelId: model.id,
    alias: options.withHyphenAlias ? hyphenAlias : alias,
    kind: "aggregator_slug",
  });
  const offering = requireInsertedRow(
    await tx
      .insert(offerings)
      .values({ modelId: model.id, platform: "official-api", region: "global" })
      .returning(),
    "offering",
  );
  const version = requireInsertedRow(
    await tx.insert(priceVersions).values({ offeringId: offering.id, firstSeenAt: FIRST }).returning({
      id: priceVersions.id,
    }),
    "price version",
  );
  await tx.insert(priceComponents).values({
    priceVersionId: version.id,
    dimension: "input",
    unit: "usd_per_1m_tokens",
    amount: "10",
  });
  return { modelId: model.id, offeringId: offering.id, modelSlug, alias, hyphenAlias };
}

async function versionsFor(tx: SignalDb, offeringId: number): Promise<number[]> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId));
  return rows.map((row) => row.id);
}

async function flagsFor(
  tx: SignalDb,
  offeringId: number,
): Promise<{ ourValue: string; aggregatorValue: string; dimension: string }[]> {
  return tx
    .select({
      ourValue: verificationFlags.ourValue,
      aggregatorValue: verificationFlags.aggregatorValue,
      dimension: verificationFlags.dimension,
    })
    .from(verificationFlags)
    .where(and(eq(verificationFlags.offeringId, offeringId), eq(verificationFlags.dimension, "input")));
}

function catalog(models: { id: string; name: string; prompt: string }[]): string {
  return JSON.stringify({
    data: models.map((model) => ({
      id: model.id,
      name: model.name,
      pricing: { prompt: model.prompt, completion: model.prompt },
    })),
  });
}

function costMap(inputs: Record<string, number>): string {
  const body: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(inputs)) {
    body[key] = {
      litellm_provider: "anthropic",
      mode: "chat",
      input_cost_per_token: input,
      output_cost_per_token: input,
    };
  }
  return JSON.stringify(body);
}

function fakeFetch(body: string): () => Promise<Response> {
  return async () => jsonResponse(body);
}

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200 });
}
